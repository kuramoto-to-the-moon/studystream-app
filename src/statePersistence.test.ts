import { describe, expect, it } from 'vitest';
import type { AppState } from './model';
import { parseFallbackState, selectNewestState, shouldAcceptIncomingState } from './statePersistence';

function state(updatedAt: number, layout: 'horizontal' | 'vertical' = 'horizontal'): AppState {
  return {
    version: 1,
    updatedAt,
    session: {
      phase: 'idle',
      tracking: false,
      phaseStartedAt: null,
      phaseEndsAt: null,
      lastCheckpointAt: updatedAt,
      sessionSeconds: 0,
      todaySeconds: 0,
      totalSeconds: 0,
      dayKey: '2026-09-01',
    },
    settings: {
      studyMinutes: 30,
      breakMinutes: 10,
      language: 'ja',
      layout,
      background: '#000000',
      backgroundOpacity: 0.62,
      textColor: '#ffffff',
      messages: { study: '', paused: '', break: '', idle: '' },
      widgets: [{ id: 'state', visible: true }],
      streaks: [],
    },
  };
}

describe('state persistence revisions', () => {
  it('never accepts an older server event over optimistic settings', () => {
    const current = state(200, 'vertical');
    expect(shouldAcceptIncomingState(current, state(199))).toBe(false);
    expect(shouldAcceptIncomingState(current, state(200))).toBe(false);
    expect(shouldAcceptIncomingState(current, state(201))).toBe(true);
  });

  it('recovers a newer local fallback after a restart', () => {
    const server = state(100);
    const fallback = state(101, 'vertical');
    expect(selectNewestState(server, fallback)).toBe(fallback);
    expect(selectNewestState(state(102), fallback)).not.toBe(fallback);
  });

  it('rejects malformed fallback data without throwing', () => {
    expect(parseFallbackState('{broken')).toBeNull();
    expect(parseFallbackState(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseFallbackState(JSON.stringify(state(1)))).toMatchObject({ updatedAt: 1 });
  });
});
