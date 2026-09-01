import { useEffect, useRef, useState } from 'react';
import { Board } from './Board';
import type { AppState, BoardColorPreset, CompletionSound, MetricWidgetId, SessionState, Streak, WidgetId } from './model';
import { DEFAULT_BOARD_APPEARANCE, DEFAULT_SECONDARY_TEXT_OPACITY, MESSAGE_MAX_LENGTH, NOTE_MAX_LENGTH, formatClock, formatDuration, intervalDurationSeconds, metricKindIds, metricLabels, metricSlotIds, normalizeViewerCopy, phaseKey, phaseLabel, phaseTimerPaused, remainingSeconds, resolveBoardFont, resolveMetricKinds, uiCopy, widgetLabels, widgetOrder } from './model';
import { useStudyStream } from './useStudyStream';

type Page = 'control' | 'editor';
type CopyState = 'idle' | 'copied' | 'failed';
type ObsSizeField = 'width' | 'height';

const OBS_OVERLAY_URL = 'http://127.0.0.1:47831/overlay';
const EDITOR_PREVIEW_QUERY = '(min-width: 1120px)';
const EDITOR_PREVIEW_STORAGE_KEY = 'studystream-editor-preview';
const BOARD_COLOR_PRESETS = {
  dark: {
    label: 'ダーク',
    background: '#000000',
    backgroundOpacity: DEFAULT_BOARD_APPEARANCE.backgroundOpacity,
    textColor: '#ffffff',
    textOpacity: 1,
    secondaryTextColor: '#ffffff',
    secondaryTextOpacity: 0.78,
  },
  light: {
    label: 'ライト',
    background: '#ffffff',
    backgroundOpacity: 0.82,
    textColor: '#111111',
    textOpacity: 1,
    secondaryTextColor: '#111111',
    secondaryTextOpacity: 0.78,
  },
} as const;

function DisclosureIcon() {
  return (
    <span className="disclosure-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>
    </span>
  );
}

export function App() {
  const overlayOnly = window.location.pathname === '/overlay' || new URLSearchParams(window.location.search).get('view') === 'overlay';
  const store = useStudyStream({ readOnly: overlayOnly });

  if (!store.state || !store.displaySession) {
    return <div className={overlayOnly ? 'overlay-loading' : 'app-loading'}>StudyStream</div>;
  }

  if (overlayOnly) {
    return (
      <main className="overlay-root">
        <Board state={store.state} session={store.displaySession} now={store.now} />
      </main>
    );
  }

  return <Dashboard store={store} />;
}

