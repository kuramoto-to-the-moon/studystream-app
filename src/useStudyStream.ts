import { useCallback, useEffect, useRef, useState } from 'react';
import { playCompletionSound, prepareCompletionSound } from './completionSound';
import type { AppState, SessionState } from './model';
import { DEFAULT_SECONDARY_TEXT_OPACITY, materializeSession, remainingSeconds, widgetOrder } from './model';

type Mutator = (state: AppState) => AppState;

export function useStudyStream({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const stateRef = useRef<AppState | null>(null);
  const armedSoundDeadlineRef = useRef<number | null>(null);

  const receive = useCallback((next: AppState) => {
    const shouldUpgradeSecondaryText = (next.settings.secondaryTextDefaultVersion ?? 1) < 2
      && (next.settings.secondaryTextOpacity == null || next.settings.secondaryTextOpacity === 0.62);
    const shouldUpgradeDefaultStreak = (next.settings.defaultStreakVersion ?? 1) < 2;
    const withDefaults: AppState = {
      ...next,
      session: {
        ...next.session,
        intervalCompleted: next.session.intervalCompleted ?? false,
      },
      settings: {
        ...next.settings,
        autoCycleEnabled: next.settings.autoCycleEnabled ?? true,
        completionSoundEnabled: next.settings.completionSoundEnabled ?? true,
        note: next.settings.note ?? '',
        offstreamEnabled: next.settings.offstreamEnabled ?? false,
        showMetricSeconds: next.settings.showMetricSeconds ?? false,
        secondaryTextColor: next.settings.secondaryTextColor ?? next.settings.textColor,
        secondaryTextOpacity: shouldUpgradeSecondaryText
          ? DEFAULT_SECONDARY_TEXT_OPACITY
          : (next.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY),
        secondaryTextDefaultVersion: 2,
        defaultStreakVersion: 2,
        widgets: [
          ...next.settings.widgets,
          ...widgetOrder
            .filter((id) => !next.settings.widgets.some((widget) => widget.id === id))
            .map((id) => ({ id, visible: true })),
        ],
        streaks: shouldUpgradeDefaultStreak
          ? next.settings.streaks.map((item) => (
              item.id === 'smoke-free'
              && item.name === '禁煙'
              && (item.kind == null || item.kind === 'days')
              && item.startedOn === '2026-07-13'
                ? { id: 'workout', name: '筋トレ', kind: 'count' as const, count: 0, unit: '回', visible: item.visible }
                : item
            ))
          : next.settings.streaks,
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
      void playCompletionSound(state.session.phase);
    }
    armedSoundDeadlineRef.current = null;
    update((current) => {
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
            lastCheckpointAt: now,
          },
        };
      }
      const nextPhase = checkpointed.phase === 'study' ? 'break' : 'study';
      const minutes = nextPhase === 'study' ? current.settings.studyMinutes : current.settings.breakMinutes;
      return {
        ...current,
        session: {
          ...checkpointed,
          phase: nextPhase,
          tracking: nextPhase === 'study',
          intervalCompleted: false,
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

  const prepareEnabledCompletionSound = () => {
    if (stateRef.current?.settings.completionSoundEnabled ?? true) prepareCompletionSound();
  };

  const actions = {
    prepareCompletionSound: () => prepareCompletionSound(),
    startStudy: () => {
      prepareEnabledCompletionSound();
      changeSession((session, current, stamp) => ({
        ...session,
        sessionSeconds: session.phase === 'idle' ? 0 : session.sessionSeconds,
        phase: 'study',
        tracking: true,
        intervalCompleted: false,
        phaseStartedAt: stamp,
        phaseEndsAt: stamp + current.settings.studyMinutes * 60_000,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      }));
    },
    toggleTracking: () => {
      prepareEnabledCompletionSound();
      changeSession((session, _current, stamp) => {
        if (session.phase !== 'study') return { ...session, tracking: false };
        if (session.tracking) {
          return {
            ...session,
            tracking: false,
            intervalCompleted: false,
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
          intervalCompleted: false,
          phaseEndsAt: stamp + pausedRemaining * 1000,
          pausedRemainingSeconds: null,
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
        phaseEndsAt: stamp + current.settings.breakMinutes * 60_000,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      }));
    },
    addStudyTime: (seconds: number) =>
      changeSession((session) => {
        const addedSeconds = Math.max(0, Math.floor(seconds));
        if (!addedSeconds) return session;
        const dayKey = session.dayKey;
        return {
          ...session,
          todaySeconds: session.todaySeconds + addedSeconds,
          offstreamTodaySeconds: (session.offstreamTodaySeconds ?? 0) + addedSeconds,
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
        intervalCompleted: false,
        phaseStartedAt: null,
        phaseEndsAt: null,
        pausedRemainingSeconds: null,
        lastCheckpointAt: stamp,
      })),
  };

  const displaySession = state ? materializeSession(state.session, now) : null;
  return { state, displaySession, now, connected, update, actions };
}
