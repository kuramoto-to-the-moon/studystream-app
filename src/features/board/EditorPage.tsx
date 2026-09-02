import { useEffect, useMemo, useState } from 'react';
import { Board } from '../../Board';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { SegmentedControl, SegmentedOption } from '../../components/ui/SegmentedControl';
import { useI18n } from '../../i18n';
import type { AppState, BoardColorPreset, SessionState, WidgetId } from '../../model';
import {
  DEFAULT_BOARD_APPEARANCE,
  DEFAULT_SECONDARY_TEXT_COLOR,
  DEFAULT_SECONDARY_TEXT_OPACITY,
  defaultViewerMessages,
  MESSAGE_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  intervalDurationSeconds,
  metricKindIds,
  metricLabels,
  metricSlotIds,
  normalizeViewerCopy,
  phaseKey,
  recommendedObsSize,
  resolveBoardFont,
  resolveMetricKinds,
  widgetLabels,
  widgetOrder,
} from '../../model';
import type { useStudyStream } from '../../useStudyStream';
import { CustomItemsEditor } from './CustomItemsEditor';
import { VisibilityButton } from './VisibilityButton';

const EDITOR_PREVIEW_QUERY = '(min-width: 1120px)';
const EDITOR_PREVIEW_STORAGE_KEY = 'studystream-editor-preview';
const BOARD_COLOR_PRESETS = {
  dark: {
    label: 'ダーク',
    background: '#000000',
    backgroundOpacity: DEFAULT_BOARD_APPEARANCE.backgroundOpacity,
    textColor: '#ffffff',
    textOpacity: 1,
    secondaryTextColor: DEFAULT_SECONDARY_TEXT_COLOR,
    secondaryTextOpacity: DEFAULT_SECONDARY_TEXT_OPACITY,
  },
  light: {
    label: 'ライト',
    background: '#ffffff',
    backgroundOpacity: 0.82,
    textColor: '#111111',
    textOpacity: 1,
    secondaryTextColor: '#555555',
    secondaryTextOpacity: 1,
  },
} as const;

function messagePreviewSession(
  session: SessionState,
  messageKey: keyof AppState['settings']['messages'],
  now: number,
  settings: Pick<AppState['settings'], 'studyMinutes' | 'breakMinutes' | 'studyDurationSeconds' | 'breakDurationSeconds'>,
): SessionState {
  const studySeconds = intervalDurationSeconds(settings, 'study');
  const breakSeconds = intervalDurationSeconds(settings, 'break');

  if (messageKey === 'study') {
    return {
      ...session,
      phase: 'study',
      tracking: true,
      intervalCompleted: false,
      phaseStartedAt: now,
      phaseEndsAt: now + studySeconds * 1000,
      pausedRemainingSeconds: null,
      lastCheckpointAt: now,
    };
  }

  if (messageKey === 'paused') {
    return {
      ...session,
      phase: 'study',
      tracking: false,
      intervalCompleted: false,
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingSeconds: studySeconds,
      lastCheckpointAt: now,
    };
  }

  if (messageKey === 'break') {
    return {
      ...session,
      phase: 'break',
      tracking: false,
      intervalCompleted: false,
      phaseStartedAt: now,
      phaseEndsAt: now + breakSeconds * 1000,
      pausedRemainingSeconds: null,
      lastCheckpointAt: now,
    };
  }

  return {
    ...session,
    phase: 'idle',
    tracking: false,
    intervalCompleted: false,
    phaseStartedAt: null,
    phaseEndsAt: null,
    pausedRemainingSeconds: null,
    lastCheckpointAt: now,
  };
}

