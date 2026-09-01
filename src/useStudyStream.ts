import { useCallback, useEffect, useRef, useState } from 'react';
import { playCompletionSound, prepareCompletionSound } from './completionSound';
import type { AppState, CompletionSound, SessionState } from './model';
import { DEFAULT_BOARD_APPEARANCE, DEFAULT_SECONDARY_TEXT_OPACITY, MESSAGE_MAX_LENGTH, NOTE_MAX_LENGTH, intervalDurationSeconds, materializeSession, normalizeViewerCopy, phaseTimerPaused, remainingSeconds, resolveBoardFont, resolveCompletionSound, resolveMetricKinds, widgetOrder } from './model';

type Mutator = (state: AppState) => AppState;

export function useStudyStream({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const stateRef = useRef<AppState | null>(null);
  const armedSoundDeadlineRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);

  const receive = useCallback((next: AppState) => {
    const studyDurationSeconds = intervalDurationSeconds(next.settings, 'study');
    const breakDurationSeconds = intervalDurationSeconds(next.settings, 'break');
    const shouldUpgradeSecondaryText = (next.settings.secondaryTextDefaultVersion ?? 1) < 2
      && (next.settings.secondaryTextOpacity == null || next.settings.secondaryTextOpacity === 0.62);
    const usesPreviousBoardAppearance = next.settings.background.toLowerCase() === '#000000'
      && next.settings.backgroundOpacity === 0.9
      && next.settings.textColor.toLowerCase() === '#ffffff'
      && (next.settings.textOpacity ?? 1) === 1
      && (next.settings.secondaryTextColor ?? next.settings.textColor).toLowerCase() === '#ffffff'
      && (next.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) === DEFAULT_SECONDARY_TEXT_OPACITY;
    const shouldUpgradeBoardAppearance = (next.settings.boardAppearanceDefaultVersion ?? 1) < 2
      && usesPreviousBoardAppearance;
    const shouldUpgradeDefaultStreak = (next.settings.defaultStreakVersion ?? 1) < 2;
    const withDefaults: AppState = {
      ...next,
      updatedAt: next.updatedAt ?? 0,
      session: {
        ...next.session,
        intervalCompleted: next.session.intervalCompleted ?? false,
      },
      settings: {
        ...next.settings,
        studyMinutes: Math.max(1, Math.ceil(studyDurationSeconds / 60)),
        breakMinutes: Math.max(1, Math.ceil(breakDurationSeconds / 60)),
        studyDurationSeconds,
        breakDurationSeconds,
        autoCycleEnabled: next.settings.autoCycleEnabled ?? true,
        completionSoundEnabled: next.settings.completionSoundEnabled ?? true,
        completionSound: resolveCompletionSound(next.settings.completionSound),
        boardFont: resolveBoardFont(next.settings.boardFont),
        note: normalizeViewerCopy(next.settings.note ?? '', NOTE_MAX_LENGTH),
        showMetricSeconds: next.settings.showMetricSeconds ?? false,
        metricKinds: resolveMetricKinds(next.settings.metricKinds),
        messages: {
          study: normalizeViewerCopy(next.settings.messages.study, MESSAGE_MAX_LENGTH),
          paused: normalizeViewerCopy(next.settings.messages.paused, MESSAGE_MAX_LENGTH),
          break: normalizeViewerCopy(next.settings.messages.break, MESSAGE_MAX_LENGTH),
          idle: normalizeViewerCopy(next.settings.messages.idle, MESSAGE_MAX_LENGTH),
        },
        secondaryTextColor: next.settings.secondaryTextColor ?? next.settings.textColor,
        secondaryTextOpacity: shouldUpgradeSecondaryText
          ? DEFAULT_SECONDARY_TEXT_OPACITY
          : (next.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY),
        secondaryTextDefaultVersion: 2,
        backgroundOpacity: shouldUpgradeBoardAppearance
          ? DEFAULT_BOARD_APPEARANCE.backgroundOpacity
          : next.settings.backgroundOpacity,
        boardAppearanceDefaultVersion: 2,
        defaultStreakVersion: 2,
        widgets: [
          ...next.settings.widgets,
          ...widgetOrder
            .filter((id) => !next.settings.widgets.some((widget) => widget.id === id))
            .map((id) => ({ id, visible: !['metric4', 'metric5', 'metric6', 'metric7'].includes(id) })),
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
      // The control screen already applies its own edits optimistically. Ignore
      // its older server echoes until the ordered save queue has caught up.
      if (!readOnly && pendingSavesRef.current > 0) return;
      receive(JSON.parse(event.data) as AppState);
      setConnected(true);
    };
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, [readOnly, receive]);

  const save = useCallback(
    (next: AppState) => {
      receive(next);
      pendingSavesRef.current += 1;
      const task = saveQueueRef.current
        .then(async () => {
          try {
            const response = await fetch('/api/state', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(next),
            });
            if (response.status === 409) {
              const latestResponse = await fetch('/api/state');
              if (!latestResponse.ok) throw new Error('reload-after-conflict-failed');
              receive(await latestResponse.json() as AppState);
              setConnected(true);
              return;
            }
            if (!response.ok) throw new Error('save-failed');
            setConnected(true);
          } catch {
            setConnected(false);
            localStorage.setItem('studystream:fallback-state', JSON.stringify(next));
          }
        })
        .finally(() => {
          pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
        });
      saveQueueRef.current = task;
      return task;
    },
    [receive],
  );

  const update = useCallback(
    (mutator: Mutator) => {
      const current = stateRef.current;
      if (!current) return;
      const changed = mutator(current);
      if (changed === current) return;
      const updatedAt = Math.max(Date.now(), (current.updatedAt ?? 0) + 1);
      void save({ ...changed, updatedAt });
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
        lastCheckpointAt: stamp,
      }));
    },
    addStudyTime: (seconds: number) =>
      changeSession((session) => {
        const requestedSeconds = Math.trunc(seconds);
        const currentOffstreamSeconds = Math.max(0, session.offstreamTodaySeconds ?? 0);
        const adjustedSeconds = requestedSeconds >= 0
          ? requestedSeconds
          : -Math.min(currentOffstreamSeconds, Math.abs(requestedSeconds));
        if (!adjustedSeconds) return session;
        const dayKey = session.dayKey;
        return {
          ...session,
          todaySeconds: Math.max(0, session.todaySeconds + adjustedSeconds),
          offstreamTodaySeconds: Math.max(0, currentOffstreamSeconds + adjustedSeconds),
          totalSeconds: Math.max(0, session.totalSeconds + adjustedSeconds),
          dailySeconds: {
            ...session.dailySeconds,
            [dayKey]: Math.max(0, (session.dailySeconds?.[dayKey] ?? 0) + adjustedSeconds),
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
