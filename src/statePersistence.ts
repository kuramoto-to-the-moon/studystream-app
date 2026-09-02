import type { AppState } from './model';

export const FALLBACK_STATE_KEY = 'studystream:fallback-state';

export function stateRevision(state: AppState | null | undefined) {
  const revision = state?.updatedAt;
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : 0;
}

export function shouldAcceptIncomingState(current: AppState | null, incoming: AppState) {
  return current === null || stateRevision(incoming) > stateRevision(current);
}

export function selectNewestState(serverState: AppState, fallbackState: AppState | null) {
  return fallbackState && stateRevision(fallbackState) > stateRevision(serverState)
    ? fallbackState
    : serverState;
}

export function parseFallbackState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return parsed?.version === 1 && parsed.session && parsed.settings
      ? parsed as AppState
      : null;
  } catch {
    return null;
  }
}
