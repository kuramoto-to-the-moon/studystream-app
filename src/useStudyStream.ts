import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, SessionState } from './model';
import { materializeSession, remainingSeconds } from './model';

type Mutator = (state: AppState) => AppState;

export function useStudyStream({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const stateRef = useRef<AppState | null>(null);

  const receive = useCallback((next: AppState) => {
    const withDefaults: AppState = {
      ...next,
      settings: {
        ...next.settings,
        note: next.settings.note ?? '',
        widgets: next.settings.widgets.some((widget) => widget.id === 'note')
          ? next.settings.widgets
          : [...next.settings.widgets, { id: 'note', visible: true }],
      },
    };
    const session = withDefaults.session;
    const normalized = session.phase === 'study'
      && !session.tracking
      && session.phaseEndsAt !== null
      && session.pausedRemainingSeconds == null
      ? {
          ...withDefaults,
          session: {
            ...session,
            phaseEndsAt: null,
            pausedRemainingSeconds: remainingSeconds(session),
          },
        }
      : withDefaults;
    stateRef.current = normalized;
    setState(normalized);
  }, []);

  useEffect(() => {
    fetch('/api/state')
      .then((response) => response.json())
      .then((next: AppState) => {
        receive(next);
        setConnected(true);
      })
      .catch(() => setConnected(false));

    const events = new EventSource('/api/events');
    events.onmessage = (event) => {
      receive(JSON.parse(event.data) as AppState);
      setConnected(true);
    };
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, [receive]);

  const save = useCallback(
    async (next: AppState) => {
      receive(next);
      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error('save-failed');
        setConnected(true);
      } catch {
        setConnected(false);
        localStorage.setItem('studystream:fallback-state', JSON.stringify(next));
      }
    },
    [receive],
  );

  const update = useCallback(
    (mutator: Mutator) => {
      const current = stateRef.current;
      if (!current) return;
      void save(mutator(current));
    },
    [save],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (readOnly) return;
    if (!state) return;
    const due = state.session.phaseEndsAt !== null
      && remainingSeconds(state.session, now) === 0
      && state.session.phase !== 'idle';
    if (!due) return;
    update((current) => {
      const checkpointed = materializeSession(current.session, now);
      const nextPhase = checkpointed.phase === 'study' ? 'break' : 'study';
      const minutes = nextPhase === 'study' ? current.settings.studyMinutes : current.settings.breakMinutes;
      return {
        ...current,
        session: {
          ...checkpointed,
          phase: nextPhase,
          tracking: nextPhase === 'study',
          phaseStartedAt: now,
          phaseEndsAt: now + minutes * 60_000,
          pausedRemainingSeconds: null,
          lastCheckpointAt: now,
        },
      };
    });
  }, [now, readOnly, state, update]);

  useEffect(() => {
    if (readOnly) return;
    if (!state?.session.tracking) return;
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

  const actions = {
    startStudy: () =>
      changeSession((session, current, stamp) => ({
        ...session,
        sessionSeconds: session.phase === 'idle' ? 0 : session.sessionSeconds,
        phase: 'study',
        tracking: true,
        phaseStartedAt: stamp,
        phaseEndsAt: stamp + current.settings.studyMinutes * 60_000,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      })),
    toggleTracking: () =>
      changeSession((session, _current, stamp) => {
        if (session.phase !== 'study') return { ...session, tracking: false };
        if (session.tracking) {
          return {
            ...session,
            tracking: false,
            phaseEndsAt: null,
            pausedRemainingSeconds: remainingSeconds(session, stamp),
            lastCheckpointAt: stamp,
          };
        }
        const pausedRemaining = Math.max(
          0,
          session.pausedRemainingSeconds ?? remainingSeconds(session, stamp),
        );
        return {
          ...session,
          tracking: true,
          phaseEndsAt: stamp + pausedRemaining * 1000,
          pausedRemainingSeconds: null,
          lastCheckpointAt: stamp,
        };
      }),
    startBreak: () =>
      changeSession((session, current, stamp) => ({
        ...session,
        phase: 'break',
        tracking: false,
        phaseStartedAt: stamp,
        phaseEndsAt: stamp + current.settings.breakMinutes * 60_000,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      })),
    addStudyTime: (seconds: number) =>
      changeSession((session) => {
        const addedSeconds = Math.max(0, Math.floor(seconds));
        if (!addedSeconds) return session;
        const dayKey = session.dayKey;
        return {
          ...session,
          todaySeconds: session.todaySeconds + addedSeconds,
          totalSeconds: session.totalSeconds + addedSeconds,
          dailySeconds: {
            ...session.dailySeconds,
            [dayKey]: (session.dailySeconds?.[dayKey] ?? 0) + addedSeconds,
          },
        };
      }),
    finish: () =>
      changeSession((session, _current, stamp) => ({
        ...session,
        phase: 'idle',
        tracking: false,
        phaseStartedAt: null,
        phaseEndsAt: null,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      })),
  };

  const displaySession = state ? materializeSession(state.session, now) : null;
  return { state, displaySession, now, connected, update, actions };
}
