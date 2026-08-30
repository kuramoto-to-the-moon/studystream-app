export type Phase = 'idle' | 'study' | 'break';
export type Language = 'ja' | 'en';
export type Layout = 'horizontal' | 'vertical';
export type WidgetId = 'state' | 'timer' | 'message' | 'offstream' | 'note' | 'session' | 'today' | 'streaks';
export type MetricWidgetId = 'session' | 'today' | 'streaks';
export type MetricKind = 'session' | 'today' | 'week' | 'month' | 'year' | 'total' | 'streaks';

export const widgetOrder: WidgetId[] = ['state', 'timer', 'message', 'offstream', 'note', 'session', 'today', 'streaks'];

export interface SessionState {
  phase: Phase;
  tracking: boolean;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  pausedRemainingSeconds?: number | null;
  lastCheckpointAt: number;
  sessionSeconds: number;
  todaySeconds: number;
  offstreamTodaySeconds?: number;
  totalSeconds: number;
  dayKey: string;
  dailySeconds?: Record<string, number>;
}

export interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
}

export interface Streak {
  id: string;
  name: string;
  kind?: 'days' | 'count';
  startedOn?: string;
  count?: number;
  unit?: string;
  dayMode?: 'all' | 'weekdays' | 'weekends' | 'custom';
  includedWeekdays?: number[];
  visible: boolean;
}

export interface Settings {
  studyMinutes: number;
  breakMinutes: number;
  language: Language;
  layout: Layout;
  background: string;
  backgroundOpacity: number;
  textColor: string;
  textOpacity?: number;
  note?: string;
  metricKinds?: Record<MetricWidgetId, MetricKind>;
  messages: Record<'study' | 'paused' | 'break' | 'idle', string>;
  widgets: WidgetConfig[];
  streaks: Streak[];
}

export interface AppState {
  version: 1;
  session: SessionState;
  settings: Settings;
}

export const widgetLabels: Record<Language, Record<WidgetId, string>> = {
  ja: {
    state: '状態',
    timer: '残り時間',
    message: 'メッセージ',
    offstream: '今日の配信外学習',
    note: '常時表示する注記',
    session: '今回の学習時間',
    today: '今日',
    streaks: '継続項目',
  },
  en: {
    state: 'Status',
    timer: 'Time left',
    message: 'Message',
    offstream: 'Off-stream study today',
    note: 'Always-visible note',
    session: 'Session time',
    today: 'Today',
    streaks: 'Streak',
  },
};

export const uiCopy = {
  ja: {
    idle: '待機中',
    study: '学習中',
    paused: '一時停止中',
    break: '休憩中',
    tracking: '学習時間を計測中',
    notTracking: '学習タイマーは一時停止中',
    remaining: '残り時間',
    session: '今回の学習時間',
    today: '今日',
    total: '累計',
    days: '日',
    beforeStart: '開始前',
  },
  en: {
    idle: 'Ready',
    study: 'Studying',
    paused: 'Paused',
    break: 'On break',
    tracking: 'Study time is running',
    notTracking: 'Study time is paused',
    remaining: 'Time left',
    session: 'Session time',
    today: 'Today',
    total: 'Total',
    days: 'days',
    beforeStart: 'Starts soon',
  },
} as const;

export const metricLabels: Record<Language, Record<MetricKind, string>> = {
  ja: {
    session: '今回の学習時間',
    today: '今日',
    week: '今週',
    month: '今月',
    year: '今年',
    total: '累計',
    streaks: '継続項目',
  },
  en: {
    session: 'Session time',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    total: 'Total',
    streaks: 'Streak',
  },
};

export const defaultMetricKinds: Record<MetricWidgetId, MetricKind> = {
  session: 'session',
  today: 'today',
  streaks: 'streaks',
};

export function phaseKey(session: SessionState) {
  if (session.phase === 'study' && !session.tracking) return 'paused' as const;
  return session.phase;
}

export function materializeSession(session: SessionState, now = Date.now()): SessionState {
  const currentDay = localDayKey(now);
  const storedDay = session.dayKey || currentDay;
  const dailySeconds = session.dailySeconds ?? (session.totalSeconds > 0 ? { [currentDay]: session.totalSeconds } : {});
  const offstreamTodaySeconds = session.offstreamTodaySeconds ?? 0;
  const normalized = storedDay === currentDay
    ? { ...session, dayKey: currentDay, dailySeconds, offstreamTodaySeconds }
    : { ...session, dayKey: currentDay, todaySeconds: 0, offstreamTodaySeconds: 0, dailySeconds };
  if (normalized.phase !== 'study' || !normalized.tracking) return normalized;
  const elapsed = Math.max(0, Math.floor((now - session.lastCheckpointAt) / 1000));
  if (!elapsed) return normalized;
  return {
    ...normalized,
    lastCheckpointAt: session.lastCheckpointAt + elapsed * 1000,
    sessionSeconds: normalized.sessionSeconds + elapsed,
    todaySeconds: normalized.todaySeconds + elapsed,
    totalSeconds: normalized.totalSeconds + elapsed,
    dailySeconds: {
      ...normalized.dailySeconds,
      [currentDay]: (normalized.dailySeconds?.[currentDay] ?? 0) + elapsed,
    },
  };
}

function localDayKey(now: number) {
  const value = new Date(now);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function remainingSeconds(session: SessionState, now = Date.now()) {
  if (session.phase === 'study' && !session.tracking && session.pausedRemainingSeconds != null) {
    return Math.max(0, session.pausedRemainingSeconds);
  }
  if (!session.phaseEndsAt) return 0;
  const effectiveNow = Math.max(now, session.lastCheckpointAt || now);
  return Math.max(0, Math.ceil((session.phaseEndsAt - effectiveNow) / 1000));
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDuration(seconds: number, language: Language) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (language === 'en') return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

export function metricSeconds(session: SessionState, kind: Exclude<MetricKind, 'streaks'>, now = Date.now()) {
  if (kind === 'session') return session.sessionSeconds;
  if (kind === 'today') return session.todaySeconds;
  if (kind === 'total') return session.totalSeconds;

  const date = new Date(now);
  const year = String(date.getFullYear());
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  let start = '';
  if (kind === 'year') start = `${year}-01-01`;
  if (kind === 'month') start = `${month}-01`;
  if (kind === 'week') {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    start = localDayKey(monday.getTime());
  }
  const end = localDayKey(now);
  return Object.entries(session.dailySeconds ?? {}).reduce(
    (total, [day, seconds]) => total + (day >= start && day <= end ? seconds : 0),
    0,
  );
}

export function streakDays(
  startedOn: string,
  dayMode: Streak['dayMode'] = 'all',
  includedWeekdays: number[] = [],
) {
  const start = new Date(`${startedOn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return -1;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    const included = dayMode === 'weekdays'
      ? weekday >= 1 && weekday <= 5
      : dayMode === 'weekends'
        ? weekday === 0 || weekday === 6
        : dayMode === 'custom'
          ? includedWeekdays.includes(weekday)
          : true;
    if (included) count += 1;
  }
  return count;
}
