export type Phase = 'idle' | 'study' | 'break';
export type Language = 'ja' | 'en';
export type Layout = 'horizontal' | 'vertical';
export type WidgetId = 'state' | 'timer' | 'message' | 'session' | 'today' | 'streaks';

export const widgetOrder: WidgetId[] = ['state', 'timer', 'message', 'session', 'today', 'streaks'];

export interface SessionState {
  phase: Phase;
  tracking: boolean;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  pausedRemainingSeconds?: number | null;
  lastCheckpointAt: number;
  sessionSeconds: number;
  todaySeconds: number;
  totalSeconds: number;
  dayKey: string;
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
    session: '今回の学習',
    today: '今日',
    streaks: '継続項目',
  },
  en: {
    state: 'Status',
    timer: 'Time left',
    message: 'Message',
    session: 'This session',
    today: 'Today',
    streaks: 'Streak',
  },
};

export const uiCopy = {
  ja: {
    idle: '待機中',
    study: '学習中',
    paused: '学習中',
    break: '休憩中',
    tracking: '学習時間を計測中',
    notTracking: '学習タイマーは一時停止中',
    remaining: '残り時間',
    session: '今回の学習',
    today: '今日',
    total: '累計',
    days: '日',
    beforeStart: '開始前',
  },
  en: {
    idle: 'Ready',
    study: 'Studying',
    paused: 'Studying',
    break: 'On break',
    tracking: 'Study time is running',
    notTracking: 'Study time is paused',
    remaining: 'Time left',
    session: 'This session',
    today: 'Today',
    total: 'Total',
    days: 'days',
    beforeStart: 'Starts soon',
  },
} as const;

export function phaseKey(session: SessionState) {
  if (session.phase === 'study' && !session.tracking) return 'paused' as const;
  return session.phase;
}

export function materializeSession(session: SessionState, now = Date.now()): SessionState {
  const currentDay = localDayKey(now);
  const storedDay = session.dayKey || currentDay;
  const normalized = storedDay === currentDay
    ? { ...session, dayKey: currentDay }
    : { ...session, dayKey: currentDay, todaySeconds: 0 };
  if (normalized.phase !== 'study' || !normalized.tracking) return normalized;
  const elapsed = Math.max(0, Math.floor((now - session.lastCheckpointAt) / 1000));
  if (!elapsed) return normalized;
  return {
    ...normalized,
    lastCheckpointAt: session.lastCheckpointAt + elapsed * 1000,
    sessionSeconds: normalized.sessionSeconds + elapsed,
    todaySeconds: normalized.todaySeconds + elapsed,
    totalSeconds: normalized.totalSeconds + elapsed,
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
  return Math.max(0, Math.ceil((session.phaseEndsAt - now) / 1000));
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

export function streakDays(startedOn: string) {
  const start = new Date(`${startedOn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000);
}
