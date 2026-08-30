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
    stateRef.current = next;
    setState(next);
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
    const due = remainingSeconds(state.session, now) === 0 && state.session.phase !== 'idle';
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
    (changes: (session: SessionState, current: AppState) => SessionState) => {
      const stamp = Date.now();
      update((current) => {
        const session = materializeSession(current.session, stamp);
        return { ...current, session: changes(session, current) };
      });
    },
    [update],
  );

  const actions = {
    startStudy: () =>
      changeSession((session, current) => ({
        ...session,
        sessionSeconds: session.phase === 'idle' ? 0 : session.sessionSeconds,
        phase: 'study',
        tracking: true,
        phaseStartedAt: Date.now(),
        phaseEndsAt: Date.now() + current.settings.studyMinutes * 60_000,
        lastCheckpointAt: Date.now(),
      })),
    toggleTracking: () =>
      changeSession((session) => ({
        ...session,
        tracking: session.phase === 'study' ? !session.tracking : false,
        lastCheckpointAt: Date.now(),
      })),
    startBreak: () =>
      changeSession((session, current) => ({
        ...session,
        phase: 'break',
        tracking: false,
        phaseStartedAt: Date.now(),
        phaseEndsAt: Date.now() + current.settings.breakMinutes * 60_000,
        lastCheckpointAt: Date.now(),
      })),
    finish: () =>
      changeSession((session) => ({
        ...session,
        phase: 'idle',
        tracking: false,
        phaseStartedAt: null,
        phaseEndsAt: null,
        lastCheckpointAt: Date.now(),
      })),
  };

  const displaySession = state ? materializeSession(state.session, now) : null;
  return { state, displaySession, now, connected, update, actions };
}
