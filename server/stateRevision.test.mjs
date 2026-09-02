import { describe, expect, it } from 'vitest';
import { isStaleState, mergeStateSections, stateRevision } from './stateRevision.mjs';

describe('local server state revisions', () => {
  it('accepts the first versioned save over a legacy document', () => {
    expect(isStaleState({ updatedAt: 0 }, { updatedAt: 1 })).toBe(false);
    expect(stateRevision({})).toBe(0);
  });

  it('rejects duplicate and older snapshots', () => {
    expect(isStaleState({ updatedAt: 100 }, { updatedAt: 100 })).toBe(true);
    expect(isStaleState({ updatedAt: 100 }, { updatedAt: 99 })).toBe(true);
    expect(isStaleState({ updatedAt: 100 }, { updatedAt: 101 })).toBe(false);
  });

  it('rejects a legacy tab after section revisions are active', () => {
    const current = { updatedAt: 100, settingsUpdatedAt: 100, sessionUpdatedAt: 90 };
    expect(isStaleState(current, { updatedAt: 101 })).toBe(true);
  });

  it('merges timer and settings changes without either one rolling back', () => {
    const current = {
      version: 1,
      updatedAt: 200,
      settingsUpdatedAt: 200,
      sessionUpdatedAt: 150,
      settings: { textOpacity: 0.73 },
      session: { sessionSeconds: 10 },
    };
    const timerUpdateFromAnotherTab = {
      version: 1,
      updatedAt: 220,
      settingsUpdatedAt: 150,
      sessionUpdatedAt: 220,
      settings: { textOpacity: 1 },
      session: { sessionSeconds: 25 },
    };

    expect(mergeStateSections(current, timerUpdateFromAnotherTab)).toMatchObject({
      updatedAt: 220,
      settingsUpdatedAt: 200,
      sessionUpdatedAt: 220,
      settings: { textOpacity: 0.73 },
      session: { sessionSeconds: 25 },
    });
  });
});
