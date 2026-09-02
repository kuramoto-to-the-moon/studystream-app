import type { AppState, Language } from './model';
import {
  DEFAULT_BOARD_APPEARANCE,
  DEFAULT_SECONDARY_TEXT_COLOR,
  DEFAULT_SECONDARY_TEXT_OPACITY,
  MESSAGE_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  clampAutoPauseSeconds,
  defaultViewerMessages,
  intervalDurationSeconds,
  normalizeViewerCopy,
  remainingSeconds,
  resolveBoardFont,
  resolveCompletionSound,
  resolveMetricKinds,
  widgetOrder,
} from './model';

export function localizeFreshInstallState(next: AppState, language: Language): AppState {
  if (language === 'ja') return next;
  const messages = next.settings.messages;
  const japaneseDefaults = defaultViewerMessages.ja;
  const isUntouchedInstall = (next.updatedAt ?? 0) === 0
    && next.session.phase === 'idle'
    && next.session.sessionSeconds === 0
    && next.session.todaySeconds === 0
    && next.session.totalSeconds === 0
    && next.settings.language === 'ja'
    && messages.study === japaneseDefaults.study
    && messages.paused === japaneseDefaults.paused
    && messages.break === japaneseDefaults.break
    && messages.idle === japaneseDefaults.idle;

  if (!isUntouchedInstall) return next;
  return {
    ...next,
    settings: {
      ...next.settings,
      language,
      speechLanguage: language,
      messages: { ...defaultViewerMessages[language] },
    },
  };
}

/**
 * Upgrades persisted state to the current schema without performing I/O.
 * Keeping this pure makes migrations testable and prevents transport concerns
 * from leaking into the timer hook.
 */
export function normalizeAppState(next: AppState): AppState {
  const studyDurationSeconds = intervalDurationSeconds(next.settings, 'study');
  const breakDurationSeconds = intervalDurationSeconds(next.settings, 'break');
  const secondaryTextColor = next.settings.secondaryTextColor ?? next.settings.textColor;
  const secondaryTextOpacity = next.settings.secondaryTextOpacity;
  const usesPreviousSecondaryTextDefault = (
    secondaryTextColor.toLowerCase() === '#ffffff'
      && (secondaryTextOpacity == null || secondaryTextOpacity === 0.62 || secondaryTextOpacity === 0.78)
  ) || (
    secondaryTextColor.toLowerCase() === '#dedede'
      && secondaryTextOpacity === 1
  );
  const shouldUpgradeSecondaryText = (next.settings.secondaryTextDefaultVersion ?? 1) < 4
    && usesPreviousSecondaryTextDefault;
  const currentSecondaryTextColor = (next.settings.secondaryTextColor ?? next.settings.textColor).toLowerCase();
  const currentSecondaryTextOpacity = next.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY;
  const usesLegacyBoardAppearance = next.settings.backgroundOpacity === 0.9
    && currentSecondaryTextColor === '#ffffff'
    && [0.62, 0.78, 1].includes(currentSecondaryTextOpacity);
  const usesPreviousAccessibleBoardAppearance = next.settings.backgroundOpacity === 0.62
    && ['#dedede', '#a3a3a3'].includes(currentSecondaryTextColor)
    && currentSecondaryTextOpacity === 1;
  const usesPreviousBoardAppearance = next.settings.background.toLowerCase() === '#000000'
    && next.settings.textColor.toLowerCase() === '#ffffff'
    && (next.settings.textOpacity ?? 1) === 1
    && (usesLegacyBoardAppearance || usesPreviousAccessibleBoardAppearance);
  const shouldUpgradeBoardAppearance = (next.settings.boardAppearanceDefaultVersion ?? 1) < 3
    && usesPreviousBoardAppearance;
  const shouldUpgradeDefaultStreak = (next.settings.defaultStreakVersion ?? 1) < 2;
  const withDefaults: AppState = {
    ...next,
    updatedAt: next.updatedAt ?? 0,
    settingsUpdatedAt: next.settingsUpdatedAt ?? next.updatedAt ?? 0,
    sessionUpdatedAt: next.sessionUpdatedAt ?? next.updatedAt ?? 0,
    session: {
      ...next.session,
      intervalCompleted: next.session.intervalCompleted ?? false,
      pauseReason: next.session.pausedRemainingSeconds != null
        ? (next.session.pauseReason ?? 'manual')
        : null,
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
      autoPauseVoiceEnabled: next.settings.autoPauseVoiceEnabled ?? false,
      autoPauseVoiceSeconds: clampAutoPauseSeconds(next.settings.autoPauseVoiceSeconds ?? 2),
      speechLanguage: next.settings.speechLanguage === 'en' ? 'en' : 'ja',
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
      secondaryTextColor: shouldUpgradeSecondaryText
        ? DEFAULT_SECONDARY_TEXT_COLOR
        : secondaryTextColor,
      secondaryTextOpacity: shouldUpgradeSecondaryText
        ? DEFAULT_SECONDARY_TEXT_OPACITY
        : (next.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY),
      secondaryTextDefaultVersion: 4,
      backgroundOpacity: shouldUpgradeBoardAppearance
        ? DEFAULT_BOARD_APPEARANCE.backgroundOpacity
        : next.settings.backgroundOpacity,
      boardAppearanceDefaultVersion: 3,
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
  return session.phase === 'study'
    && !session.tracking
    && session.phaseEndsAt !== null
    && session.pausedRemainingSeconds == null
    ? {
        ...withDefaults,
        session: {
          ...session,
          phaseEndsAt: null,
          pausedRemainingSeconds: remainingSeconds(session),
          pauseReason: 'manual',
        },
      }
    : withDefaults;
}
