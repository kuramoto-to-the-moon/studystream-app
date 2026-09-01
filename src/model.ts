export type Phase = 'idle' | 'study' | 'break';
export type Language = 'ja' | 'en';
export type Layout = 'horizontal' | 'vertical';
export type BoardFont = 'sans' | 'system' | 'modern';
export type WidgetId = 'state' | 'timer' | 'message' | 'offstream' | 'note' | 'session' | 'today' | 'streaks' | 'metric4' | 'metric5' | 'metric6' | 'metric7';
export type MetricWidgetId = 'session' | 'today' | 'streaks' | 'metric4' | 'metric5' | 'metric6' | 'metric7';
export type MetricKind = 'session' | 'today' | 'week' | 'month' | 'year' | 'total' | 'streaks';

export const DEFAULT_SECONDARY_TEXT_OPACITY = 0.78;
export const MESSAGE_MAX_LENGTH = 60;
export const NOTE_MAX_LENGTH = 80;
export const MAX_INTERVAL_MINUTES = 24 * 60;
export const MIN_INTERVAL_MINUTES = 1;
export const DEFAULT_BOARD_APPEARANCE = {
  background: '#000000',
  backgroundOpacity: 0.62,
  textColor: '#ffffff',
  textOpacity: 1,
  secondaryTextColor: '#ffffff',
  secondaryTextOpacity: DEFAULT_SECONDARY_TEXT_OPACITY,
  secondaryTextDefaultVersion: 2,
  boardAppearanceDefaultVersion: 2,
} as const;

export const metricSlotIds: MetricWidgetId[] = ['session', 'today', 'streaks', 'metric4', 'metric5', 'metric6', 'metric7'];
export const metricKindIds: MetricKind[] = ['session', 'today', 'week', 'month', 'year', 'total', 'streaks'];
export const boardFontIds: BoardFont[] = ['sans', 'system', 'modern'];
export const widgetOrder: WidgetId[] = ['state', 'timer', 'message', 'offstream', 'note', ...metricSlotIds];

export function normalizeViewerCopy(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trimStart().slice(0, maxLength);
}

export function clampIntervalMinutes(value: number) {
  const minutes = Number.isFinite(value) ? Math.round(value) : MIN_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes));
}

export function resolveBoardFont(value: unknown): BoardFont {
  if (value === 'serif') return 'modern';
  return typeof value === 'string' && boardFontIds.includes(value as BoardFont)
    ? value as BoardFont
    : 'sans';
}

export interface SessionState {
  phase: Phase;
  tracking: boolean;
  intervalCompleted?: boolean;
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
  studyDurationSeconds?: number;
  breakDurationSeconds?: number;
  autoCycleEnabled?: boolean;
  completionSoundEnabled?: boolean;
  language: Language;
  layout: Layout;
  boardFont?: BoardFont;
  background: string;
  backgroundOpacity: number;
  textColor: string;
  textOpacity?: number;
  secondaryTextColor?: string;
  secondaryTextOpacity?: number;
  secondaryTextDefaultVersion?: number;
  boardAppearanceDefaultVersion?: number;
  defaultStreakVersion?: number;
  showMetricSeconds?: boolean;
  note?: string;
  offstreamEnabled?: boolean;
  metricKinds?: Partial<Record<MetricWidgetId, MetricKind>>;
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
    session: '現在の記録',
    today: '今日',
    streaks: 'その他の項目',
    metric4: '集計表示',
    metric5: '集計表示',
    metric6: '集計表示',
    metric7: '集計表示',
  },
  en: {
    state: 'Status',
    timer: 'Time left',
    message: 'Message',
    offstream: 'Off-stream study today',
    note: 'Always-visible note',
    session: 'Current record',
    today: 'Today',
    streaks: 'Streak',
    metric4: 'Metric',
    metric5: 'Metric',
    metric6: 'Metric',
    metric7: 'Metric',
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
    session: '現在の記録',
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
    session: 'Current record',
    today: 'Today',
    total: 'Total',
    days: 'days',
    beforeStart: 'Starts soon',
  },
} as const;

export const metricLabels: Record<Language, Record<MetricKind, string>> = {
  ja: {
    session: '現在の記録',
    today: '今日',
    week: '今週',
    month: '今月',
    year: '今年',
    total: '累計',
    streaks: 'その他の項目',
  },
  en: {
    session: 'Current record',
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
  metric4: 'week',
  metric5: 'month',
  metric6: 'year',
  metric7: 'total',
};

export function resolveMetricKinds(saved?: Partial<Record<MetricWidgetId, MetricKind>>): Record<MetricWidgetId, MetricKind> {
  const preferred = { ...defaultMetricKinds, ...saved };
  const used = new Set<MetricKind>();
  const resolved = {} as Record<MetricWidgetId, MetricKind>;

  metricSlotIds.forEach((slotId) => {
    const preferredKind = preferred[slotId];
    const kind = preferredKind && !used.has(preferredKind)
      ? preferredKind
      : metricKindIds.find((candidate) => !used.has(candidate))!;
    resolved[slotId] = kind;
    used.add(kind);
  });

  return resolved;
}

export function phaseKey(session: SessionState) {
  if (phaseTimerPaused(session)) return 'paused' as const;
  return session.phase;
}

export function intervalDurationSeconds(
  settings: Pick<Settings, 'studyMinutes' | 'breakMinutes' | 'studyDurationSeconds' | 'breakDurationSeconds'>,
  phase: Exclude<Phase, 'idle'>,
) {
  const configured = phase === 'study' ? settings.studyDurationSeconds : settings.breakDurationSeconds;
  if (configured != null && Number.isFinite(configured)) return Math.min(86_400, Math.max(1, Math.floor(configured)));
  const legacyMinutes = phase === 'study' ? settings.studyMinutes : settings.breakMinutes;
  return Math.min(86_400, Math.max(1, Math.floor(legacyMinutes * 60)));
}

export function phaseTimerPaused(session: SessionState) {
  return session.phase !== 'idle'
    && !session.intervalCompleted
    && session.phaseEndsAt === null
    && session.pausedRemainingSeconds != null;
}

export function phaseLabel(session: SessionState, language: Language) {
  if (session.intervalCompleted) {
    if (language === 'en') return session.phase === 'study' ? 'Study finished' : 'Break finished';
    return session.phase === 'study' ? '学習終了' : '休憩終了';
  }
  if (phaseTimerPaused(session)) {
    return session.phase === 'study' ? uiCopy[language].study : uiCopy[language].break;
  }
  return uiCopy[language][phaseKey(session)];
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
  if (phaseTimerPaused(session)) {
    return Math.max(0, session.pausedRemainingSeconds ?? 0);
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
