import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ForecastResponse, HistorySource } from '../types/forecast';

interface ForecastChartProps {
  data: ForecastResponse;
  showFullRange?: boolean;
  historyWindow?: number;
  forecastWindow?: number;
}

const SOURCE_LABEL: Record<HistorySource, string> = {
  observed: 'ข้อมูลจริงจากฐานเดิม',
  manual: 'ข้อมูลที่ผู้ใช้บันทึก',
  synthetic: 'ค่าประมาณเพื่อเชื่อมสัปดาห์',
  seasonal_clone: 'คัดลอกจากปีที่แล้ว',
};

type FillSource = 'synthetic' | 'seasonal_clone' | 'pending';

const ACTUAL_COLORS: Record<'observed' | 'manual', string> = {
  observed: '#2563eb',
  manual: '#16a34a',
};

const FILL_COLORS: Record<FillSource, string> = {
  synthetic: '#f97316',
  seasonal_clone: '#a855f7',
  pending: '#fbbf24',
};

const FILL_LABEL: Record<FillSource, string> = {
  synthetic: 'ข้อมูลเติม (synthetic)',
  seasonal_clone: 'คัดลอกจากปีที่ผ่านมา',
  pending: 'ค่าสมมติระหว่างรอข้อมูลจริง',
};

const DEFAULT_HISTORY_WINDOW = 15;
const DEFAULT_FORECAST_WINDOW = 2;

type ChartRow = {
  date: string;
  actualReal: number | null;
  filledValue: number | null;
  filledLineValue: number | null;
  forecastValue: number | null;
  actualSource?: HistorySource;
  filledSource?: FillSource;
  hasHistory: boolean;
  hasForecast: boolean;
  isPending?: boolean;
  manualConnector?: number | null;
};

function ActualDot(props: any) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }
  const source = (payload?.actualSource as HistorySource) ?? 'observed';
  const color = ACTUAL_COLORS[source as 'observed' | 'manual'] ?? '#2563eb';
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />;
}

function FilledDot(props: any) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }
  const source = (payload?.filledSource as FillSource) ?? 'synthetic';
  const color = FILL_COLORS[source] ?? '#f97316';
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={color} stroke="#fff" strokeWidth={1.5} rx={2} />;
}

const renderTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white/90 dark:bg-gray-900/90 p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-900 dark:text-white">{label}</p>
      {point.actualReal != null && (
        <p className="text-blue-600 dark:text-blue-300">
          ข้อมูลจริง ({SOURCE_LABEL[point.actualSource as HistorySource] ?? 'จริง'}): {point.actualReal.toFixed(1)} ราย
        </p>
      )}
      {point.filledValue != null && (
        <p className="text-amber-600 dark:text-amber-300">
          {FILL_LABEL[(point.filledSource as FillSource) ?? 'synthetic']}: {point.filledValue.toFixed(1)} ราย
        </p>
      )}
      {point.forecastValue != null && (
        <p className="text-red-600 dark:text-red-300">ข้อมูลพยากรณ์: {point.forecastValue.toFixed(1)} ราย</p>
      )}
    </div>
  );
};

