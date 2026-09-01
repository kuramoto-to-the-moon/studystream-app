import { describe, expect, it } from 'vitest';
import {
  formatClock,
  intervalDurationSeconds,
  materializeSession,
  normalizeViewerCopy,
  phaseLabel,
  phaseTimerPaused,
  remainingSeconds,
  resolveMetricKinds,
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
    });
    expect(phaseTimerPaused(paused)).toBe(true);
    expect(remainingSeconds(paused, 99_000)).toBe(3_661);
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
