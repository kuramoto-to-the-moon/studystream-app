export type Phase = 'idle' | 'study' | 'break';
export type Language = 'ja' | 'en';
export type Layout = 'horizontal' | 'vertical';
export type BoardFont = 'sans' | 'system' | 'modern';
export type BoardColorPreset = 'dark' | 'light' | 'custom';
export type CompletionSound = 'chime' | 'bell' | 'beep';
export type PauseReason = 'manual' | 'voice';
export type WidgetId = 'state' | 'timer' | 'message' | 'offstream' | 'note' | 'session' | 'today' | 'streaks' | 'metric4' | 'metric5' | 'metric6' | 'metric7';
export type MetricWidgetId = 'session' | 'today' | 'streaks' | 'metric4' | 'metric5' | 'metric6' | 'metric7';
export type MetricKind = 'session' | 'today' | 'week' | 'month' | 'year' | 'total' | 'streaks';
export type TimeMetricKind = Exclude<MetricKind, 'streaks'>;

export const DEFAULT_SECONDARY_TEXT_COLOR = '#a3a3a3';
export const DEFAULT_SECONDARY_TEXT_OPACITY = 1;
export const MESSAGE_MAX_LENGTH = 60;
export const NOTE_MAX_LENGTH = 80;
export const MAX_INTERVAL_MINUTES = 24 * 60;
export const MIN_INTERVAL_MINUTES = 1;
export const AUTO_PAUSE_MIN_SECONDS = 1;
export const AUTO_PAUSE_MAX_SECONDS = 10;
export const DEFAULT_BOARD_APPEARANCE = {
  background: '#000000',
  backgroundOpacity: 0.78,
  textColor: '#ffffff',
  textOpacity: 1,
  secondaryTextColor: DEFAULT_SECONDARY_TEXT_COLOR,
  secondaryTextOpacity: DEFAULT_SECONDARY_TEXT_OPACITY,
  secondaryTextDefaultVersion: 4,
  boardAppearanceDefaultVersion: 3,
} as const;

export const metricSlotIds: MetricWidgetId[] = ['session', 'today', 'streaks', 'metric4', 'metric5', 'metric6', 'metric7'];
export const metricKindIds: MetricKind[] = ['session', 'today', 'week', 'month', 'year', 'total', 'streaks'];
export const boardFontIds: BoardFont[] = ['sans', 'system', 'modern'];
export const completionSoundIds: CompletionSound[] = ['chime', 'bell', 'beep'];
export const widgetOrder: WidgetId[] = ['state', 'timer', 'message', 'offstream', 'note', ...metricSlotIds];

