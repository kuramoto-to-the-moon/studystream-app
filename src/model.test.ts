import { describe, expect, it } from 'vitest';
import {
  formatClock,
  intervalDurationSeconds,
  localizedStreakName,
  localizedStreakUnit,
  materializeSession,
  metricTotals,
  normalizeViewerCopy,
  phaseLabel,
  phaseTimerPaused,
  recommendedObsSize,
  remainingSeconds,
  resolveMetricKinds,
  streakDays,
  type AppState,
  type SessionState,
} from './model';

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    phase: 'study',
    tracking: true,
    intervalCompleted: false,
    phaseStartedAt: 1_000,
    phaseEndsAt: 61_000,
    pausedRemainingSeconds: null,
    lastCheckpointAt: 1_000,
    sessionSeconds: 0,
    todaySeconds: 0,
    offstreamTodaySeconds: 0,
    totalSeconds: 0,
    dayKey: '',
    dailySeconds: {},
    ...overrides,
  };
}

describe('viewer formatting', () => {
  it('keeps large hour values readable', () => {
    expect(formatClock(10_042 * 3_600 + 30 * 60 + 5)).toBe('10042:30:05');
  });

  it('normalizes viewer copy before applying its limit', () => {
    expect(normalizeViewerCopy('  集中\n  しています  ', 8)).toBe('集中 しています');
  });
});

describe('timer boundaries', () => {
  it('supports durations up to 24 hours', () => {
    expect(intervalDurationSeconds({
      studyMinutes: 30,
      breakMinutes: 10,
      studyDurationSeconds: 86_400,
    }, 'study')).toBe(86_400);
    expect(intervalDurationSeconds({
      studyMinutes: 30,
      breakMinutes: 10,
      studyDurationSeconds: 100_000,
    }, 'study')).toBe(86_400);
  });

  it('preserves the remaining time while paused', () => {
    const paused = session({
      tracking: false,
      phaseEndsAt: null,
      pausedRemainingSeconds: 3_661,
      pauseReason: 'voice',
    });
    expect(phaseTimerPaused(paused)).toBe(true);
    expect(remainingSeconds(paused, 99_000)).toBe(3_661);
    expect(paused.pauseReason).toBe('voice');
    expect(phaseLabel(paused, 'ja')).toBe('学習中');
  });

  it('only accumulates elapsed time during active study', () => {
    const active = session();
    const updated = materializeSession(active, 6_500);
    expect(updated.sessionSeconds).toBe(5);
    expect(updated.todaySeconds).toBe(5);
    expect(updated.totalSeconds).toBe(5);

    const resting = session({ phase: 'break', tracking: false });
    expect(materializeSession(resting, 6_500).totalSeconds).toBe(0);
  });
});

describe('metric slots', () => {
  it('repairs duplicate saved choices so every slot stays unique', () => {
    const resolved = resolveMetricKinds({ session: 'today', today: 'today' });
    expect(new Set(Object.values(resolved)).size).toBe(Object.values(resolved).length);
    expect(resolved.session).toBe('today');
  });
});

describe('localized default custom item', () => {
  const workout = { id: 'workout', name: '筋トレ', kind: 'count' as const, count: 2, unit: '回', visible: true };

  it('localizes the bundled workout item without changing user data', () => {
    expect(localizedStreakName(workout, 'en')).toBe('Workout');
    expect(localizedStreakUnit(workout, 'en')).toBe('times');
    expect(workout.name).toBe('筋トレ');
    expect(workout.unit).toBe('回');
  });

  it('does not translate custom names and units', () => {
    const custom = { ...workout, id: 'books', name: '読書', unit: '冊' };
    expect(localizedStreakName(custom, 'en')).toBe('読書');
    expect(localizedStreakUnit(custom, 'en')).toBe('冊');
  });
});

describe('bounded aggregate work', () => {
  it('calculates every time period in one aggregate pass', () => {
    const now = new Date(2026, 8, 1, 12).getTime();
    const totals = metricTotals(session({
      sessionSeconds: 30,
      todaySeconds: 20,
      totalSeconds: 100,
      dailySeconds: {
        '2025-12-31': 7,
        '2026-08-31': 10,
        '2026-09-01': 20,
      },
    }), now);
    expect(totals).toEqual({
      session: 30,
      today: 20,
      week: 30,
      month: 20,
      year: 30,
      total: 100,
    });
  });

  it('counts long custom streaks without walking every elapsed day', () => {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    expect(streakDays(key, 'all')).toBe(1);
    expect(streakDays('not-a-date', 'all')).toBe(0);
  });
});

describe('OBS source sizing', () => {
  const sizedState = (layout: 'horizontal' | 'vertical'): AppState => ({
    version: 1,
    session: session(),
    settings: {
      studyMinutes: 30,
      breakMinutes: 10,
      language: 'ja',
      layout,
      background: '#000000',
      backgroundOpacity: 0.62,
      textColor: '#ffffff',
      messages: { study: '', paused: '', break: '', idle: '' },
      metricKinds: {
        session: 'session', today: 'today', streaks: 'streaks',
        metric4: 'week', metric5: 'month', metric6: 'year', metric7: 'total',
      },
      widgets: [
        { id: 'state', visible: true },
        { id: 'timer', visible: true },
        { id: 'message', visible: true },
        { id: 'offstream', visible: true },
        { id: 'note', visible: false },
        { id: 'session', visible: true },
        { id: 'today', visible: true },
        { id: 'streaks', visible: false },
        { id: 'metric4', visible: false },
        { id: 'metric5', visible: false },
        { id: 'metric6', visible: false },
        { id: 'metric7', visible: false },
      ],
      streaks: [],
    },
  });

  it('reserves every enabled horizontal row plus a border allowance', () => {
    expect(recommendedObsSize(sizedState('horizontal'))).toEqual({ width: 600, height: 156 });
  });

  it('recalculates a taller source when the board changes to vertical', () => {
    const horizontal = recommendedObsSize(sizedState('horizontal'));
    const vertical = recommendedObsSize(sizedState('vertical'));
    expect(vertical.width).toBe(320);
    expect(vertical.height).toBeGreaterThan(horizontal.height);
  });

  it('reserves wrapped rows when many custom items are shown', () => {
    const state = sizedState('horizontal');
    state.settings.widgets = state.settings.widgets.map((widget) => (
      widget.id === 'streaks' || widget.id === 'note' ? { ...widget, visible: true } : widget
    ));
    state.settings.note = '配信に関する注記';
    state.settings.streaks = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      name: `項目${index + 1}`,
      kind: 'count' as const,
      count: index,
      unit: '回',
      startedOn: '',
      dayMode: 'all' as const,
      includedWeekdays: [],
      visible: true,
    }));

    expect(recommendedObsSize(state)).toEqual({ width: 600, height: 292 });
    state.settings.layout = 'vertical';
    expect(recommendedObsSize(state)).toEqual({ width: 320, height: 556 });
  });
});