export function EditorPage({
  state,
  session,
  now,
  patchSettings,
  patchState,
  tourActive = false,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
  tourActive?: boolean;
}) {
  const { language, t } = useI18n();
  const viewerLanguage = state.settings.language;
  const interfaceLanguage = language;
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');
  const [previewOpen, setPreviewOpen] = useState(() => window.localStorage.getItem(EDITOR_PREVIEW_STORAGE_KEY) === 'open');
  const [widePreview, setWidePreview] = useState(() => window.matchMedia(EDITOR_PREVIEW_QUERY).matches);
  const [messageEditorKey, setMessageEditorKey] = useState<keyof AppState['settings']['messages']>(phaseKey(session));
  const metricKinds = resolveMetricKinds(state.settings.metricKinds);
  const timeMetricKinds = metricKindIds.filter((kind) => kind !== 'streaks');
  const streakMetricSlotId = metricSlotIds.find((slotId) => metricKinds[slotId] === 'streaks')!;
  const showPreview = widePreview || previewOpen || tourActive;
  const secondaryContrast = useMemo(() => minimumBoardContrast(
    state.settings.background,
    state.settings.backgroundOpacity,
    state.settings.secondaryTextColor ?? state.settings.textColor,
    state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY,
  ), [
    state.settings.background,
    state.settings.backgroundOpacity,
    state.settings.secondaryTextColor,
    state.settings.secondaryTextOpacity,
    state.settings.textColor,
  ]);
  const secondaryContrastLevel = secondaryContrast >= 7 ? 'AAA' : secondaryContrast >= 4.5 ? 'AA' : 'AA未満';
  const matchingColorPreset = useMemo(() => Object.entries(BOARD_COLOR_PRESETS).find(([, preset]) => (
    state.settings.background.toLowerCase() === preset.background
    && state.settings.textColor.toLowerCase() === preset.textColor
    && (state.settings.secondaryTextColor ?? state.settings.textColor).toLowerCase() === preset.secondaryTextColor
    && state.settings.backgroundOpacity === preset.backgroundOpacity
    && (state.settings.textOpacity ?? 1) === preset.textOpacity
    && (state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) === preset.secondaryTextOpacity
  ))?.[0] as Exclude<BoardColorPreset, 'custom'> | undefined, [
    state.settings.background,
    state.settings.backgroundOpacity,
    state.settings.secondaryTextColor,
    state.settings.secondaryTextOpacity,
    state.settings.textColor,
    state.settings.textOpacity,
  ]);
  const activeColorPreset: BoardColorPreset = state.settings.colorPreset === 'custom'
    ? 'custom'
    : (matchingColorPreset ?? 'custom');
  const previewSession = section === 'message'
    ? messagePreviewSession(session, messageEditorKey, now, state.settings)
    : session;
  const previewSize = useMemo(() => recommendedObsSize(state), [state.settings]);
  const setWidgetVisible = (id: WidgetId, visible: boolean) => {
    patchState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: current.settings.widgets.map((item) => item.id === id ? { ...item, visible } : item),
      },
    }));
  };
  const widgetIsVisible = (id: WidgetId) => state.settings.widgets.find((item) => item.id === id)?.visible ?? true;

  useEffect(() => {
    const media = window.matchMedia(EDITOR_PREVIEW_QUERY);
    const updatePreviewMode = () => setWidePreview(media.matches);
    updatePreviewMode();
    media.addEventListener('change', updatePreviewMode);
    return () => media.removeEventListener('change', updatePreviewMode);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_PREVIEW_STORAGE_KEY, previewOpen ? 'open' : 'closed');
  }, [previewOpen]);

  useEffect(() => {
    if (tourActive) setSection('widget');
  }, [tourActive]);

  return (
    <main className={`page editor-page${showPreview ? '' : ' preview-hidden'}`}>
      <header className="editor-page-header page-heading">
        <div className="editor-title-row">
          <div>
            <h1>{t('配信表示を編集')}</h1>
            <p>{t('視聴者に表示する内容と見た目を調整します')}</p>
          </div>
          {!widePreview && <Button
            variant="surface"
            size="sm"
            className="preview-toggle-button"
            aria-label={previewOpen ? t('プレビューを閉じる') : t('プレビューを表示')}
            title={previewOpen ? t('プレビューを閉じる') : t('プレビューを表示')}
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
              <circle cx="10" cy="10" r="2.1" />
              {!previewOpen && <path d="m4 4 12 12" />}
            </svg>
            <span>{t('プレビュー')}</span>
          </Button>}
        </div>
      </header>
      {showPreview && <section className="panel editor-preview-panel" data-tour="editor-preview">
        <div className="preview-card-heading">
          <h2>{t('視聴者表示プレビュー')}</h2>
          <span>{section === 'message'
            ? (language === 'ja' ? `${messageLabels[interfaceLanguage][messageEditorKey]}の表示を確認中（プレビューのみ）` : `Previewing ${messageLabels[interfaceLanguage][messageEditorKey]} (preview only)`)
            : t('OBSに表示される画面')}</span>
        </div>
        <div
          className={`preview-canvas editor-canvas preview-${state.settings.layout}`}
          style={{ '--board-preview-height': `${previewSize.height}px` } as React.CSSProperties}
        >
          <Board
            state={state}
            session={previewSession}
            now={now}
          />
        </div>
      </section>}

      <aside className="panel inspector">
        <SegmentedControl className="inspector-tabs" label={t('編集する内容')} data-tour="editor-tabs">
          <SegmentedOption selected={section === 'widget'} onSelect={() => setSection('widget')}>{t('表示内容')}</SegmentedOption>
          <SegmentedOption selected={section === 'message'} onSelect={() => setSection('message')}>{t('メッセージ')}</SegmentedOption>
          <SegmentedOption selected={section === 'appearance'} onSelect={() => setSection('appearance')}>{t('レイアウト')}</SegmentedOption>
        </SegmentedControl>

        {section === 'widget' && (
          <div className="inspector-content widget-inspector-content">
            <section className="settings-section" aria-label={t('メイン表示')}>
              <div className="settings-section-heading"><strong>{t('メイン表示')}</strong></div>
              <div className="visibility-list" data-tour="editor-main-display">
                {[...state.settings.widgets].filter((widget) => ['state', 'timer', 'message'].includes(widget.id)).sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id)).map((widget) => (
                  <div key={widget.id}>
                    <span>{widgetLabels[interfaceLanguage][widget.id]}</span>
                    <VisibilityButton
                      label={widgetLabels[interfaceLanguage][widget.id]}
                      visible={widget.visible}
                      onToggle={() => setWidgetVisible(widget.id, !widget.visible)}
                    />
                  </div>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-heading"><strong>{t('学習時間')}</strong></div>
              <div className="metric-slot-list">
                {timeMetricKinds.map((kind) => {
                  const slotId = metricSlotIds.find((candidate) => metricKinds[candidate] === kind)!;
                  const widget = state.settings.widgets.find((item) => item.id === slotId);
                  return (
                    <div className="metric-slot-row" key={kind}>
                      <span>{metricLabels[interfaceLanguage][kind]}</span>
                      <VisibilityButton
                        label={metricLabels[interfaceLanguage][kind]}
                        visible={widget?.visible ?? true}
                        onToggle={() => setWidgetVisible(slotId, !(widget?.visible ?? true))}
                      />
                    </div>
                  );
                })}
              </div>
              <label className="metric-seconds-option">
                <input
                  type="checkbox"
                  checked={state.settings.showMetricSeconds ?? false}
                  onChange={(event) => patchSettings({ showMetricSeconds: event.target.checked })}
                />
                <span><strong>{t('秒まで表示')}</strong></span>
              </label>
            </section>
            <section className="settings-section offstream-settings-section">
              <div className="settings-section-heading settings-section-heading-with-action" data-tour="editor-custom-items">
                <div className="settings-section-heading-copy">
                  <strong>{t('配信外の学習')}</strong>
                  <span>{t('配信外で追加した今日の学習時間')}</span>
                </div>
                <VisibilityButton
                  label={t('配信外の学習')}
                  visible={widgetIsVisible('offstream')}
                  onToggle={() => setWidgetVisible('offstream', !widgetIsVisible('offstream'))}
                />
              </div>
            </section>
            <section className="settings-section custom-items-section">
              <div className="settings-section-heading settings-section-heading-with-action">
                <strong>{t('カスタム項目')}</strong>
                <VisibilityButton
                  label={t('カスタム項目')}
                  visible={widgetIsVisible(streakMetricSlotId)}
                  onToggle={() => setWidgetVisible(streakMetricSlotId, !widgetIsVisible(streakMetricSlotId))}
                />
              </div>
              <CustomItemsEditor state={state} patchState={patchState} />
            </section>
            <section className="settings-section language-settings-section">
              <div className="settings-section-heading"><strong>{t('表示言語')}</strong></div>
              <Select
                className="language-select"
                aria-label={t('配信表示の言語')}
                value={state.settings.language}
                onChange={(event) => patchSettings({ language: event.target.value as 'ja' | 'en' })}
              >
                <option value="ja">{t('日本語')}</option>
                <option value="en">English</option>
              </Select>
            </section>
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content compact-inspector-content">
            <div className="settings-section-heading message-section-heading">
              <strong>{t('状態別メッセージ')}</strong>
            </div>
            <SegmentedControl className="message-state-grid" label={t('確認する状態')}>
              {(['study', 'paused', 'break', 'idle'] as const).map((messageKey) => (
                <SegmentedOption
                  key={messageKey}
                  selected={messageEditorKey === messageKey}
                  onSelect={() => setMessageEditorKey(messageKey)}
                >
                  <strong>{messageLabels[interfaceLanguage][messageKey]}</strong>
                </SegmentedOption>
              ))}
            </SegmentedControl>
            <div className="message-editor-box">
              <textarea
                rows={4}
                maxLength={MESSAGE_MAX_LENGTH}
                aria-label={language === 'ja' ? `${messageLabels[interfaceLanguage][messageEditorKey]}の表示文` : `${messageLabels[interfaceLanguage][messageEditorKey]} message`}
                value={state.settings.messages[messageEditorKey]}
                onChange={(event) => patchSettings({ messages: { ...state.settings.messages, [messageEditorKey]: normalizeViewerCopy(event.target.value, MESSAGE_MAX_LENGTH) } })}
              />
              <div className="message-editor-footer">
                <Select
                  aria-label={t('定型文から選ぶ')}
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    patchSettings({ messages: { ...state.settings.messages, [messageEditorKey]: event.target.value } });
                  }}
                >
                  <option value="">{t('定型文から選ぶ…')}</option>
                  {messageTemplates[viewerLanguage][messageEditorKey].map((template) => <option key={template} value={template}>{template}</option>)}
                </Select>
                <small>{state.settings.messages[messageEditorKey].length}/{MESSAGE_MAX_LENGTH}{t('文字')}</small>
              </div>
            </div>
            <section className="settings-section persistent-note-section">
              <div className="settings-section-heading settings-section-heading-with-action">
                <div className="settings-section-heading-copy"><strong>{t('常時表示する注記')}</strong></div>
                <VisibilityButton
                  label={t('常時表示する注記')}
                  visible={widgetIsVisible('note')}
                  onToggle={() => setWidgetVisible('note', !widgetIsVisible('note'))}
                />
              </div>
              <textarea
                className="persistent-note-input"
                rows={3}
                maxLength={NOTE_MAX_LENGTH}
                aria-label={t('常時表示する注記')}
                placeholder={t('例：資格試験まであと30日')}
                value={state.settings.note ?? ''}
                onChange={(event) => patchSettings({ note: normalizeViewerCopy(event.target.value, NOTE_MAX_LENGTH) })}
              />
              <small className="character-count">{(state.settings.note ?? '').length}/{NOTE_MAX_LENGTH}{t('文字')}</small>
            </section>
          </div>
        )}

        {section === 'appearance' && (
          <div className="inspector-content compact-inspector-content appearance-inspector-content">
            <section className="settings-section appearance-layout-section">
              <div className="settings-section-heading"><strong>{t('向き')}</strong></div>
              <SegmentedControl className="layout-options" label={t('レイアウト')}>
                <SegmentedOption selected={state.settings.layout === 'horizontal'} onSelect={() => patchSettings({ layout: 'horizontal' })}>
                  <span className="layout-option-preview horizontal" aria-hidden="true" />
                  <span>{t('横長')}</span>
                </SegmentedOption>
                <SegmentedOption selected={state.settings.layout === 'vertical'} onSelect={() => patchSettings({ layout: 'vertical' })}>
                  <span className="layout-option-preview vertical" aria-hidden="true" />
                  <span>{t('縦長')}</span>
                </SegmentedOption>
              </SegmentedControl>
            </section>
            <section className="settings-section appearance-font-section">
              <div className="settings-section-heading"><strong>{t('フォント')}</strong></div>
              <SegmentedControl className="font-options" label={t('視聴者表示のフォント')}>
                {([
                  ['sans', 'デフォルト'],
                  ['system', '端末標準'],
                  ['modern', 'モダン'],
                ] as const).map(([font, label]) => (
                  <SegmentedOption
                    key={font}
                    className={`font-option-${font}`}
                    selected={resolveBoardFont(state.settings.boardFont) === font}
                    onSelect={() => patchSettings({ boardFont: font })}
                  >
                    <strong>{t(label)}</strong>
                  </SegmentedOption>
                ))}
              </SegmentedControl>
            </section>
            <section className="settings-section appearance-color-section">
              <div className="settings-section-heading"><strong>{t('色と透過')}</strong></div>
              <div className="color-preset-group">
                <SegmentedControl label={t('配色プリセット')}>
                  {Object.entries(BOARD_COLOR_PRESETS).map(([id, preset]) => {
                    const presetId = id as Exclude<BoardColorPreset, 'custom'>;
                    return (
                      <SegmentedOption
                        key={id}
                        selected={activeColorPreset === presetId}
                        onSelect={() => patchSettings({
                          colorPreset: presetId,
                          background: preset.background,
                          backgroundOpacity: preset.backgroundOpacity,
                          textColor: preset.textColor,
                          textOpacity: preset.textOpacity,
                          secondaryTextColor: preset.secondaryTextColor,
                          secondaryTextOpacity: preset.secondaryTextOpacity,
                        })}
                      >
                        <span>{t(preset.label)}</span>
                      </SegmentedOption>
                    );
                  })}
                  <SegmentedOption
                    selected={activeColorPreset === 'custom'}
                    onSelect={() => patchSettings({ colorPreset: 'custom' })}
                  >{t('カスタム')}</SegmentedOption>
                </SegmentedControl>
              </div>
              <div className="color-control-list">
                <div className="color-control-row">
                  <span className="color-control-name">{t('背景')}</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.background }} title={t('背景色を選ぶ')}>
                    <input type="color" aria-label={t('背景色')} value={state.settings.background} onChange={(event) => patchSettings({ colorPreset: 'custom', background: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label={t('背景の不透明度')} type="range" min="0" max="100" value={state.settings.backgroundOpacity * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', backgroundOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round(state.settings.backgroundOpacity * 100)}%</output>
                </div>
                <div className="color-control-row">
                  <span className="color-control-name">{t('メイン文字')}</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.textColor }} title={t('文字色を選ぶ')}>
                    <input type="color" aria-label={t('文字色')} value={state.settings.textColor} onChange={(event) => patchSettings({ colorPreset: 'custom', textColor: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label={t('文字の不透明度')} type="range" min="0" max="100" value={(state.settings.textOpacity ?? 1) * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', textOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round((state.settings.textOpacity ?? 1) * 100)}%</output>
                </div>
                <div className="color-control-row">
                  <span className="color-control-name">{t('補助文字')}</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.secondaryTextColor ?? state.settings.textColor }} title={t('補助文字色を選ぶ')}>
                    <input type="color" aria-label={t('補助文字色')} value={state.settings.secondaryTextColor ?? state.settings.textColor} onChange={(event) => patchSettings({ colorPreset: 'custom', secondaryTextColor: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label={t('補助文字の不透明度')} type="range" min="0" max="100" value={(state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', secondaryTextOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round((state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) * 100)}%</output>
                </div>
              </div>
              <div className="color-settings-footer">
                <div className="color-accessibility-row">
                  <p>
                    <strong>{t('補助文字')} <span className={secondaryContrastLevel === 'AA未満' ? 'contrast-warning' : ''}>{secondaryContrast.toFixed(1)}:1 · {t(secondaryContrastLevel)}</span></strong>
                    <span>{t('コントラストは4.5:1以上を推奨')}</span>
                  </p>
                </div>
                <div className="color-reset-row">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patchSettings({ colorPreset: 'dark', ...DEFAULT_BOARD_APPEARANCE })}
                  >{t('初期設定に戻す')}</Button>
                </div>
              </div>
            </section>
          </div>
        )}
      </aside>
    </main>
  );
}

function minimumBoardContrast(background: string, backgroundOpacity: number, text: string, textOpacity: number) {
  const backgroundRgb = hexToRgb(background);
  const textRgb = hexToRgb(text);
  return Math.min(...[0, 255].map((backdrop) => {
    const backdropRgb: [number, number, number] = [backdrop, backdrop, backdrop];
    const effectiveBackground = compositeRgb(backgroundRgb, backgroundOpacity, backdropRgb);
    const effectiveText = compositeRgb(textRgb, textOpacity, effectiveBackground);
    return contrastRatio(effectiveText, effectiveBackground);
  }));
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '');
  const safe = normalized.length === 6 ? normalized : '000000';
  return [0, 2, 4].map((offset) => Number.parseInt(safe.slice(offset, offset + 2), 16)) as [number, number, number];
}

function compositeRgb(foreground: [number, number, number], opacity: number, background: [number, number, number]) {
  const alpha = Math.min(1, Math.max(0, opacity));
  return foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha)) as [number, number, number];
}

function contrastRatio(first: [number, number, number], second: [number, number, number]) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb: [number, number, number]) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}


const messageLabels = {
  ja: { study: '学習中', paused: '停止中', break: '休憩中', idle: '待機中' },
  en: { study: 'Studying', paused: 'Paused', break: 'On break', idle: 'Ready' },
} as const;

const messageTemplates = {
  ja: {
    study: [defaultViewerMessages.ja.study, 'ただいま学習中です。応援コメントありがとうございます。'],
    paused: [defaultViewerMessages.ja.paused, '一時停止中です。まもなく学習へ戻ります。'],
    break: [defaultViewerMessages.ja.break, '休憩中です。次の学習開始までお待ちください。'],
    idle: [defaultViewerMessages.ja.idle, '配信準備中です。少々お待ちください。'],
  },
  en: {
    study: [defaultViewerMessages.en.study, 'Study in progress. Thanks for cheering me on!'],
    paused: [defaultViewerMessages.en.paused, 'Paused for a moment. Study will resume soon.'],
    break: [defaultViewerMessages.en.break, 'Taking a break. The next study session starts soon.'],
    idle: [defaultViewerMessages.en.idle, 'Getting ready to stream. Please wait a moment.'],
  },
} as const;
