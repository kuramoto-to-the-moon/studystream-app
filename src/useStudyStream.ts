import { useCallback, useEffect, useRef, useState } from 'react';
import { playCompletionSound, prepareCompletionSound } from './completionSound';
import { getPreferredInterfaceLanguage } from './i18n';
import type { AppState, CompletionSound, PauseReason, SessionState } from './model';
import { intervalDurationSeconds, materializeSession, phaseTimerPaused, remainingSeconds, resolveCompletionSound } from './model';
import { localizeFreshInstallState, normalizeAppState } from './stateNormalization';
import {
  FALLBACK_STATE_KEY,
  parseFallbackState,
  selectNewestState,
  shouldAcceptIncomingState,
  stateRevision,
} from './statePersistence';

type Mutator = (state: AppState) => AppState;

export function useStudyStream({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(Date.now());
  const stateRef = useRef<AppState | null>(null);
  const armedSoundDeadlineRef = useRef<number | null>(null);
  const queuedSaveRef = useRef<AppState | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSavesRef = useRef(0);
  const deferredSaveRef = useRef<AppState | null>(null);
  const deferredSaveTimerRef = useRef<number | null>(null);

  const apply = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const receive = useCallback((next: AppState) => {
    const normalized = normalizeAppState(next);
    if (!shouldAcceptIncomingState(stateRef.current, normalized)) return;
    apply(normalized);
  }, [apply]);

  const drainSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    pendingSavesRef.current = 1;
    try {
      while (queuedSaveRef.current) {
        const next = queuedSaveRef.current;
        queuedSaveRef.current = null;
        try {
          const response = await fetch('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
            keepalive: true,
          });
          if (response.status === 409) {
            const latestResponse = await fetch('/api/state');
            if (!latestResponse.ok) throw new Error('reload-after-conflict-failed');
            receive(await latestResponse.json() as AppState);
            continue;
          }
          if (!response.ok) throw new Error('save-failed');
          const confirmed = normalizeAppState(await response.json() as AppState);
          const isLatestConfirmed = queuedSaveRef.current === null
            && deferredSaveRef.current === null
            && stateRevision(stateRef.current) === stateRevision(next);
          if (isLatestConfirmed) {
            // The server may have merged a timer update from another window
            // with this settings update. Adopt that confirmed composition even
            // when its overall revision equals the optimistic local snapshot.
            apply(confirmed);
            window.localStorage.removeItem(FALLBACK_STATE_KEY);
          }
        } catch {
          // The fallback is written synchronously before the request starts.
          // Keep it until a later request confirms the same newest revision.
        }
      }
    } finally {
      pendingSavesRef.current = 0;
      saveInFlightRef.current = false;
    }
  }, [apply, receive]);

  const save = useCallback((next: AppState) => {
    if (stateRef.current !== next) apply(next);
    try {
      window.localStorage.setItem(FALLBACK_STATE_KEY, JSON.stringify(next));
    } catch {
      // Disk persistence remains the primary store. A full/disabled local
      // storage must not block the application from saving through the API.
    }
    // Keep only the newest unsent snapshot. Fast sliders and typing now result
    // in at most one in-flight request plus one latest queued request.
    queuedSaveRef.current = next;
    void drainSaveQueue();
  }, [apply, drainSaveQueue]);

  const flushDeferredSave = useCallback(() => {
    if (deferredSaveTimerRef.current !== null) {
      window.clearTimeout(deferredSaveTimerRef.current);
      deferredSaveTimerRef.current = null;
    }
    const pending = deferredSaveRef.current;
    deferredSaveRef.current = null;
    if (pending) save(pending);
  }, [save]);

  const update = useCallback(
    (mutator: Mutator) => {
      const current = stateRef.current;
      if (!current) return;
      const changed = mutator(current);
      if (changed === current) return;
      const updatedAt = Math.max(Date.now(), (current.updatedAt ?? 0) + 1);
      // An immediate timer action already contains any optimistic settings
      // edits, so it supersedes the older deferred snapshot.
      if (deferredSaveTimerRef.current !== null) {
        window.clearTimeout(deferredSaveTimerRef.current);
        deferredSaveTimerRef.current = null;
      }
      deferredSaveRef.current = null;
      void save({ ...changed, updatedAt, sessionUpdatedAt: updatedAt });
    },
    [save],
  );

  const updateDeferred = useCallback(
    (mutator: Mutator) => {
      const current = stateRef.current;
      if (!current) return;
      const changed = mutator(current);
      if (changed === current) return;
      const updatedAt = Math.max(Date.now(), (current.updatedAt ?? 0) + 1);
      const next = { ...changed, updatedAt, settingsUpdatedAt: updatedAt };
      apply(next);
      deferredSaveRef.current = next;
      if (deferredSaveTimerRef.current !== null) {
        window.clearTimeout(deferredSaveTimerRef.current);
      }
      deferredSaveTimerRef.current = window.setTimeout(flushDeferredSave, 120);
    },
    [apply, flushDeferredSave],
  );

  useEffect(() => {
    const controller = new AbortController();
    const storedFallback = parseFallbackState(window.localStorage.getItem(FALLBACK_STATE_KEY));
    if (!storedFallback && window.localStorage.getItem(FALLBACK_STATE_KEY)) {
      window.localStorage.removeItem(FALLBACK_STATE_KEY);
    }

    fetch('/api/state', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('state-load-failed');
        return response.json() as Promise<AppState>;
      })
      .then((serverState) => {
        const newest = selectNewestState(serverState, storedFallback);
        const localized = localizeFreshInstallState(newest, getPreferredInterfaceLanguage());
        receive(localized);
        if (!readOnly && (newest === storedFallback || localized !== newest)) {
          save(normalizeAppState(localized));
        }
      })
      .catch(() => {
        if (storedFallback) receive(storedFallback);
      });

    const events = new EventSource('/api/events');
    events.onmessage = (event) => {
      // Local edits are optimistic. Older server echoes and delayed events
      // must never replace a newer layout, timer, message, or color setting.
      if (!readOnly && (pendingSavesRef.current > 0 || queuedSaveRef.current || deferredSaveRef.current)) return;
      try {
        receive(JSON.parse(event.data) as AppState);
      } catch {
        // Ignore malformed local events; the next valid snapshot will recover.
      }
    };
    events.onerror = () => undefined;
    return () => {
      controller.abort();
      events.close();
    };
  }, [readOnly, receive, save]);

  useEffect(() => {
    window.addEventListener('pagehide', flushDeferredSave);
    return () => {
      window.removeEventListener('pagehide', flushDeferredSave);
      flushDeferredSave();
    };
  }, [flushDeferredSave]);

  useEffect(() => {
    const activeTimer = state?.session.phaseEndsAt !== null
      || (state?.session.phase === 'study' && state.session.tracking);
    const interval = activeTimer ? 1_000 : 60_000;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [state?.session.phase, state?.session.phaseEndsAt, state?.session.tracking]);

  useEffect(() => {
    if (readOnly) return;
    const prepareAudioAfterInteraction = () => {
      if (stateRef.current?.settings.completionSoundEnabled ?? true) prepareCompletionSound();
    };
    window.addEventListener('pointerdown', prepareAudioAfterInteraction);
    return () => window.removeEventListener('pointerdown', prepareAudioAfterInteraction);
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!state) return;
    const remaining = remainingSeconds(state.session, now);
    if (state.session.phaseEndsAt !== null && remaining > 0) {
      armedSoundDeadlineRef.current = state.session.phaseEndsAt;
    }
    const due = state.session.phaseEndsAt !== null
      && remaining === 0
      && state.session.phase !== 'idle';
    if (!due) return;
    const completedDeadline = state.session.phaseEndsAt;
    if ((state.settings.completionSoundEnabled ?? true)
      && armedSoundDeadlineRef.current === completedDeadline
      && (state.session.phase === 'study' || state.session.phase === 'break')) {
      void playCompletionSound(state.session.phase, resolveCompletionSound(state.settings.completionSound));
    }
    armedSoundDeadlineRef.current = null;
    update((current) => {
      // This effect may have been scheduled just before the user ended or
      // changed the timer. Never auto-start from that stale completion event.
      if (current.session.phase === 'idle'
        || current.session.phaseEndsAt !== completedDeadline
        || remainingSeconds(current.session, now) > 0) {
        return current;
      }
      const checkpointed = materializeSession(current.session, now);
      if (!(current.settings.autoCycleEnabled ?? true)) {
        return {
          ...current,
          session: {
            ...checkpointed,
            tracking: false,
            intervalCompleted: true,
            phaseEndsAt: null,
            pausedRemainingSeconds: null,
            pauseReason: null,
            lastCheckpointAt: now,
          },
        };
      }
      const nextPhase = checkpointed.phase === 'study' ? 'break' : 'study';
      const durationSeconds = intervalDurationSeconds(current.settings, nextPhase);
      return {
        ...current,
        session: {
          ...checkpointed,
          phase: nextPhase,
          tracking: nextPhase === 'study',
          intervalCompleted: false,
          phaseStartedAt: now,
          phaseEndsAt: now + durationSeconds * 1000,
          pausedRemainingSeconds: null,
          pauseReason: null,
          lastCheckpointAt: now,
        },
      };
    });
  }, [now, readOnly, state, update]);

  useEffect(() => {
    if (readOnly) return;
    if (state?.session.phase !== 'study' || !state.session.tracking) return;
    const elapsed = now - state.session.lastCheckpointAt;
    if (elapsed < 15_000) return;
    update((current) => ({ ...current, session: materializeSession(current.session, now) }));
  }, [now, readOnly, state, update]);

  const changeSession = useCallback(
    (changes: (session: SessionState, current: AppState, stamp: number) => SessionState) => {
      const stamp = Date.now();
      update((current) => {
        const session = materializeSession(current.session, stamp);
        return { ...current, session: changes(session, current, stamp) };
      });
    },
    [update],
  );

  const prepareEnabledCompletionSound = () => {
    if (stateRef.current?.settings.completionSoundEnabled ?? true) prepareCompletionSound();
  };

  const actions = {
    prepareCompletionSound: () => prepareCompletionSound(),
    previewCompletionSound: (sound: CompletionSound) => playCompletionSound('study', sound),
    startStudy: () => {
      prepareEnabledCompletionSound();
      changeSession((session, current, stamp) => ({
        ...session,
        sessionSeconds: session.phase === 'idle' ? 0 : session.sessionSeconds,
        phase: 'study',
        tracking: true,
        intervalCompleted: false,
        phaseStartedAt: stamp,
        phaseEndsAt: stamp + intervalDurationSeconds(current.settings, 'study') * 1000,
        pausedRemainingSeconds: null,
        pauseReason: null,
        lastCheckpointAt: stamp,
      }));
    },
    togglePause: () => {
      prepareEnabledCompletionSound();
      changeSession((session, _current, stamp) => {
        if (session.phase === 'idle' || session.intervalCompleted) return session;
        if (!phaseTimerPaused(session)) {
          return {
            ...session,
            tracking: false,
            intervalCompleted: false,
            phaseEndsAt: null,
            pausedRemainingSeconds: remainingSeconds(session, stamp),
            pauseReason: 'manual',
            lastCheckpointAt: stamp,
          };
        }
        const pausedRemaining = Math.max(
          0,
          session.pausedRemainingSeconds ?? remainingSeconds(session, stamp),
        );
        return {
          ...session,
          tracking: session.phase === 'study',
          intervalCompleted: false,
          phaseEndsAt: stamp + pausedRemaining * 1000,
          pausedRemainingSeconds: null,
          pauseReason: null,
          lastCheckpointAt: stamp,
        };
      });
    },
    pause: (reason: PauseReason = 'manual') => {
      changeSession((session, _current, stamp) => {
        if (session.phase === 'idle' || session.intervalCompleted || phaseTimerPaused(session)) return session;
        return {
          ...session,
          tracking: false,
          intervalCompleted: false,
          phaseEndsAt: null,
          pausedRemainingSeconds: remainingSeconds(session, stamp),
          pauseReason: reason,
          lastCheckpointAt: stamp,
        };
      });
    },
    resumeVoicePause: () => {
      changeSession((session, _current, stamp) => {
        if (!phaseTimerPaused(session) || session.pauseReason !== 'voice') return session;
        const pausedRemaining = Math.max(0, session.pausedRemainingSeconds ?? 0);
        return {
          ...session,
          tracking: session.phase === 'study',
          intervalCompleted: false,
          phaseEndsAt: stamp + pausedRemaining * 1000,
          pausedRemainingSeconds: null,
          pauseReason: null,
          lastCheckpointAt: stamp,
        };
      });
    },
    startBreak: () => {
      prepareEnabledCompletionSound();
      changeSession((session, current, stamp) => ({
        ...session,
        phase: 'break',
        tracking: false,
        intervalCompleted: false,
        phaseStartedAt: stamp,
        phaseEndsAt: stamp + intervalDurationSeconds(current.settings, 'break') * 1000,
        pausedRemainingSeconds: null,
        pauseReason: null,
        lastCheckpointAt: stamp,
      }));
    },
    addStudyTime: (seconds: number) => {
      const stamp = Date.now();
      update((current) => {
        const session = materializeSession(current.session, stamp);
        const requestedSeconds = Math.trunc(seconds);
        const currentOffstreamSeconds = Math.max(0, session.offstreamTodaySeconds ?? 0);
        const adjustedSeconds = requestedSeconds >= 0
          ? requestedSeconds
          : -Math.min(currentOffstreamSeconds, Math.abs(requestedSeconds));
        if (!adjustedSeconds) return current;
        const dayKey = session.dayKey;
        return { ...current, session: {
          ...session,
          todaySeconds: Math.max(0, session.todaySeconds + adjustedSeconds),
          offstreamTodaySeconds: Math.max(0, currentOffstreamSeconds + adjustedSeconds),
          totalSeconds: Math.max(0, session.totalSeconds + adjustedSeconds),
          dailySeconds: {
            ...session.dailySeconds,
            [dayKey]: Math.max(0, (session.dailySeconds?.[dayKey] ?? 0) + adjustedSeconds),
          },
        } };
      });
    },
    finish: () =>
      changeSession((session, _current, stamp) => ({
        ...session,
        phase: 'idle',
        tracking: false,
        intervalCompleted: false,
        phaseStartedAt: null,
        phaseEndsAt: null,
        pausedRemainingSeconds: null,
        pauseReason: null,
        lastCheckpointAt: stamp,
      })),
  };

  const displaySession = state ? materializeSession(state.session, now) : null;
  return { state, displaySession, now, update, updateDeferred, actions };
}