export function ForecastChart({
  data,
  showFullRange = false,
  historyWindow = DEFAULT_HISTORY_WINDOW,
  forecastWindow = DEFAULT_FORECAST_WINDOW,
}: ForecastChartProps) {
  const { allRows, compactRows } = useMemo(() => {
    const rowsMap = new Map<string, ChartRow>();
    const getRow = (date: string): ChartRow => {
      if (!rowsMap.has(date)) {
        rowsMap.set(date, {
          date,
          actualReal: null,
          filledValue: null,
          filledLineValue: null,
          forecastValue: null,
          hasHistory: false,
          hasForecast: false,
          manualConnector: null,
        });
      }
      return rowsMap.get(date)!;
    };

    data.history.forEach((point) => {
      const row = getRow(point.ds);
      row.hasHistory = true;
      if (point.source === 'observed' || point.source === 'manual') {
        row.actualReal = point.y;
        row.actualSource = point.source;
      } else {
        row.filledValue = point.y;
        row.filledLineValue = point.y;
        row.filledSource = point.source as FillSource;
      }
    });

    data.pending_weeks.forEach((point) => {
      const row = getRow(point.ds);
      row.filledValue = point.prediction;
       row.filledLineValue = point.prediction;
      row.filledSource = 'pending';
      row.isPending = true;
    });

    data.forecast.forEach((point) => {
      const row = getRow(point.ds);
      row.hasForecast = true;
      row.forecastValue = point.y_pred;
      if (row.actualReal == null && typeof point.actual === 'number' && Number.isFinite(point.actual)) {
        row.actualReal = point.actual;
        row.actualSource = 'observed';
      }
    });

    const rows = Array.from(rowsMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    rows.forEach((row, idx) => {
      if (row.actualSource === 'manual' && row.actualReal != null) {
        row.manualConnector = row.actualReal;
        row.filledLineValue = null;
        const linkNeighbor = (neighborIdx: number, suppressForwardFill: boolean) => {
          const neighbor = rows[neighborIdx];
          if (!neighbor || neighbor.manualConnector != null) {
            return;
          }
          const value = neighbor.actualReal ?? neighbor.filledValue ?? neighbor.forecastValue;
          if (value == null) {
            return;
          }
          neighbor.manualConnector = value;
          if (suppressForwardFill && neighbor.filledLineValue != null) {
            neighbor.filledLineValue = null;
          }
        };
        linkNeighbor(idx - 1, false);
        linkNeighbor(idx + 1, true);
      }
    });

    const timelineRows = rows.filter((row) => row.hasHistory || row.isPending);
    if (!timelineRows.length) {
      return { allRows: rows, compactRows: rows };
    }

    const lastTimelineDate = timelineRows[timelineRows.length - 1].date;
    const windowStartTimeline = timelineRows.length > historyWindow
      ? timelineRows[timelineRows.length - historyWindow].date
      : timelineRows[0].date;

    const windowStartTime = new Date(windowStartTimeline).getTime();
    const windowEndTime = new Date(lastTimelineDate).getTime();

    const compactBase = rows.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      return rowTime >= windowStartTime && rowTime <= windowEndTime;
    });

    let forecastIncluded = 0;
    const forecastTail: ChartRow[] = [];
    rows.forEach((row) => {
      const rowTime = new Date(row.date).getTime();
      if (rowTime > windowEndTime && row.forecastValue != null && forecastIncluded < forecastWindow) {
        forecastTail.push(row);
        forecastIncluded += 1;
      }
    });

    const compact = [...compactBase, ...forecastTail];
    return { allRows: rows, compactRows: compact.length ? compact : rows };
  }, [data, historyWindow, forecastWindow]);

  const chartData = showFullRange ? allRows : compactRows;

  return (
    <div className="w-full h-96 mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
          <XAxis
            dataKey="date"
            className="text-xs"
            tick={{ fill: 'currentColor' }}
            stroke="currentColor"
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'currentColor' }}
            stroke="currentColor"
            label={{ value: 'จำนวนผู้ป่วย (ราย)', angle: -90, position: 'insideLeft', style: { fill: 'currentColor' } }}
          />
          <Tooltip content={renderTooltip} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="line" />
          <Line
            type="monotone"
            dataKey="actualReal"
            stroke="#2563eb"
            strokeWidth={3}
            name="ข้อมูลจริง"
            dot={<ActualDot />}
            activeDot={{ r: 7 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="filledLineValue"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="6 3"
            name="ข้อมูลเติม/รอ"
            dot={false}
            activeDot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="filledValue"
            stroke="transparent"
            strokeWidth={0}
            name=""
            dot={<FilledDot />}
            activeDot={{ r: 7 }}
            legendType="none"
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecastValue"
            stroke="#ef4444"
            strokeWidth={3}
            strokeDasharray="8 4"
            name="ข้อมูลพยากรณ์"
            dot={{ r: 5, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 7 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="manualConnector"
            stroke="#16a34a"
            strokeWidth={2.5}
            name="เส้นเชื่อมข้อมูลที่กรอก"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
