export type HistorySource = 'observed' | 'manual' | 'synthetic' | 'seasonal_clone';

export interface HistoryPoint {
  ds: string;
  y: number;
  source: HistorySource;
}

export interface ForecastPoint {
  ds: string;
  horizon: number;
  y_pred: number;
  actual?: number | null;
}

export interface PendingWeek {
  ds: string;
  prediction: number;
}

export interface ForecastResponse {
  cut_date: string;
  district_id_txt_clean: string;
  province: string;
  lat: number;
  lon: number;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  pending_weeks: PendingWeek[];
  data_available_until: string;
  generated_until: string;
  current_week_start: string;
  forecast_start: string;
}

export interface ForecastState {
  loading: boolean;
  error: string | null;
  data: ForecastResponse | null;
}

export interface ManualObservation {
  district_id: string;
  week_start: string;
  cases: number;
  created_at: string;
}

export interface ManualObservationResponse {
  district_id: string;
  records: ManualObservation[];
}