function DurationInput({
  label,
  seconds,
  onChange,
}: {
  label: string;
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  function updatePart(part: 'hours' | 'minutes' | 'seconds', value: string) {
    const parsed = Math.max(0, Number.parseInt(value, 10) || 0);
    const nextHours = part === 'hours' ? Math.min(24, parsed) : hours;
    const nextMinutes = part === 'minutes' ? Math.min(hours === 24 ? 0 : 59, parsed) : minutes;
    const nextSeconds = part === 'seconds' ? Math.min(hours === 24 ? 0 : 59, parsed) : remaining;
    onChange(Math.min(86_400, Math.max(1, nextHours * 3600 + nextMinutes * 60 + nextSeconds)));
  }

  return (
    <div className="duration-setting">
      <strong>{label}</strong>
      <div className="duration-fields">
        <label>
          <span>時間</span>
          <input aria-label={`${label}の時間`} type="number" min="0" max="24" step="1" inputMode="numeric" value={hours} onChange={(event) => updatePart('hours', event.target.value)} />
        </label>
        <label>
          <span>分</span>
          <input aria-label={`${label}の分`} type="number" min="0" max={hours === 24 ? 0 : 59} step="1" inputMode="numeric" value={minutes} onChange={(event) => updatePart('minutes', event.target.value)} />
        </label>
        <label>
          <span>秒</span>
          <input aria-label={`${label}の秒`} type="number" min="0" max={hours === 24 ? 0 : 59} step="1" inputMode="numeric" value={remaining} onChange={(event) => updatePart('seconds', event.target.value)} />
        </label>
      </div>
    </div>
  );
}

function Dashboard({ store }: { store: ReturnType<typeof useStudyStream> }) {
  const { state, displaySession, now, update, actions } = store;
  const [page, setPage] = useState<Page>('control');
  const [obsCopyState, setObsCopyState] = useState<CopyState>('idle');
  const [obsSizeCopyState, setObsSizeCopyState] = useState<{ field: ObsSizeField | null; state: CopyState }>({ field: null, state: 'idle' });
  const [obsDialogOpen, setObsDialogOpen] = useState(false);
  const obsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('studystream-app-theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('studystream-app-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    function closeSettingsOnOutsideClick(event: PointerEvent) {
      const settings = settingsRef.current;
      if (settings?.open && event.target instanceof Node && !settings.contains(event.target)) {
        settings.open = false;
      }
    }

    document.addEventListener('pointerdown', closeSettingsOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeSettingsOnOutsideClick);
  }, []);

  useEffect(() => {
    const dialog = obsDialogRef.current;
    if (!dialog) return;
    if (obsDialogOpen && !dialog.open) dialog.showModal();
    if (!obsDialogOpen && dialog.open) dialog.close();
  }, [obsDialogOpen]);

  if (!state || !displaySession) return null;

  const obsSize = recommendedObsSize(state);

  function patchState(mutator: (draft: AppState) => AppState) {
    update(mutator);
  }

  function patchSettings(changes: Partial<AppState['settings']>) {
    patchState((current) => ({ ...current, settings: { ...current.settings, ...changes } }));
  }

  function setIntervalDuration(phase: 'study' | 'break', seconds: number) {
    const safeSeconds = Math.min(86_400, Math.max(1, Math.floor(seconds)));
    patchSettings(phase === 'study'
      ? { studyDurationSeconds: safeSeconds, studyMinutes: Math.max(1, Math.ceil(safeSeconds / 60)) }
      : { breakDurationSeconds: safeSeconds, breakMinutes: Math.max(1, Math.ceil(safeSeconds / 60)) });
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function copyObsUrl() {
    try {
      const response = await fetch('/api/copy-obs-url', { method: 'POST' });
      if (!response.ok) throw new Error('Clipboard service unavailable');
      setObsCopyState('copied');
    } catch {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(OBS_OVERLAY_URL);
        setObsCopyState('copied');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = OBS_OVERLAY_URL;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        setObsCopyState(copied ? 'copied' : 'failed');
      }
    }
    window.setTimeout(() => setObsCopyState('idle'), 1800);
  }

  async function copyObsSize(field: ObsSizeField) {
    const value = String(obsSize[field]);
    let copied = false;
    try {
      const response = await fetch('/api/copy-obs-size', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: obsSize[field] }),
      });
      if (!response.ok) throw new Error('Clipboard service unavailable');
      copied = true;
    } catch {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      }
    }
    setObsSizeCopyState({ field, state: copied ? 'copied' : 'failed' });
    window.setTimeout(() => setObsSizeCopyState({ field: null, state: 'idle' }), 1800);
  }

  return (
    <div className="app-shell">
      <header className={`app-header app-header-${page}`}>
        <div className="app-header-inner">
          <div className="header-navigation">
            <button type="button" className="wordmark" title="ホームへ戻る" onClick={() => navigate('control')}>StudyStream</button>
            <span className="beta-badge">ベータ</span>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-obs-button"
              title="OBSへの追加方法を開く"
              aria-label="OBSへの追加方法を開く"
              onClick={() => setObsDialogOpen(true)}
            >
              <ObsLogo />
              <span>OBSへ追加</span>
            </button>
            <details ref={settingsRef} className="app-settings">
            <summary>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="M3 5h4m3 0h7M3 10h9m3 0h2M3 15h2m3 0h9" />
                <circle cx="8.5" cy="5" r="1.5" />
                <circle cx="13.5" cy="10" r="1.5" />
                <circle cx="6.5" cy="15" r="1.5" />
              </svg>
              <span>設定</span>
            </summary>
            <div className="app-settings-popover">
              <div className="app-settings-heading">
                <strong>アプリ設定</strong>
              </div>
              <div className="app-settings-group">
                <span>操作画面のテーマ</span>
                <div className="theme-options">
                  <button type="button" className={!darkMode ? 'active' : ''} onClick={() => setDarkMode(false)}>ライト</button>
                  <button type="button" className={darkMode ? 'active' : ''} onClick={() => setDarkMode(true)}>ダーク</button>
                </div>
              </div>
            </div>
            </details>
          </div>
        </div>
      </header>

      <dialog
        ref={obsDialogRef}
        className="obs-dialog"
        aria-labelledby="obs-dialog-title"
        onClose={() => setObsDialogOpen(false)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setObsDialogOpen(false);
        }}
      >
        <div className="obs-dialog-content">
          <div className="obs-dialog-heading">
            <span className="obs-dialog-logo" aria-hidden="true"><ObsLogo /></span>
            <div>
              <h2 id="obs-dialog-title">OBSに配信ボードを追加</h2>
              <p>ブラウザソースとして追加すると、StudyStreamの表示がそのまま反映されます。</p>
            </div>
            <button type="button" className="obs-dialog-close" aria-label="閉じる" onClick={() => setObsDialogOpen(false)}>×</button>
          </div>

          <ol className="obs-steps">
            <li><span>1</span><div><strong>OBSでソースを追加</strong><p>「ソース」の＋を押し、「ブラウザ」を選びます。</p></div></li>
            <li><span>2</span><div><strong>URLを設定</strong><p>下のURLをブラウザソースのURL欄へ貼り付けます。</p></div></li>
            <li><span>3</span><div><strong>幅と高さを設定</strong><p>現在の表示設定で必要になる最大サイズを入力します。</p></div></li>
          </ol>

          <div className="obs-setup-values">
            <div className="obs-url-field">
              <span>ブラウザソースURL</span>
              <div className="obs-url-control">
                <code title={OBS_OVERLAY_URL}>{OBS_OVERLAY_URL}</code>
                <button
                  type="button"
                  className={obsCopyState}
                  aria-live="polite"
                  onClick={() => void copyObsUrl()}
                >
                  {obsCopyState === 'copied' ? 'コピーしました' : obsCopyState === 'failed' ? 'コピー失敗' : 'URLをコピー'}
                </button>
              </div>
            </div>
            <div className="obs-size-fields" aria-label={`推奨サイズ 幅${obsSize.width} 高さ${obsSize.height}`}>
              <button type="button" onClick={() => void copyObsSize('width')} aria-label={`幅 ${obsSize.width} をコピー`}>
                <span>幅</span>
                <strong>{obsSize.width}</strong>
                <small aria-live="polite">{obsSizeCopyState.field === 'width' && obsSizeCopyState.state === 'copied' ? 'コピー済み' : obsSizeCopyState.field === 'width' && obsSizeCopyState.state === 'failed' ? '失敗' : 'コピー'}</small>
              </button>
              <span aria-hidden="true">×</span>
              <button type="button" onClick={() => void copyObsSize('height')} aria-label={`高さ ${obsSize.height} をコピー`}>
                <span>高さ</span>
                <strong>{obsSize.height}</strong>
                <small aria-live="polite">{obsSizeCopyState.field === 'height' && obsSizeCopyState.state === 'copied' ? 'コピー済み' : obsSizeCopyState.field === 'height' && obsSizeCopyState.state === 'failed' ? '失敗' : 'コピー'}</small>
              </button>
            </div>
            <p className="obs-size-note">状態や入力内容では変化しません。レイアウトや表示項目の設定を変えた時だけ更新されます。</p>
            <p className="obs-retina-note"><strong>Macでも2倍入力は不要です。</strong> OBSの幅と高さは画面の拡大率ではなく、ブラウザソースの表示サイズとして扱われます。</p>
          </div>

          <p className="obs-dialog-footnote">StudyStreamを起動したまま、OBSと同じ端末で使用してください。</p>
        </div>
      </dialog>

      {page === 'control' ? (
        <ControlPage
          state={state}
          session={displaySession}
          now={now}
          actions={actions}
          patchSettings={patchSettings}
          setIntervalDuration={setIntervalDuration}
          onEditBoard={() => navigate('editor')}
        />
      ) : (
        <EditorPage
          state={state}
          session={displaySession}
          now={now}
          patchSettings={patchSettings}
          patchState={patchState}
        />
      )}
    </div>
  );
}

