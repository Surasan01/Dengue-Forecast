import { useCallback, useEffect, useMemo, useState } from 'react';
import { District } from '../data/districts';
import { ForecastState, HistorySource, ManualObservation } from '../types/forecast';
import { ForecastChart } from './ForecastChart';

const SOURCE_LABEL: Record<HistorySource, string> = {
  observed: 'ข้อมูลจริงจากฐานเดิม',
  manual: 'ข้อมูลจริงที่ผู้ใช้บันทึก',
  synthetic: 'ค่าประมาณเพื่อคั่นสัปดาห์',
  seasonal_clone: 'คัดลอกจากปีที่ผ่านมา',
};

const SOURCE_BADGE: Record<HistorySource, string> = {
  observed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  manual: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  synthetic: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  seasonal_clone: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
};

const DEFAULT_HISTORY_WINDOW = 15;
const DEFAULT_FORECAST_WINDOW = 2;

type ManualEntryRow = {
  id: string;
  isoWeek: string;
  cases: string;
};

const createManualEntryRow = (): ManualEntryRow => ({
  id: Math.random().toString(36).slice(2),
  isoWeek: '',
  cases: '',
});

const isoWeekToDate = (value: string): string | null => {
  if (!value) return null;
  const [yearStr, weekStr] = value.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const day = firstThursday.getUTCDay() || 7;
  const weekStart = new Date(firstThursday);
  weekStart.setUTCDate(firstThursday.getUTCDate() - day + 1 + (week - 1) * 7);
  return weekStart.toISOString().slice(0, 10);
};

