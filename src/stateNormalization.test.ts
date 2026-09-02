import { describe, expect, it } from 'vitest';
import { defaultViewerMessages, type AppState } from './model';
import { localizeFreshInstallState, normalizeAppState } from './stateNormalization';

function legacyState(): AppState {
  return {
    version: 1,
    session: {
      phase: 'study',
      tracking: false,
      phaseStartedAt: 1_000,
      phaseEndsAt: 61_000,
      lastCheckpointAt: 1_000,
      sessionSeconds: 0,
      todaySeconds: 0,
      totalSeconds: 0,
      dayKey: '2026-09-01',
    },
    settings: {
      studyMinutes: 30,
      breakMinutes: 10,
      language: 'ja',
      layout: 'horizontal',
      background: '#000000',
      backgroundOpacity: 0.9,
      textColor: '#ffffff',
      secondaryTextOpacity: 0.62,
      messages: {
        study: '  集中\nしています  ',
        paused: '',
        break: '',
        idle: '',
      },
      widgets: [{ id: 'state', visible: true }],
      streaks: [{
        id: 'smoke-free',
        name: '禁煙',
        kind: 'days',
        startedOn: '2026-07-13',
        visible: true,
      }],
    },
  };
}

describe('persisted state normalization', () => {
  it('upgrades defaults and fills missing board widgets', () => {
    const normalized = normalizeAppState(legacyState());

    expect(normalized.settings.studyDurationSeconds).toBe(1_800);
    expect(normalized.settings.autoCycleEnabled).toBe(true);
    expect(normalized.settings.secondaryTextColor).toBe('#a3a3a3');
    expect(normalized.settings.secondaryTextOpacity).toBe(1);
    expect(normalized.settings.secondaryTextDefaultVersion).toBe(4);
    expect(normalized.settings.backgroundOpacity).toBe(0.78);
    expect(normalized.settings.boardAppearanceDefaultVersion).toBe(3);
    expect(normalized.settings.messages.study).toBe('集中 しています');
    expect(normalized.settings.widgets.length).toBeGreaterThan(1);
    expect(normalized.settings.streaks[0]).toMatchObject({
      id: 'workout',
      name: '筋トレ',
      kind: 'count',
      count: 0,
    });
  });

  it('repairs the previous paused-timer representation', () => {
    const normalized = normalizeAppState(legacyState());

    expect(normalized.session.phaseEndsAt).toBeNull();
    expect(normalized.session.pausedRemainingSeconds).toBeGreaterThanOrEqual(0);
    expect(normalized.session.pauseReason).toBe('manual');
  });

  it('preserves every user-controlled setting on repeated timer snapshots', () => {
    const saved = normalizeAppState(legacyState());
    saved.updatedAt = 500;
    saved.settingsUpdatedAt = 500;
    saved.sessionUpdatedAt = 500;
    saved.settings.layout = 'vertical';
    saved.settings.studyDurationSeconds = 45_296;
    saved.settings.breakDurationSeconds = 7_321;
    saved.settings.autoCycleEnabled = false;
    saved.settings.completionSoundEnabled = false;
    saved.settings.completionSound = 'bell';
    saved.settings.boardFont = 'modern';
    saved.settings.colorPreset = 'custom';
    saved.settings.background = '#123456';
    saved.settings.backgroundOpacity = 0.37;
    saved.settings.textColor = '#fedcba';
    saved.settings.textOpacity = 0.84;
    saved.settings.secondaryTextColor = '#abcdef';
    saved.settings.secondaryTextOpacity = 0.73;
    saved.settings.showMetricSeconds = true;
    saved.settings.widgets = saved.settings.widgets.map((widget) => ({
      ...widget,
      visible: widget.id === 'today' || widget.id === 'metric7',
    }));
    saved.settings.streaks = [{
      id: 'books',
      name: '読書',
      kind: 'count',
      count: 42,
      unit: '冊',
      visible: false,
    }];

    const normalized = normalizeAppState({
      ...saved,
      updatedAt: 501,
      sessionUpdatedAt: 501,
      session: { ...saved.session, lastCheckpointAt: 20_000, totalSeconds: 99 },
    });

    expect(normalized.settings).toMatchObject({
      layout: 'vertical',
      studyDurationSeconds: 45_296,
      breakDurationSeconds: 7_321,
      autoCycleEnabled: false,
      completionSoundEnabled: false,
      completionSound: 'bell',
      boardFont: 'modern',
      colorPreset: 'custom',
      background: '#123456',
      backgroundOpacity: 0.37,
      textColor: '#fedcba',
      textOpacity: 0.84,
      secondaryTextColor: '#abcdef',
      secondaryTextOpacity: 0.73,
      showMetricSeconds: true,
      streaks: [{ id: 'books', name: '読書', count: 42, visible: false }],
    });
    expect(normalized.settings.widgets).toEqual(saved.settings.widgets);
    expect(normalized.settingsUpdatedAt).toBe(500);
    expect(normalized.sessionUpdatedAt).toBe(501);
  });

  it('upgrades the previous accessible-color default without changing custom colors', () => {
    const previousDefault = normalizeAppState(legacyState());
    previousDefault.settings.backgroundOpacity = 0.62;
    previousDefault.settings.boardAppearanceDefaultVersion = 2;
    previousDefault.settings.secondaryTextColor = '#a3a3a3';
    previousDefault.settings.secondaryTextOpacity = 1;

    const upgraded = normalizeAppState(previousDefault);
    expect(upgraded.settings.backgroundOpacity).toBe(0.78);
    expect(upgraded.settings.boardAppearanceDefaultVersion).toBe(3);

    previousDefault.settings.background = '#123456';
    previousDefault.settings.backgroundOpacity = 0.62;
    const custom = normalizeAppState(previousDefault);
    expect(custom.settings.backgroundOpacity).toBe(0.62);
  });
});

describe('fresh-install viewer language', () => {
  function freshInstall(): AppState {
    const state = legacyState();
    state.updatedAt = 0;
    state.session = {
      ...state.session,
      phase: 'idle',
      tracking: false,
      phaseEndsAt: null,
      sessionSeconds: 0,
      todaySeconds: 0,
      totalSeconds: 0,
    };
    state.settings.messages = { ...defaultViewerMessages.ja };
    return state;
  }

  it('uses English viewer defaults for a fresh install on an English system', () => {
    const original = freshInstall();
    const localized = localizeFreshInstallState(original, 'en');

    expect(localized).not.toBe(original);
    expect(localized.settings.language).toBe('en');
    expect(localized.settings.speechLanguage).toBe('en');
    expect(localized.settings.messages).toEqual(defaultViewerMessages.en);
  });

  it('keeps Japanese defaults on a Japanese system', () => {
    const original = freshInstall();
    expect(localizeFreshInstallState(original, 'ja')).toBe(original);
  });

  it('never overwrites an edited message or an existing saved state', () => {
    const edited = freshInstall();
    edited.settings.messages.study = 'My own message';
    expect(localizeFreshInstallState(edited, 'en')).toBe(edited);

    const saved = freshInstall();
    saved.updatedAt = 1;
    expect(localizeFreshInstallState(saved, 'en')).toBe(saved);
  });
});