function ObsLogo() {
  return (
    <svg className="obs-logo" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 5.8a5.25 5.25 0 0 1 4.55 7.88M17.42 14.9a5.25 5.25 0 0 1-9.1.05M7.45 13.68A5.25 5.25 0 0 1 12 5.8" />
      <circle cx="12" cy="12" r="2.35" />
    </svg>
  );
}

function VisibilityButton({ label, visible, onToggle }: { label: string; visible: boolean; onToggle: () => void }) {
  const action = visible ? '非表示にする' : '表示する';
  return (
    <button
      type="button"
      className={`visibility-button${visible ? ' visible' : ''}`}
      aria-label={`${label}を${action}`}
      aria-pressed={visible}
      title={`${label}を${action}`}
      onClick={onToggle}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
        <circle cx="10" cy="10" r="2.1" />
        {!visible && <path className="visibility-slash" d="m4 4 12 12" />}
      </svg>
    </button>
  );
}

function recommendedObsSize(state: AppState) {
  // OBS keeps one stable viewport while a stream is running. Reserve the
  // maximum space enabled by the current board configuration so phase changes,
  // new copy, and off-stream study input never require resizing the source.
  const visibleWidgets = state.settings.widgets.filter((widget) => widget.visible);
  const metricKinds = resolveMetricKinds(state.settings.metricKinds);
  const metricWidgets = visibleWidgets.filter((widget) => metricSlotIds.includes(widget.id as MetricWidgetId));
  const metricCount = metricWidgets.filter((widget) => metricKinds[widget.id as keyof typeof metricKinds] !== 'streaks').length;
  const hasExtraItem = metricWidgets.some((widget) => metricKinds[widget.id as keyof typeof metricKinds] === 'streaks');
  const visibleExtraItemCount = hasExtraItem ? state.settings.streaks.filter((item) => item.visible).length : 0;
  const supplementCount = (visibleWidgets.some((widget) => widget.id === 'offstream') ? 1 : 0) + visibleExtraItemCount;
  const hasSupplement = supplementCount > 0;
  const hasMessage = visibleWidgets.some((widget) => widget.id === 'message');
  const hasNote = visibleWidgets.some((widget) => widget.id === 'note');

  if (state.settings.layout === 'vertical') {
    const has = (id: (typeof visibleWidgets)[number]['id']) => visibleWidgets.some((widget) => widget.id === id);
    const calculatedHeight = (has('state') ? 43 : 0)
      + (has('timer') ? 84 : 0)
      // Messages and notes can occupy up to three lines. Recommend the
      // maximum rendered height so OBS never crops longer viewer copy.
      + (hasMessage ? 79 : 0)
      + (metricCount > 0 ? 24 + metricCount * 18 + Math.max(0, metricCount - 1) * 10 : 0)
      + (hasSupplement ? 16 + supplementCount * 18 + Math.max(0, supplementCount - 1) * 6 : 0)
      + (hasNote ? 65 : 0);
    return { width: 320, height: Math.max(84, calculatedHeight) };
  }

  const hasMainRow = visibleWidgets.some((widget) => ['state', 'timer', 'message'].includes(widget.id));
  const hasMetrics = metricCount > 0;
  const mainRowHeight = hasMainRow ? (hasMessage ? 83 : 56) : 0;
  const supplementRows = hasSupplement ? Math.max(1, Math.ceil(supplementCount / 3)) : 0;
  return {
    width: 600,
    height: mainRowHeight
      + (hasMetrics ? 34 : 0)
      + (hasSupplement ? 28 + Math.max(0, supplementRows - 1) * 20 : 0)
      + (hasNote ? 45 : 0),
  };
}

