import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from './Board';
import { Button, IconButton } from './components/ui/Button';
import { SegmentedControl, SegmentedOption } from './components/ui/SegmentedControl';
import { Select } from './components/ui/Select';
import { EditorPage } from './features/board/EditorPage';
import { voiceAutoPauseAvailable } from './features/featureFlags';
import { GuidedTour } from './features/onboarding/GuidedTour';
import { ControlPage } from './features/timer/ControlPage';
import { I18nProvider, useI18n } from './i18n';
import type { AppState } from './model';
import { clampAutoPauseSeconds, phaseTimerPaused, recommendedObsSize } from './model';
import { useAutoPause } from './useAutoPause';
import { useStudyStream } from './useStudyStream';

type Page = 'control' | 'editor';
type CopyState = 'idle' | 'copied' | 'failed';
type ObsSizeField = 'width' | 'height';

const OBS_OVERLAY_URL = 'http://127.0.0.1:47831/overlay';
const GUIDED_TOUR_STORAGE_KEY = 'studystream-guided-tour-v3';

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}

function AppContent() {
  const overlayOnly = window.location.pathname === '/overlay' || new URLSearchParams(window.location.search).get('view') === 'overlay';
  const store = useStudyStream({ readOnly: overlayOnly });

  if (!store.state || !store.displaySession) {
    return <div className={overlayOnly ? 'overlay-loading' : 'app-loading'}>StudyDot</div>;
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

function Dashboard({ store }: { store: ReturnType<typeof useStudyStream> }) {
  const { language, setLanguage, t } = useI18n();
  const { state, displaySession, now, updateDeferred, actions } = store;
  const [page, setPage] = useState<Page>('control');
  const [obsCopyState, setObsCopyState] = useState<CopyState>('idle');
  const [obsSizeCopyState, setObsSizeCopyState] = useState<{ field: ObsSizeField | null; state: CopyState }>({ field: null, state: 'idle' });
  const [obsDialogOpen, setObsDialogOpen] = useState(false);
  const [guidedTourOpen, setGuidedTourOpen] = useState(() => !window.localStorage.getItem(GUIDED_TOUR_STORAGE_KEY));
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

  const timerPaused = phaseTimerPaused(displaySession);
  const voiceAutoPaused = timerPaused && displaySession.pauseReason === 'voice';
  const autoPauseStates = useAutoPause({
    monitoring: voiceAutoPauseAvailable
      && displaySession.phase === 'study'
      && !displaySession.intervalCompleted
      && (displaySession.tracking || voiceAutoPaused),
    timerRunning: displaySession.phase === 'study' && displaySession.tracking && !timerPaused,
    autoPaused: voiceAutoPaused,
    voiceEnabled: voiceAutoPauseAvailable && (state.settings.autoPauseVoiceEnabled ?? false),
    voiceSeconds: clampAutoPauseSeconds(state.settings.autoPauseVoiceSeconds ?? 2),
    speechLanguage: state.settings.speechLanguage ?? 'ja',
    onPause: () => actions.pause('voice'),
    onResume: actions.resumeVoicePause,
  });

  const obsSize = useMemo(() => recommendedObsSize(state), [state.settings]);

  function patchState(mutator: (draft: AppState) => AppState) {
    updateDeferred(mutator);
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

  function startGuidedTour() {
    settingsRef.current?.removeAttribute('open');
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => setGuidedTourOpen(true));
  }

  function closeGuidedTour() {
    window.localStorage.setItem(GUIDED_TOUR_STORAGE_KEY, 'completed');
    setGuidedTourOpen(false);
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
            <Button variant="plain" size="auto" className="wordmark" title={t('ホームへ戻る')} onClick={() => navigate('control')}>StudyDot</Button>
            <span className="beta-badge">{t('ベータ')}</span>
          </div>
          <div className="header-actions">
            <Button
              variant="surface"
              className="header-obs-button"
              title={t('OBSへの追加方法を開く')}
              aria-label={t('OBSへの追加方法を開く')}
              onClick={() => setObsDialogOpen(true)}
            >
              <ObsLogo />
              <span>{t('OBSへ追加')}</span>
            </Button>
            <details ref={settingsRef} className="app-settings">
            <summary>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="M3 5h4m3 0h7M3 10h9m3 0h2M3 15h2m3 0h9" />
                <circle cx="8.5" cy="5" r="1.5" />
                <circle cx="13.5" cy="10" r="1.5" />
                <circle cx="6.5" cy="15" r="1.5" />
              </svg>
              <span>{t('設定')}</span>
            </summary>
            <div className="app-settings-popover">
              <div className="app-settings-heading">
                <strong>{t('アプリ設定')}</strong>
              </div>
              <div className="app-settings-group">
                <span>{t('操作画面のテーマ')}</span>
                <SegmentedControl className="theme-options" label={t('操作画面のテーマ')}>
                  <SegmentedOption selected={!darkMode} onSelect={() => setDarkMode(false)}>{t('ライト')}</SegmentedOption>
                  <SegmentedOption selected={darkMode} onSelect={() => setDarkMode(true)}>{t('ダーク')}</SegmentedOption>
                </SegmentedControl>
              </div>
              <div className="app-settings-group">
                <span>{t('操作画面の言語')}</span>
                <Select
                  selectSize="sm"
                  aria-label={t('操作画面の言語')}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'ja')}
                >
                  <option value="ja">{t('日本語')}</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <div className="app-settings-group">
                <span>{t('ヘルプ')}</span>
                <Button variant="plain" size="auto" className="guided-tour-replay" onClick={startGuidedTour}>{t('この画面の使い方')}</Button>
              </div>
              <div className="app-settings-group app-support-group">
                <span>{t('開発支援')}</span>
                <Button
                  variant="plain"
                  size="auto"
                  className="app-support-placeholder"
                  disabled
                  title={t('支援窓口を準備しています')}
                >
                  <span>{t('開発を支援')}</span>
                  <small>{t('近日公開')}</small>
                </Button>
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
              <h2 id="obs-dialog-title">{t('OBSに配信ボードを追加')}</h2>
              <p>{t('ブラウザソースとして追加すると、StudyDotの表示がそのまま反映されます。')}</p>
            </div>
            <IconButton variant="plain" className="obs-dialog-close" label={t('閉じる')} onClick={() => setObsDialogOpen(false)}>×</IconButton>
          </div>

          <ol className="obs-steps">
            <li><span>1</span><div><strong>{t('OBSでソースを追加')}</strong><p>{t('「ソース」の＋を押し、「ブラウザ」を選びます。')}</p></div></li>
            <li><span>2</span><div><strong>{t('URLを設定')}</strong><p>{t('下のURLをブラウザソースのURL欄へ貼り付けます。')}</p></div></li>
            <li><span>3</span><div><strong>{t('幅と高さを設定')}</strong><p>{t('現在のレイアウトと表示項目に合わせたサイズを入力します。')}</p></div></li>
          </ol>

          <div className="obs-setup-values">
            <div className="obs-url-field">
              <span>{t('ブラウザソースURL')}</span>
              <div className="obs-url-control">
                <code title={OBS_OVERLAY_URL}>{OBS_OVERLAY_URL}</code>
                <Button
                  size="sm"
                  className={obsCopyState}
                  aria-live="polite"
                  onClick={() => void copyObsUrl()}
                >
                  {obsCopyState === 'copied' ? t('コピー済み') : obsCopyState === 'failed' ? t('コピー失敗') : t('URLをコピー')}
                </Button>
              </div>
            </div>
            <div className="obs-size-fields" aria-label={language === 'ja' ? `推奨サイズ 幅${obsSize.width} 高さ${obsSize.height}` : `Recommended size: width ${obsSize.width}, height ${obsSize.height}`}>
              <Button
                variant="plain"
                size="auto"
                onClick={() => void copyObsSize('width')}
                aria-label={language === 'ja' ? `幅 ${obsSize.width} をコピー` : `Copy width ${obsSize.width}`}
                title={language === 'ja' ? `幅 ${obsSize.width} をコピー` : `Copy width ${obsSize.width}`}
              >
                <span>{t('幅')}</span>
                <strong>{obsSize.width}</strong>
                <CopyIndicator state={obsSizeCopyState.field === 'width' ? obsSizeCopyState.state : 'idle'} />
                <span className="visually-hidden" aria-live="polite">{obsSizeCopyState.field === 'width' && obsSizeCopyState.state === 'copied' ? (language === 'ja' ? '幅をコピーしました' : 'Width copied') : obsSizeCopyState.field === 'width' && obsSizeCopyState.state === 'failed' ? (language === 'ja' ? '幅をコピーできませんでした' : 'Could not copy width') : ''}</span>
              </Button>
              <span aria-hidden="true">×</span>
              <Button
                variant="plain"
                size="auto"
                onClick={() => void copyObsSize('height')}
                aria-label={language === 'ja' ? `高さ ${obsSize.height} をコピー` : `Copy height ${obsSize.height}`}
                title={language === 'ja' ? `高さ ${obsSize.height} をコピー` : `Copy height ${obsSize.height}`}
              >
                <span>{t('高さ')}</span>
                <strong>{obsSize.height}</strong>
                <CopyIndicator state={obsSizeCopyState.field === 'height' ? obsSizeCopyState.state : 'idle'} />
                <span className="visually-hidden" aria-live="polite">{obsSizeCopyState.field === 'height' && obsSizeCopyState.state === 'copied' ? (language === 'ja' ? '高さをコピーしました' : 'Height copied') : obsSizeCopyState.field === 'height' && obsSizeCopyState.state === 'failed' ? (language === 'ja' ? '高さをコピーできませんでした' : 'Could not copy height') : ''}</span>
              </Button>
            </div>
            <p className="obs-size-note">
              {t('レイアウトや表示内容を変更したら、OBSの幅と高さも設定し直してください。')}
            </p>
          </div>
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
          autoPauseStates={autoPauseStates}
          voiceAutoPauseAvailable={voiceAutoPauseAvailable}
          onEditBoard={() => navigate('editor')}
        />
      ) : (
        <EditorPage
          state={state}
          session={displaySession}
          now={now}
          patchSettings={patchSettings}
          patchState={patchState}
          tourActive={guidedTourOpen}
        />
      )}
      {guidedTourOpen && <GuidedTour page={page} onClose={closeGuidedTour} />}
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

function CopyIndicator({ state }: { state: CopyState }) {
  return (
    <svg className={`copy-indicator copy-indicator-${state}`} aria-hidden="true" viewBox="0 0 20 20">
      {state === 'copied'
        ? <path d="m4.5 10.5 3.4 3.4 7.6-8" />
        : state === 'failed'
          ? <><path d="m6 6 8 8M14 6l-8 8" /></>
          : <><rect x="6.5" y="6.5" width="9" height="9" rx="1.5" /><path d="M13.5 6.5V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" /></>}
    </svg>
  );
}