export function normalizeViewerCopy(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
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

export function resolveCompletionSound(value: unknown): CompletionSound {
  return typeof value === 'string' && completionSoundIds.includes(value as CompletionSound)
    ? value as CompletionSound
    : 'chime';
}

export interface SessionState {
  phase: Phase;
  tracking: boolean;
  intervalCompleted?: boolean;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  pausedRemainingSeconds?: number | null;
  pauseReason?: PauseReason | null;
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

export function localizedStreakName(item: Streak, language: Language) {
  if (item.id === 'workout' && item.name === '筋トレ') {
    return language === 'en' ? 'Workout' : item.name;
  }
  return item.name;
}

export function localizedStreakUnit(item: Streak, language: Language) {
  if (item.id === 'workout' && item.unit === '回') {
    return language === 'en' ? 'times' : item.unit;
  }
  return item.unit;
}

export interface Settings {
  studyMinutes: number;
  breakMinutes: number;
  studyDurationSeconds?: number;
  breakDurationSeconds?: number;
  autoCycleEnabled?: boolean;
  completionSoundEnabled?: boolean;
  completionSound?: CompletionSound;
  autoPauseVoiceEnabled?: boolean;
  autoPauseVoiceSeconds?: number;
  speechLanguage?: Language;
  language: Language;
  layout: Layout;
  boardFont?: BoardFont;
  colorPreset?: BoardColorPreset;
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
  metricKinds?: Partial<Record<MetricWidgetId, MetricKind>>;
  messages: Record<'study' | 'paused' | 'break' | 'idle', string>;
  widgets: WidgetConfig[];
  streaks: Streak[];
}

export const defaultViewerMessages: Record<Language, Settings['messages']> = {
  ja: {
    study: '集中しています。コメントは休憩中に読みます。',
    paused: '少し会話しています。学習タイマーは一時停止中です。',
    break: '休憩中です。コメントを読んでいます。',
    idle: 'まもなく学習を始めます。',
  },
  en: {
    study: 'Focusing now. I will read chat during the break.',
    paused: 'Chatting briefly. The study timer is paused.',
    break: 'On a break and reading chat.',
    idle: 'Study will begin shortly.',
  },
};

export function clampAutoPauseSeconds(value: number, fallback = 2) {
  const seconds = Number.isFinite(value) ? value : fallback;
  return Math.min(AUTO_PAUSE_MAX_SECONDS, Math.max(AUTO_PAUSE_MIN_SECONDS, seconds));
}

export interface AppState {
  version: 1;
  updatedAt?: number;
  settingsUpdatedAt?: number;
  sessionUpdatedAt?: number;
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
    session: '開始後',
    today: '今日',
    streaks: 'カスタム項目',
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
    session: 'Since start',
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
    paused: '停止中',
    break: '休憩中',
    tracking: '学習時間を計測中',
    notTracking: '学習タイマーは一時停止中',
    remaining: '残り時間',
    session: '開始後',
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
    session: 'Since start',
    today: 'Today',
    total: 'Total',
    days: 'days',
    beforeStart: 'Starts soon',
  },
} as const;

export const metricLabels: Record<Language, Record<MetricKind, string>> = {
  ja: {
    session: '開始後',
    today: '今日',
    week: '今週',
    month: '今月',
    year: '今年',
    total: '累計',
    streaks: 'カスタム項目',
  },
  en: {
    session: 'Since start',
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

export function recommendedObsSize(state: AppState) {
  // OBS keeps one stable viewport while a stream is running. Reserve the
  // maximum height enabled by the current layout and visible items so a state
  // change or the longest allowed copy cannot introduce scrollbars.
  const visibleWidgets = state.settings.widgets.filter((widget) => widget.visible);
  const metricKinds = resolveMetricKinds(state.settings.metricKinds);
  const metricWidgets = visibleWidgets.filter((widget) => metricSlotIds.includes(widget.id as MetricWidgetId));
  const metricCount = metricWidgets.filter((widget) => metricKinds[widget.id as MetricWidgetId] !== 'streaks').length;
  const showsCustomItems = metricWidgets.some((widget) => metricKinds[widget.id as MetricWidgetId] === 'streaks');
  const customItemCount = showsCustomItems ? state.settings.streaks.filter((item) => item.visible).length : 0;
  const supplementCount = (visibleWidgets.some((widget) => widget.id === 'offstream') ? 1 : 0) + customItemCount;
  const hasSupplement = supplementCount > 0;
  const verticalSupplementRows = Math.max(1, Math.ceil(supplementCount / 2));
  const hasMessage = visibleWidgets.some((widget) => widget.id === 'message');
  const hasNote = visibleWidgets.some((widget) => widget.id === 'note');
  const borderAllowance = 2;
  const roundUp = (height: number) => Math.ceil(Math.max(84, height) / 4) * 4;

  if (state.settings.layout === 'vertical') {
    const has = (id: WidgetId) => visibleWidgets.some((widget) => widget.id === id);
    const calculatedHeight = borderAllowance
      + (has('state') ? 48 : 0)
      + (has('timer') ? 90 : 0)
      // Messages and notes can occupy up to three lines.
      + (hasMessage ? 92 : 0)
      + (metricCount > 0 ? 28 + metricCount * 18 + Math.max(0, metricCount - 1) * 10 : 0)
      + (hasSupplement ? 20 + verticalSupplementRows * 18 + Math.max(0, verticalSupplementRows - 1) * 8 : 0)
      + (hasNote ? 80 : 0);
    return { width: 320, height: roundUp(calculatedHeight) };
  }

  const hasMainRow = visibleWidgets.some((widget) => ['state', 'timer', 'message'].includes(widget.id));
  const metricRows = metricCount > 0 ? Math.max(1, Math.ceil(metricCount / 3)) : 0;
  // With off-stream study beside the custom-item group, the custom items have
  // room for two columns. Without it, the full-width group fits three.
  const hasOffstream = visibleWidgets.some((widget) => widget.id === 'offstream');
  const customColumns = hasOffstream ? 2 : 3;
  const supplementRows = hasSupplement
    ? Math.max(1, Math.ceil(customItemCount / customColumns))
    : 0;
  const calculatedHeight = borderAllowance
    + (hasMainRow ? (hasMessage ? 92 : 56) : 0)
    + (metricRows > 0 ? 34 + (metricRows - 1) * 15 : 0)
    + (supplementRows > 0 ? 28 + (supplementRows - 1) * 20 : 0)
    + (hasNote ? 56 : 0);
  return { width: 600, height: roundUp(calculatedHeight) };
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
  const needsDailySeconds = session.dailySeconds == null;
  const needsOffstreamSeconds = session.offstreamTodaySeconds == null;
  const dayChanged = storedDay !== currentDay;
  const normalized = dayChanged || needsDailySeconds || needsOffstreamSeconds || !session.dayKey
    ? {
        ...session,
        dayKey: currentDay,
        todaySeconds: dayChanged ? 0 : session.todaySeconds,
        offstreamTodaySeconds: dayChanged ? 0 : (session.offstreamTodaySeconds ?? 0),
        dailySeconds: session.dailySeconds
          ?? (session.totalSeconds > 0 ? { [currentDay]: session.totalSeconds } : {}),
      }
    : session;
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

export function metricTotals(session: SessionState, now = Date.now()): Record<TimeMetricKind, number> {
  const date = new Date(now);
  const year = String(date.getFullYear());
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = localDayKey(monday.getTime());
  const monthStart = `${month}-01`;
  const yearStart = `${year}-01-01`;
  const end = localDayKey(now);
  let week = 0;
  let currentMonth = 0;
  let currentYear = 0;

  for (const [day, seconds] of Object.entries(session.dailySeconds ?? {})) {
    if (day > end) continue;
    if (day >= yearStart) currentYear += seconds;
    if (day >= monthStart) currentMonth += seconds;
    if (day >= weekStart) week += seconds;
  }

  return {
    session: session.sessionSeconds,
    today: session.todaySeconds,
    week,
    month: currentMonth,
    year: currentYear,
    total: session.totalSeconds,
  };
}

export function metricSeconds(session: SessionState, kind: TimeMetricKind, now = Date.now()) {
  return metricTotals(session, now)[kind];
}

export function streakDays(
  startedOn: string,
  dayMode: Streak['dayMode'] = 'all',
  includedWeekdays: number[] = [],
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startedOn);
  if (!match) return 0;
  const startYear = Number(match[1]);
  const startMonth = Number(match[2]) - 1;
  const startDate = Number(match[3]);
  const startUtc = Date.UTC(startYear, startMonth, startDate);
  const verifiedStart = new Date(startUtc);
  if (verifiedStart.getUTCFullYear() !== startYear
    || verifiedStart.getUTCMonth() !== startMonth
    || verifiedStart.getUTCDate() !== startDate) return 0;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsedDays = Math.floor((todayUtc - startUtc) / 86_400_000);
  if (elapsedDays < 0) return -1;
  if (dayMode === 'all') return elapsedDays;

  const selectedWeekdays = dayMode === 'weekdays'
    ? new Set([1, 2, 3, 4, 5])
    : dayMode === 'weekends'
      ? new Set([0, 6])
      : new Set(includedWeekdays);
  const completeWeeks = Math.floor(elapsedDays / 7);
  let count = completeWeeks * selectedWeekdays.size;
  const startWeekday = verifiedStart.getUTCDay();
  for (let offset = completeWeeks * 7 + 1; offset <= elapsedDays; offset += 1) {
    if (selectedWeekdays.has((startWeekday + offset) % 7)) count += 1;
  }
  return count;
}