function ControlPage({
  state,
  session,
  now,
  actions,
  patchSettings,
  setIntervalDuration,
  onEditBoard,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  actions: ReturnType<typeof useStudyStream>['actions'];
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  setIntervalDuration: (phase: 'study' | 'break', seconds: number) => void;
  onEditBoard: () => void;
}) {
  const copy = uiCopy.ja;
  const isIntervalCompleted = session.intervalCompleted ?? false;
  const [offstreamHours, setOffstreamHours] = useState('');
  const [offstreamMinutes, setOffstreamMinutes] = useState('');
  const [offstreamFeedback, setOffstreamFeedback] = useState<'added' | 'subtracted' | null>(null);
  const offstreamSeconds = (
    Math.max(0, Number(offstreamHours) || 0) * 60
    + Math.max(0, Number(offstreamMinutes) || 0)
  ) * 60;
  const timerIsPaused = phaseTimerPaused(session);
  const studyIsSelected = session.phase === 'study' && !isIntervalCompleted;
  const breakIsSelected = session.phase === 'break' && !isIntervalCompleted;
  const studyIsActive = studyIsSelected && !timerIsPaused;
  const breakIsActive = breakIsSelected && !timerIsPaused;
  const adjustOffstreamStudy = (direction: 1 | -1) => {
    if (!offstreamSeconds) return;
    actions.addStudyTime(offstreamSeconds * direction);
    setOffstreamHours('');
    setOffstreamMinutes('');
    setOffstreamFeedback(direction === 1 ? 'added' : 'subtracted');
    window.setTimeout(() => setOffstreamFeedback(null), 1800);
  };

  return (
    <main className="page control-page">
      <header className="page-heading control-page-header">
        <div>
          <h1>学習タイマー</h1>
          <p>学習・休憩・一時停止を切り替え、学習時間を記録します</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="board-edit-button" aria-label="配信表示を編集" onClick={onEditBoard}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="3.5" width="14" height="13" rx="1.5" /><path d="M3 8h14M8 8v8.5" /></svg>
            <span>配信表示を編集</span>
          </button>
        </div>
      </header>
      <section className="panel session-panel">
        <div className="session-control-column">
          <div className="phase-summary">
            <div className="phase-status-line">
              <h1>
                <span>{phaseLabel(session, 'ja')}</span>
                {timerIsPaused && <small>停止中</small>}
              </h1>
            </div>
            <div className="control-clock">
              <strong>{formatClock(remainingSeconds(session, now))}</strong>
              <span>{copy.remaining}</span>
            </div>
          </div>

          <div className="control-actions" aria-label="配信状態と操作">
            <div className="control-action-primary">
              <div className="phase-switch" aria-label="配信状態">
                <button
                  type="button"
                  className={`phase-select-button${studyIsActive ? ' active' : ''}`}
                  aria-pressed={studyIsActive}
                  disabled={studyIsSelected}
                  onClick={actions.startStudy}
                >
                  学習
                </button>
                <button
                  type="button"
                  className={`phase-select-button${breakIsActive ? ' active' : ''}`}
                  aria-pressed={breakIsActive}
                  disabled={session.phase === 'idle' || breakIsSelected}
                  onClick={actions.startBreak}
                >
                  休憩
                </button>
              </div>
              {(studyIsSelected || breakIsSelected) && (
                <button
                  type="button"
                  className={`tracking-action-button${timerIsPaused ? ' active' : ''}`}
                  aria-pressed={timerIsPaused}
                  aria-label={timerIsPaused ? '再開' : '一時停止'}
                  title={timerIsPaused ? '再開' : '一時停止'}
                  onClick={actions.togglePause}
                >
                  {timerIsPaused ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7 5 8 5-8 5Z" /></svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 5v10M13 5v10" /></svg>
                  )}
                </button>
              )}
            </div>
            {session.phase !== 'idle' && (
              <button type="button" className="session-finish-button" onClick={actions.finish}>
                タイマーを終了
              </button>
            )}
          </div>
        </div>

        <div className="session-stats" aria-label="学習時間">
          <p className="session-stats-heading">学習時間</p>
          <div><strong>{formatDuration(session.sessionSeconds, 'ja')}</strong><span>{copy.session}</span></div>
          <div><strong>{formatDuration(session.todaySeconds, 'ja')}</strong><span>今日の合計</span></div>
          <div><strong>{formatDuration(session.totalSeconds, 'ja')}</strong><span>{copy.total}</span></div>
        </div>
      </section>
      <details className="panel timer-settings-panel">
        <summary>
          <span>
            <strong>タイマー設定</strong>
            <small>時間・自動切替・終了音</small>
          </span>
          <DisclosureIcon />
        </summary>
        <div className="timer-settings-content">
          <div className="timer-interval-options">
            <DurationInput
              label="学習時間"
              seconds={intervalDurationSeconds(state.settings, 'study')}
              onChange={(seconds) => setIntervalDuration('study', seconds)}
            />
            <DurationInput
              label="休憩時間"
              seconds={intervalDurationSeconds(state.settings, 'break')}
              onChange={(seconds) => setIntervalDuration('break', seconds)}
            />
          </div>
          <label className="auto-cycle-option timer-auto-cycle-option">
            <input
              type="checkbox"
              checked={state.settings.autoCycleEnabled ?? true}
              onChange={(event) => patchSettings({ autoCycleEnabled: event.target.checked })}
            />
            <span><strong>学習と休憩を自動切替</strong></span>
          </label>
          <div className="timer-sound-setting">
            <label className="auto-cycle-option timer-sound-option">
              <input
                type="checkbox"
                checked={state.settings.completionSoundEnabled ?? true}
                onChange={(event) => {
                  if (event.target.checked) actions.prepareCompletionSound();
                  patchSettings({ completionSoundEnabled: event.target.checked });
                }}
              />
              <span><strong>終了音を鳴らす</strong></span>
            </label>
            <div className="timer-sound-controls">
              <select
                aria-label="終了音"
                value={state.settings.completionSound ?? 'chime'}
                disabled={!(state.settings.completionSoundEnabled ?? true)}
                onChange={(event) => patchSettings({ completionSound: event.target.value as CompletionSound })}
              >
                <option value="chime">タイマーチャイム</option>
                <option value="bell">デジタルベル</option>
                <option value="beep">連続ビープ</option>
              </select>
              <button
                type="button"
                className="sound-preview-button"
                disabled={!(state.settings.completionSoundEnabled ?? true)}
                onClick={() => void actions.previewCompletionSound(state.settings.completionSound ?? 'chime')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7 5 8 5-8 5Z" /></svg>
                <span>試聴</span>
              </button>
            </div>
          </div>
        </div>
      </details>
      <details className="panel offstream-panel">
        <summary>
          <span><strong>配信外の学習時間を追加</strong><small>{(session.offstreamTodaySeconds ?? 0) > 0 ? `今日の追加分：${formatDuration(session.offstreamTodaySeconds ?? 0, 'ja')}` : '今日の学習時間へ加算します'}</small></span>
          <DisclosureIcon />
        </summary>
        <form className="offstream-form" onSubmit={(event) => { event.preventDefault(); adjustOffstreamStudy(1); }}>
          <label><span>時間</span><input aria-label="配信外学習の時間" type="number" min="0" step="1" inputMode="numeric" value={offstreamHours} onChange={(event) => setOffstreamHours(event.target.value)} /></label>
          <label><span>分</span><input aria-label="配信外学習の分" type="number" min="0" max="59" step="1" inputMode="numeric" value={offstreamMinutes} onChange={(event) => setOffstreamMinutes(event.target.value)} /></label>
          <div className="offstream-form-actions">
            <button type="submit" disabled={!offstreamSeconds}>{offstreamFeedback === 'added' ? '追加しました' : '追加する'}</button>
            <button type="button" disabled={!offstreamSeconds || !(session.offstreamTodaySeconds ?? 0)} onClick={() => adjustOffstreamStudy(-1)}>{offstreamFeedback === 'subtracted' ? '差し引きました' : '差し引く'}</button>
          </div>
        </form>
      </details>
    </main>
  );
}

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