const dateToIsoWeek = (value: string): string => {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return value;
  const date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  const dayNumber = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNumber + 3);
  const firstThursday = date.valueOf();
  date.setUTCMonth(0, 4);
  const weekNumber = 1 + Math.round((firstThursday - date.valueOf()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const formatDisplayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDisplayDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface DistrictDetailPanelProps {
  district: District | null;
  apiBaseUrl: string;
}

export function DistrictDetailPanel({ district, apiBaseUrl }: DistrictDetailPanelProps) {
  const [forecast, setForecast] = useState<ForecastState>({
    loading: false,
    error: null,
    data: null,
  });
  const [horizon, setHorizon] = useState<number>(2);
  const [latestWeekStart, setLatestWeekStart] = useState<string>('');
  const [latestCases, setLatestCases] = useState<string>('');
  const [manualRows, setManualRows] = useState<ManualEntryRow[]>([createManualEntryRow()]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSubmitMessage, setManualSubmitMessage] = useState<string | null>(null);
  const [manualSubmitError, setManualSubmitError] = useState<string | null>(null);
  const [manualObservations, setManualObservations] = useState<ManualObservation[]>([]);
  const [observationsLoading, setObservationsLoading] = useState(false);
  const [observationsError, setObservationsError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'compact' | 'full'>('compact');

  const hasManualUpdate = useMemo(() => latestWeekStart !== '' && latestCases !== '', [latestCases, latestWeekStart]);
  const manualObservationsSorted = useMemo(
    () =>
      [...manualObservations].sort((a, b) => {
        return new Date(b.week_start).getTime() - new Date(a.week_start).getTime();
      }),
    [manualObservations],
  );
  const lastManualObservation = manualObservationsSorted[0] ?? null;
  const manualRowsReadyCount = useMemo(
    () =>
      manualRows.reduce((count, row) => {
        const weekStart = isoWeekToDate(row.isoWeek);
        const trimmed = row.cases.trim();
        const casesValue = Number(trimmed);
        const hasValue = trimmed !== '' && Number.isFinite(casesValue);
        return weekStart && hasValue ? count + 1 : count;
      }, 0),
    [manualRows],
  );
  const manualSubmitDisabled = manualSubmitting || manualRowsReadyCount === 0;

  const getSourceBadgeClass = (source: HistorySource) => SOURCE_BADGE[source] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300';

  const chartViewButtonClass = (mode: 'compact' | 'full') =>
    [
      'px-3 py-1 rounded-full text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
      !forecast.data ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      chartMode === mode
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-transparent text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30',
    ].join(' ');

  const resetManualFeedback = () => {
    setManualSubmitMessage(null);
    setManualSubmitError(null);
  };

  const addManualRow = () => {
    resetManualFeedback();
    setManualRows((rows) => [...rows, createManualEntryRow()]);
  };

  const updateManualRow = (id: string, field: keyof ManualEntryRow, value: string) => {
    resetManualFeedback();
    setManualRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeManualRow = (id: string) => {
    resetManualFeedback();
    setManualRows((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.id !== id)));
  };

  const fetchManualObservations = useCallback(async () => {
    if (!district || !apiBaseUrl) {
      setManualObservations([]);
      return;
    }
    setObservationsLoading(true);
    setObservationsError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/observations/${encodeURIComponent(district.district_id_txt_clean)}`);
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText} - ${raw.slice(0, 120)}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('API ส่งข้อมูลไม่ใช่ JSON โปรดตรวจสอบ API URL');
      }
      let payload: { records?: ManualObservation[] };
      try {
        payload = JSON.parse(raw);
      } catch (parseError) {
        throw new Error('ไม่สามารถแปลงข้อมูลที่ได้จาก API เป็น JSON ได้');
      }
      const records: ManualObservation[] = Array.isArray(payload.records) ? payload.records : [];
      setManualObservations(records);
    } catch (error) {
      setObservationsError(error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลบันทึกได้');
    } finally {
      setObservationsLoading(false);
    }
  }, [apiBaseUrl, district]);

  useEffect(() => {
    fetchManualObservations();
  }, [fetchManualObservations]);

  useEffect(() => {
    setManualSubmitMessage(null);
    setManualSubmitError(null);
    setManualRows([createManualEntryRow()]);
    setChartMode('compact');
  }, [district?.district_id_txt_clean]);

  const fetchForecast = async () => {
    if (!apiBaseUrl) {
      setForecast({
        loading: false,
        error: 'กรุณาตั้งค่า Ngrok API URL ก่อนใช้งาน',
        data: null,
      });
      return;
    }

    if (!district) return;

    setForecast({ loading: true, error: null, data: null });

    const latestWeekDate = isoWeekToDate(latestWeekStart);
    const latestCasesValue = Number(latestCases);

    try {
      const response = await fetch(`${apiBaseUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_id_txt_clean: district.district_id_txt_clean,
          horizon,
          ...(latestWeekDate && latestCases !== '' && Number.isFinite(latestCasesValue)
            ? {
                latest_week_start: latestWeekDate,
                latest_cases: latestCasesValue,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const apiData = await response.json();
      const toNumeric = (value: unknown): number | null => {
        const parsed = typeof value === 'string' ? Number(value) : (value as number);
        if (typeof parsed === 'number' && Number.isFinite(parsed)) {
          return parsed;
        }
        return null;
      };
      const transformed = {
        cut_date: apiData.cut_date,
        district_id_txt_clean: district.district_id_txt_clean,
        province: district.province,
        lat: district.lat,
        lon: district.lon,
        history: Array.isArray(apiData.history)
          ? apiData.history.map((item: { ds: string; cases: number; source?: HistorySource }) => ({
              ds: item.ds,
              y: toNumeric(item.cases) ?? 0,
              source: item.source ?? 'observed',
            }))
          : [],
        forecast: Array.isArray(apiData.forecast)
          ? apiData.forecast.map((item: { ds: string; h: number; prediction: number; actual?: number | null }) => ({
              ds: item.ds,
              horizon: Number(item.h ?? 0),
              y_pred: toNumeric(item.prediction) ?? 0,
              actual: toNumeric(item.actual),
            }))
          : [],
        pending_weeks: Array.isArray(apiData.pending_weeks)
          ? apiData.pending_weeks.map((item: { ds: string; prediction: number }) => ({
              ds: item.ds,
              prediction: toNumeric(item.prediction) ?? 0,
            }))
          : [],
        data_available_until: apiData.data_available_until ?? '',
        generated_until: apiData.generated_until ?? '',
        current_week_start: apiData.current_week_start ?? '',
        forecast_start: apiData.forecast_start ?? '',
      };

      setForecast({ loading: false, error: null, data: transformed });
    } catch (error) {
      setForecast({
        loading: false,
        error: error instanceof Error ? error.message : 'ไม่สามารถดึงข้อมูลพยากรณ์ได้',
        data: null,
      });
    }
  };

  const fetchMockForecast = () => {
    if (!district) return;

    setForecast({ loading: true, error: null, data: null });

    setTimeout(() => {
      const mockData = {
        cut_date: '2024-02-05',
        district_id_txt_clean: district.district_id_txt_clean,
        province: district.province,
        lat: district.lat,
        lon: district.lon,
        history: [
          { ds: '2024-01-01', y: 3, source: 'observed' as HistorySource },
          { ds: '2024-01-08', y: 5, source: 'observed' as HistorySource },
          { ds: '2024-01-15', y: 4, source: 'observed' as HistorySource },
          { ds: '2024-01-22', y: 7, source: 'observed' as HistorySource },
          { ds: '2024-01-29', y: 6, source: 'observed' as HistorySource },
          { ds: '2024-02-05', y: 8, source: 'observed' as HistorySource },
        ],
        forecast: [
          { ds: '2024-02-12', horizon: 1, y_pred: 9 },
          { ds: '2024-02-19', horizon: 2, y_pred: 11 },
        ],
        pending_weeks: [],
        data_available_until: '2024-02-05',
        generated_until: '2024-02-19',
      };
      setForecast({ loading: false, error: null, data: mockData });
    }, 1000);
  };

  const handleManualSubmit = async () => {
    if (!district) {
      setManualSubmitError('กรุณาเลือกอำเภอก่อนบันทึก');
      return;
    }
    if (!apiBaseUrl) {
      setManualSubmitError('กรุณาตั้งค่า API URL ก่อน');
      return;
    }

    const entries = manualRows
      .map((row) => {
        const weekStart = isoWeekToDate(row.isoWeek);
        const trimmed = row.cases.trim();
        const casesValue = Number(trimmed);
        if (!weekStart || trimmed === '' || !Number.isFinite(casesValue)) {
          return null;
        }
        return { week_start: weekStart, cases: casesValue };
      })
      .filter((item): item is { week_start: string; cases: number } => Boolean(item));

    if (!entries.length) {
      setManualSubmitError('กรุณาเลือกสัปดาห์และระบุจำนวนผู้ป่วยอย่างน้อย 1 แถว');
      return;
    }

    setManualSubmitting(true);
    setManualSubmitError(null);
    setManualSubmitMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/observations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_id_txt_clean: district.district_id_txt_clean,
          entries,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      setManualSubmitMessage('บันทึกข้อมูลเรียบร้อยแล้ว');
      setManualRows([createManualEntryRow()]);
      await fetchManualObservations();
      await fetchForecast();
    } catch (error) {
      setManualSubmitError(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setManualSubmitting(false);
    }
  };

  if (!district) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            เลือกอำเภอบนแผนที่
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            คลิกที่จุดบนแผนที่เพื่อดูข้อมูลพยากรณ์โรคไข้เลือดออกในอำเภอนั้น ๆ สำหรับ 2 สัปดาห์ข้างหน้า
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {district.district_id_txt_clean}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              จังหวัด{district.province}
            </p>
            {forecast.data?.cut_date && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                ข้อมูลฝึกสอนล่าสุด: {forecast.data.cut_date}
              </p>
            )}
          </div>
          <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
            📍 {district.lat.toFixed(3)}, {district.lon.toFixed(3)}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <span>📊</span>
            <span>ข้อมูลพยากรณ์</span>
          </h3>



          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              onClick={fetchForecast}
              disabled={forecast.loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {forecast.loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full spinner"></div>
                  <span>กำลังโหลด...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>ดึงข้อมูลจริง (API)</span>
                </>
              )}
            </button>
          </div>

          {forecast.loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full spinner mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">กำลังประมวลผลข้อมูล...</p>
            </div>
          )}

          {forecast.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-red-800 dark:text-red-200 font-semibold mb-1">เกิดข้อผิดพลาด</p>
                  <p className="text-red-600 dark:text-red-300 text-sm">{forecast.error}</p>
                </div>
              </div>
            </div>
          )}

          {forecast.data && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">สัปดาห์ปัจจุบัน (Anchor)</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {forecast.data.current_week_start ? formatDisplayDate(forecast.data.current_week_start) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">ใช้เพื่อพาคาสิโนคำนวณมาปัจจุบัน</p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">เริ่มคาดการณ์</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {forecast.data.forecast_start ? formatDisplayDate(forecast.data.forecast_start) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">สัปดาห์ถัดจาก Anchor ที่เป็น +1</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">ข้อมูลจริงล่าสุด</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {forecast.data.data_available_until ? formatDisplayDate(forecast.data.data_available_until) : '-'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">สัปดาห์ล่าสุดที่มีข้อมูลจริง</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">คำนวณถึง</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {forecast.data.generated_until ? formatDisplayDate(forecast.data.generated_until) : '-'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">รวม pending + พยากรณ์</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">pending weeks</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {forecast.data.pending_weeks.length}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">สัปดาห์ที่ต้องรอข้อมูลจริง</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-5 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2 font-medium">สัปดาห์ที่ +1</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                    {forecast.data.forecast[0]?.y_pred != null ? `${forecast.data.forecast[0]?.y_pred.toFixed(0)} ราย` : '-'}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    📅 {forecast.data.forecast[0]?.ds ?? '-'}
                  </p>
                  {forecast.data.forecast[0]?.actual != null && (
                    <p className="text-xs text-blue-500 dark:text-blue-300 mt-1">ค่าจริง: {forecast.data.forecast[0].actual.toFixed(0)} ราย</p>
                  )}
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 p-5 rounded-xl border-2 border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 mb-2 font-medium">สัปดาห์ที่ +2</p>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">
                    {forecast.data.forecast[1]?.y_pred != null ? `${forecast.data.forecast[1]?.y_pred.toFixed(0)} ราย` : '-'}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    📅 {forecast.data.forecast[1]?.ds ?? '-'}
                  </p>
                  {forecast.data.forecast[1]?.actual != null && (
                    <p className="text-xs text-red-500 dark:text-red-300 mt-1">ค่าจริง: {forecast.data.forecast[1].actual.toFixed(0)} ราย</p>
                  )}
                </div>
              </div>

              <div className="border-t border-dashed border-gray-200 dark:border-gray-700 mt-8 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>📊</span>
                    <span>ข้อมูลพยากรณ์</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setChartMode('compact')}
                      className={chartViewButtonClass('compact')}
                      aria-pressed={chartMode === 'compact'}
                    >
                      15 + 2 สัปดาห์ล่าสุด
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode('full')}
                      className={chartViewButtonClass('full')}
                      aria-pressed={chartMode === 'full'}
                    >
                      ดูทั้งหมด (ตั้งแต่ปี 2019)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    โหมด "15 + 2" แสดงย้อนหลัง 15 สัปดาห์จนถึงปัจจุบันพร้อมพยากรณ์ 2 สัปดาห์ถัดไป ส่วน "ดูทั้งหมด" จะแสดงทุกสัปดาห์ตั้งแต่ปี 2019
                  </p>
                </div>
                <ForecastChart
                  data={forecast.data}
                  showFullRange={chartMode === 'full'}
                  historyWindow={DEFAULT_HISTORY_WINDOW}
                  forecastWindow={DEFAULT_FORECAST_WINDOW}
                />
              </div>

              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📋</span>
                  <span>สรุปข้อมูลพยากรณ์</span>
                </h4>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">วันที่เริ่มต้น</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">จำนวนผู้ป่วยคาดการณ์</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">ข้อมูลจริง</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">ช่วงเวลา</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {forecast.data.forecast.map((f, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{f.ds}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{f.y_pred != null ? `${f.y_pred.toFixed(1)} ราย` : '-'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{f.actual != null ? `${f.actual.toFixed(1)} ราย` : '-'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">สัปดาห์ที่ +{f.horizon}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!forecast.loading && !forecast.error && !forecast.data && (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                คลิกปุ่มด้านบนเพื่อดูข้อมูลพยากรณ์สำหรับอำเภอนี้
              </p>
            </div>
          )}
        </div>
      </div>

        <div className="card p-6 mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span>📝</span>
              <span>บันทึกจำนวนผู้ป่วยด้วยตนเอง</span>
            </h3>
            <button
              type="button"
              onClick={fetchManualObservations}
              disabled={observationsLoading}
              className="btn-secondary flex items-center gap-2"
            >
              {observationsLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner"></div>
                  <span>กำลังโหลด...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 6v5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>รีเฟรชรายการ</span>
                </>
              )}
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            ใช้ส่วนนี้เพื่อใส่จำนวนผู้ป่วยจริงรายสัปดาห์เมื่อยังไม่มีในฐานข้อมูล ระบบจะใช้ค่านี้ทันทีในการคำนวณและบันทึกลงฐานข้อมูลกลาง
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">บันทึกล่าสุด</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {lastManualObservation ? formatDisplayDate(lastManualObservation.week_start) : '-'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {lastManualObservation ? `บันทึกเมื่อ ${formatDisplayDateTime(lastManualObservation.created_at)}` : 'ยังไม่มีข้อมูล'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">แถวพร้อมส่ง</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{manualRowsReadyCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ต้องเลือกสัปดาห์ + จำนวนผู้ป่วยให้ครบ</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">ทั้งหมดที่บันทึก</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{manualObservations.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">รวมทุกครั้งที่เคยบันทึก</p>
            </div>
          </div>

          {manualSubmitMessage && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 mb-4 text-green-700 dark:text-green-200">
              ✅ {manualSubmitMessage}
            </div>
          )}
          {manualSubmitError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4 text-red-700 dark:text-red-200">
              ⚠️ {manualSubmitError}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">สัปดาห์ (ISO)</th>
                  <th className="px-4 py-3 text-left font-semibold">จำนวนผู้ป่วย</th>
                  <th className="px-4 py-3 text-left font-semibold">วันที่เริ่มสัปดาห์</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {manualRows.map((row) => {
                  const weekStart = isoWeekToDate(row.isoWeek);
                  return (
                    <tr key={row.id} className="bg-white/70 dark:bg-gray-900/40">
                      <td className="px-4 py-3 align-top">
                        <input
                          type="week"
                          value={row.isoWeek}
                          onChange={(event) => updateManualRow(row.id, 'isoWeek', event.target.value)}
                          className="input-field"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ตัวอย่างรูปแบบ: 2024-W05</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <input
                          type="number"
                          min={0}
                          value={row.cases}
                          onChange={(event) => updateManualRow(row.id, 'cases', event.target.value)}
                          placeholder="เช่น 12"
                          className="input-field"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {weekStart ? formatDisplayDate(weekStart) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeManualRow(row.id)}
                          disabled={manualRows.length <= 1}
                          className="text-sm text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ลบแถว
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4">
            <button type="button" onClick={addManualRow} className="btn-secondary w-full sm:w-auto">
              + เพิ่มแถวใหม่
            </button>
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={manualSubmitDisabled}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
            >
              {manualSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner"></div>
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 00-8 0v4a4 4 0 008 0V7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v7m-4 0h8" />
                  </svg>
                  <span>บันทึกข้อมูล</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-8">
            <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <span>📚</span>
              <span>ประวัติการบันทึกของอำเภอนี้</span>
            </h4>
            {observationsError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-red-700 dark:text-red-200">
                {observationsError}
              </div>
            )}
            {observationsLoading && !manualObservationsSorted.length && (
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-transparent rounded-full spinner"></div>
                <span>กำลังโหลดรายการ...</span>
              </div>
            )}
            {!observationsLoading && !observationsError && manualObservationsSorted.length === 0 && (
              <div className="text-gray-500 dark:text-gray-400 text-sm">ยังไม่เคยมีการบันทึกข้อมูลด้วยตนเอง</div>
            )}
            {manualObservationsSorted.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">สัปดาห์ที่</th>
                      <th className="px-4 py-3 text-left font-semibold">จำนวนผู้ป่วย</th>
                      <th className="px-4 py-3 text-left font-semibold">สร้างเมื่อ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {manualObservationsSorted.map((record) => (
                      <tr key={`${record.district_id}-${record.week_start}-${record.created_at}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                          {formatDisplayDate(record.week_start)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{record.cases.toFixed(0)} ราย</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDisplayDateTime(record.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