function EditorPage({
  state,
  session,
  now,
  patchSettings,
  patchState,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
}) {
  const viewerLanguage = state.settings.language;
  const interfaceLanguage = 'ja' as const;
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');
  const [previewOpen, setPreviewOpen] = useState(() => window.localStorage.getItem(EDITOR_PREVIEW_STORAGE_KEY) === 'open');
  const [widePreview, setWidePreview] = useState(() => window.matchMedia(EDITOR_PREVIEW_QUERY).matches);
  const [messageEditorKey, setMessageEditorKey] = useState<keyof AppState['settings']['messages']>(phaseKey(session));
  const metricKinds = resolveMetricKinds(state.settings.metricKinds);
  const timeMetricKinds = metricKindIds.filter((kind) => kind !== 'streaks');
  const streakMetricSlotId = metricSlotIds.find((slotId) => metricKinds[slotId] === 'streaks')!;
  const showPreview = widePreview || previewOpen;
  const secondaryContrast = minimumBoardContrast(
    state.settings.background,
    state.settings.backgroundOpacity,
    state.settings.secondaryTextColor ?? state.settings.textColor,
    state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY,
  );
  const secondaryContrastLevel = secondaryContrast >= 7 ? 'AAA' : secondaryContrast >= 4.5 ? 'AA' : 'AA未満';
  const matchingColorPreset = Object.entries(BOARD_COLOR_PRESETS).find(([, preset]) => (
    state.settings.background.toLowerCase() === preset.background
    && state.settings.textColor.toLowerCase() === preset.textColor
    && (state.settings.secondaryTextColor ?? state.settings.textColor).toLowerCase() === preset.secondaryTextColor
    && state.settings.backgroundOpacity === preset.backgroundOpacity
    && (state.settings.textOpacity ?? 1) === preset.textOpacity
    && (state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) === preset.secondaryTextOpacity
  ))?.[0] as Exclude<BoardColorPreset, 'custom'> | undefined;
  const activeColorPreset: BoardColorPreset = state.settings.colorPreset === 'custom'
    ? 'custom'
    : (matchingColorPreset ?? 'custom');
  const previewSession = section === 'message'
    ? messagePreviewSession(session, messageEditorKey, now, state.settings)
    : session;
  const previewSize = recommendedObsSize(state);
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

  return (
    <main className={`page editor-page${showPreview ? '' : ' preview-hidden'}`}>
      <header className="editor-page-header page-heading">
        <div className="editor-title-row">
          <div>
            <h1>配信表示を編集</h1>
            <p>視聴者に表示する内容と見た目を調整します</p>
          </div>
          {!widePreview && <button
            type="button"
            className="preview-toggle-button"
            aria-label={previewOpen ? 'プレビューを閉じる' : 'プレビューを表示'}
            title={previewOpen ? 'プレビューを閉じる' : 'プレビューを表示'}
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
              <circle cx="10" cy="10" r="2.1" />
              {!previewOpen && <path d="m4 4 12 12" />}
            </svg>
            <span>プレビュー</span>
          </button>}
        </div>
      </header>
      {showPreview && <section className="panel editor-preview-panel">
        <div className="preview-card-heading">
          <h2>視聴者表示プレビュー</h2>
          <span>{section === 'message'
            ? `${messageLabels[interfaceLanguage][messageEditorKey]}の表示を確認中（プレビューのみ）`
            : 'OBSに表示される画面'}</span>
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
        <div className="inspector-tabs">
          <button className={section === 'widget' ? 'active' : ''} onClick={() => setSection('widget')}>表示内容</button>
          <button className={section === 'message' ? 'active' : ''} onClick={() => setSection('message')}>メッセージ</button>
          <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>レイアウト</button>
        </div>

        {section === 'widget' && (
          <div className="inspector-content widget-inspector-content">
            <div className="inspector-page-heading">
              <h2>表示内容</h2>
              <p>視聴者に見せる情報を選びます</p>
            </div>
            <section className="settings-section" aria-label="メイン表示">
              <div className="settings-section-heading"><strong>メイン表示</strong></div>
              <div className="visibility-list">
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
              <div className="settings-section-heading"><strong>学習時間</strong></div>
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
                <span><strong>秒まで表示</strong></span>
              </label>
            </section>
            <section className="settings-section additional-display-section">
              <div className="settings-section-heading"><strong>その他の項目</strong></div>
              <div className="additional-display-list">
                <div className="additional-display-item additional-display-row offstream-display-item">
                  <span><strong>配信外の学習</strong><small>配信外で追加した今日の学習時間</small></span>
                  <VisibilityButton
                    label="配信外の学習"
                    visible={widgetIsVisible('offstream')}
                    onToggle={() => setWidgetVisible('offstream', !widgetIsVisible('offstream'))}
                  />
                </div>
              </div>
              <div className="streak-manager additional-streak-manager">
                <div className="streak-manager-heading">
                  <strong>カスタム項目</strong>
                  <VisibilityButton
                    label="カスタム項目"
                    visible={widgetIsVisible(streakMetricSlotId)}
                    onToggle={() => setWidgetVisible(streakMetricSlotId, !widgetIsVisible(streakMetricSlotId))}
                  />
                </div>
                <StreakEditor state={state} patchState={patchState} />
              </div>
            </section>
            <section className="settings-section language-settings-section">
              <div className="settings-section-heading"><strong>表示言語</strong></div>
              <select
                className="language-select"
                aria-label="配信表示の言語"
                value={state.settings.language}
                onChange={(event) => patchSettings({ language: event.target.value as 'ja' | 'en' })}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </section>
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content compact-inspector-content">
            <div className="inspector-page-heading">
              <h2>メッセージ</h2>
              <p>状態別の文と注記を設定します</p>
            </div>
            <div className="message-state-grid">
              {(['study', 'paused', 'break', 'idle'] as const).map((messageKey) => (
                <button
                  type="button"
                  key={messageKey}
                  className={messageEditorKey === messageKey ? 'active' : ''}
                  onClick={() => setMessageEditorKey(messageKey)}
                >
                  <strong>{messageLabels[interfaceLanguage][messageKey]}</strong>
                </button>
              ))}
            </div>
            <div className="message-editor-box">
              <textarea
                rows={4}
                maxLength={MESSAGE_MAX_LENGTH}
                aria-label={`${messageLabels[interfaceLanguage][messageEditorKey]}の表示文`}
                value={state.settings.messages[messageEditorKey]}
                onChange={(event) => patchSettings({ messages: { ...state.settings.messages, [messageEditorKey]: normalizeViewerCopy(event.target.value, MESSAGE_MAX_LENGTH) } })}
              />
              <div className="message-editor-footer">
                <select
                  aria-label="定型文から選ぶ"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    patchSettings({ messages: { ...state.settings.messages, [messageEditorKey]: event.target.value } });
                  }}
                >
                  <option value="">定型文から選ぶ…</option>
                  {messageTemplates[viewerLanguage][messageEditorKey].map((template) => <option key={template} value={template}>{template}</option>)}
                </select>
                <small>{state.settings.messages[messageEditorKey].length}/{MESSAGE_MAX_LENGTH}文字</small>
              </div>
            </div>
            <section className="settings-section persistent-note-section">
              <div className="settings-section-heading settings-section-heading-with-action">
                <div className="settings-section-heading-copy"><strong>常時表示する注記</strong></div>
                <VisibilityButton
                  label="常時表示する注記"
                  visible={widgetIsVisible('note')}
                  onToggle={() => setWidgetVisible('note', !widgetIsVisible('note'))}
                />
              </div>
              <textarea
                className="persistent-note-input"
                rows={3}
                maxLength={NOTE_MAX_LENGTH}
                aria-label="常時表示する注記"
                placeholder="例：資格試験まであと30日"
                value={state.settings.note ?? ''}
                onChange={(event) => patchSettings({ note: normalizeViewerCopy(event.target.value, NOTE_MAX_LENGTH) })}
              />
              <small className="character-count">{(state.settings.note ?? '').length}/{NOTE_MAX_LENGTH}文字</small>
            </section>
          </div>
        )}

        {section === 'appearance' && (
          <div className="inspector-content compact-inspector-content appearance-inspector-content">
            <div className="inspector-page-heading">
              <h2>レイアウト</h2>
              <p>形・フォント・色を調整します</p>
            </div>
            <section className="settings-section appearance-layout-section">
              <div className="settings-section-heading"><strong>向き</strong></div>
              <div className="layout-options" role="group" aria-label="レイアウト">
                <button className={state.settings.layout === 'horizontal' ? 'active' : ''} aria-pressed={state.settings.layout === 'horizontal'} onClick={() => patchSettings({ layout: 'horizontal' })}>
                  <span className="layout-option-preview horizontal" aria-hidden="true" />
                  <span>横長</span>
                </button>
                <button className={state.settings.layout === 'vertical' ? 'active' : ''} aria-pressed={state.settings.layout === 'vertical'} onClick={() => patchSettings({ layout: 'vertical' })}>
                  <span className="layout-option-preview vertical" aria-hidden="true" />
                  <span>縦長</span>
                </button>
              </div>
            </section>
            <section className="settings-section appearance-font-section">
              <div className="settings-section-heading"><strong>フォント</strong></div>
              <div className="font-options" role="group" aria-label="視聴者表示のフォント">
                {([
                  ['sans', 'デフォルト'],
                  ['system', '端末標準'],
                  ['modern', 'モダン'],
                ] as const).map(([font, label]) => (
                  <button
                    type="button"
                    key={font}
                    className={`${resolveBoardFont(state.settings.boardFont) === font ? 'active ' : ''}font-option-${font}`}
                    aria-pressed={resolveBoardFont(state.settings.boardFont) === font}
                    onClick={() => patchSettings({ boardFont: font })}
                  >
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-section appearance-color-section">
              <div className="settings-section-heading"><strong>色と透過</strong></div>
              <div className="color-preset-group" role="group" aria-label="配色プリセット">
                <div>
                  {Object.entries(BOARD_COLOR_PRESETS).map(([id, preset]) => {
                    const presetId = id as Exclude<BoardColorPreset, 'custom'>;
                    return (
                      <button
                        type="button"
                        key={id}
                        className={activeColorPreset === presetId ? 'active' : ''}
                        aria-pressed={activeColorPreset === presetId}
                        onClick={() => patchSettings({
                          colorPreset: presetId,
                          background: preset.background,
                          backgroundOpacity: preset.backgroundOpacity,
                          textColor: preset.textColor,
                          textOpacity: preset.textOpacity,
                          secondaryTextColor: preset.secondaryTextColor,
                          secondaryTextOpacity: preset.secondaryTextOpacity,
                        })}
                      >
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={activeColorPreset === 'custom' ? 'active' : ''}
                    aria-pressed={activeColorPreset === 'custom'}
                    onClick={() => patchSettings({ colorPreset: 'custom' })}
                  >カスタム</button>
                </div>
              </div>
              <div className="color-control-list">
                <div className="color-control-row">
                  <span className="color-control-name">背景</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.background }} title="背景色を選ぶ">
                    <input type="color" aria-label="背景色" value={state.settings.background} onChange={(event) => patchSettings({ colorPreset: 'custom', background: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label="背景の不透明度" type="range" min="0" max="100" value={state.settings.backgroundOpacity * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', backgroundOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round(state.settings.backgroundOpacity * 100)}%</output>
                </div>
                <div className="color-control-row">
                  <span className="color-control-name">メイン文字</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.textColor }} title="文字色を選ぶ">
                    <input type="color" aria-label="文字色" value={state.settings.textColor} onChange={(event) => patchSettings({ colorPreset: 'custom', textColor: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label="文字の不透明度" type="range" min="0" max="100" value={(state.settings.textOpacity ?? 1) * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', textOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round((state.settings.textOpacity ?? 1) * 100)}%</output>
                </div>
                <div className="color-control-row">
                  <span className="color-control-name">補助文字</span>
                  <label className="color-swatch" style={{ backgroundColor: state.settings.secondaryTextColor ?? state.settings.textColor }} title="補助文字色を選ぶ">
                    <input type="color" aria-label="補助文字色" value={state.settings.secondaryTextColor ?? state.settings.textColor} onChange={(event) => patchSettings({ colorPreset: 'custom', secondaryTextColor: event.target.value })} />
                  </label>
                  <input className="opacity-range" aria-label="補助文字の不透明度" type="range" min="0" max="100" value={(state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) * 100} onChange={(event) => patchSettings({ colorPreset: 'custom', secondaryTextOpacity: Number(event.target.value) / 100 })} />
                  <output>{Math.round((state.settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY) * 100)}%</output>
                </div>
              </div>
              <div className="color-settings-footer">
                <div className="color-accessibility-row">
                  <p>
                    <strong>補助文字 <span className={secondaryContrastLevel === 'AA未満' ? 'contrast-warning' : ''}>{secondaryContrast.toFixed(1)}:1・{secondaryContrastLevel}</span></strong>
                    <span>コントラストは4.5:1以上を推奨</span>
                  </p>
                </div>
                <div className="color-reset-row">
                  <button
                    type="button"
                    onClick={() => patchSettings({ colorPreset: 'dark', ...DEFAULT_BOARD_APPEARANCE })}
                  >初期設定に戻す</button>
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

function StreakEditor({ state, patchState }: { state: AppState; patchState: (mutator: (draft: AppState) => AppState) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.settings.streaks[0]?.id ?? null);
  const [deletePending, setDeletePending] = useState(false);
  const streak = state.settings.streaks.find((item) => item.id === selectedId) ?? state.settings.streaks[0];
  const change = (changes: Partial<Streak>) => {
    if (!streak) return;
    patchState((current) => ({
      ...current,
      settings: { ...current.settings, streaks: current.settings.streaks.map((item) => item.id === streak.id ? { ...item, ...changes } : item) },
    }));
  };
  const addItem = () => {
    const id = globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
    const item: Streak = { id, name: '新しい項目', kind: 'count', count: 0, unit: '回', visible: true };
    patchState((current) => ({
      ...current,
      settings: { ...current.settings, streaks: [...current.settings.streaks, item] },
    }));
    setSelectedId(id);
    setDeletePending(false);
  };
  const removeItem = () => {
    if (!streak) return;
    patchState((current) => ({
      ...current,
      settings: { ...current.settings, streaks: current.settings.streaks.filter((item) => item.id !== streak.id) },
    }));
    setSelectedId(state.settings.streaks.find((item) => item.id !== streak.id)?.id ?? null);
    setDeletePending(false);
  };
  return (
    <div className="streak-editor">
      <div className="streak-selector-block">
        <span className="streak-group-label">編集する項目</span>
        <div className="streak-selector-row">
          {state.settings.streaks.length > 0 && (
            <select
              aria-label="編集する項目"
              value={streak?.id ?? ''}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setDeletePending(false);
              }}
            >
              {state.settings.streaks.map((item) => {
                const value = item.kind === 'count'
                  ? `${Math.max(0, Math.floor(item.count ?? 0))}${item.unit || '回'}`
                  : '継続日数';
                return <option key={item.id} value={item.id}>{item.name || '名称未設定'}（{value}）</option>;
              })}
            </select>
          )}
          <button type="button" className="add-streak-button" onClick={addItem}>＋ 追加</button>
        </div>
      </div>
      {state.settings.streaks.length === 0 && <p className="empty-settings">まだ項目がありません。「追加」から作成できます。</p>}
      {streak && (
        <div className="streak-detail">
          <div className="streak-detail-heading">
            <strong>選択中の項目を編集</strong>
            <VisibilityButton
              label={streak.name || '名称未設定'}
              visible={streak.visible}
              onToggle={() => change({ visible: !streak.visible })}
            />
          </div>
          <div className="streak-field-group">
            <div className="streak-core-fields">
              <label className="compact-field">
                <span>項目名</span>
                <input value={streak.name} maxLength={32} onChange={(event) => change({ name: event.target.value })} />
              </label>
              <label className="compact-field">
                <span>種類</span>
                <select
                  value={streak.kind ?? 'days'}
                  onChange={(event) => event.target.value === 'days'
                    ? change({ kind: 'days', startedOn: streak.startedOn || new Date().toISOString().slice(0, 10), dayMode: streak.dayMode || 'all' })
                    : change({ kind: 'count', count: streak.count ?? 0, unit: streak.unit || '回' })}
                >
                  <option value="days">継続日数</option>
                  <option value="count">回数・数量</option>
                </select>
              </label>
            </div>
          </div>
          <div className="streak-field-group">
            {(streak.kind ?? 'days') === 'days' ? (
              <>
              <div className="streak-day-fields">
                <label className="compact-field">
                  <span>開始日</span>
                  <input type="date" value={streak.startedOn || ''} onChange={(event) => change({ startedOn: event.target.value })} />
                </label>
                <label className="compact-field">
                  <span>数える日</span>
                  <select value={streak.dayMode ?? 'all'} onChange={(event) => change({ dayMode: event.target.value as Streak['dayMode'] })}>
                    <option value="all">毎日</option>
                    <option value="weekdays">平日のみ</option>
                    <option value="weekends">土日のみ</option>
                    <option value="custom">曜日を選ぶ</option>
                  </select>
                </label>
              </div>
              {streak.dayMode === 'custom' && (
                <div className="weekday-picker" aria-label="数える曜日">
                  {weekdayOptions.map(({ day, label }) => {
                    const checked = (streak.includedWeekdays ?? []).includes(day);
                    return (
                      <label key={day} className={checked ? 'active' : ''}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => change({
                            includedWeekdays: checked
                              ? (streak.includedWeekdays ?? []).filter((value) => value !== day)
                              : [...(streak.includedWeekdays ?? []), day],
                          })}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              </>
            ) : (
              <div className="count-fields">
                <label className="compact-field"><span>現在の数</span><input aria-label={`${streak.name || 'カスタム項目'}の現在の数`} type="number" min="0" step="1" value={streak.count ?? 0} onChange={(event) => change({ count: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="compact-field"><span>単位</span><input value={streak.unit || ''} maxLength={8} placeholder="回・冊・本" onChange={(event) => change({ unit: event.target.value })} /></label>
              </div>
            )}
          </div>
          {deletePending ? (
            <div className="streak-delete-confirm" role="alert">
              <span>「{streak.name.trim() || 'この項目'}」を削除しますか？</span>
              <div>
                <button type="button" onClick={() => setDeletePending(false)}>キャンセル</button>
                <button type="button" className="confirm-delete-button" onClick={removeItem}>削除</button>
              </div>
            </div>
          ) : (
            <button type="button" className="remove-streak-button" onClick={() => setDeletePending(true)}>
              <span>{streak.name.trim() ? `${streak.name.trim()}を削除` : 'この項目を削除'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const messageLabels = {
  ja: { study: '学習中', paused: '停止中', break: '休憩中', idle: '待機中' },
  en: { study: 'Studying', paused: 'Paused', break: 'On break', idle: 'Ready' },
} as const;

const messageTemplates = {
  ja: {
    study: ['集中しています。コメントは休憩中に読みます。', 'ただいま学習中です。応援コメントありがとうございます。'],
    paused: ['少し会話しています。学習タイマーは一時停止中です。', '一時停止中です。まもなく学習へ戻ります。'],
    break: ['休憩中です。コメントを読んでいます。', '休憩中です。次の学習開始までお待ちください。'],
    idle: ['まもなく学習を始めます。', '配信準備中です。少々お待ちください。'],
  },
  en: {
    study: ['Focusing now. I will read chat during the break.', 'Study in progress. Thanks for cheering me on!'],
    paused: ['Chatting briefly. The study timer is paused.', 'Paused for a moment. Study will resume soon.'],
    break: ['On a break and reading chat.', 'Taking a break. The next study session starts soon.'],
    idle: ['Study will begin shortly.', 'Getting ready to stream. Please wait a moment.'],
  },
} as const;

const weekdayOptions = [
  { day: 1, label: '月' }, { day: 2, label: '火' }, { day: 3, label: '水' }, { day: 4, label: '木' },
  { day: 5, label: '金' }, { day: 6, label: '土' }, { day: 0, label: '日' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
