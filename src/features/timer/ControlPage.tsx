import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useI18n } from '../../i18n';
import type { AppState, CompletionSound } from '../../model';
import {
  clampAutoPauseSeconds,
  formatClock,
  formatDuration,
  intervalDurationSeconds,
  metricTotals,
  phaseLabel,
  phaseTimerPaused,
  remainingSeconds,
  uiCopy,
} from '../../model';
import type { AutoPauseSensorStates, LocalModelState, SensorState } from '../../useAutoPause';
import type { useStudyStream } from '../../useStudyStream';

type StudyStreamStore = ReturnType<typeof useStudyStream>;

type ControlPageProps = {
  state: AppState;
  session: NonNullable<StudyStreamStore['displaySession']>;
  now: number;
  actions: StudyStreamStore['actions'];
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  setIntervalDuration: (phase: 'study' | 'break', seconds: number) => void;
  autoPauseStates: AutoPauseSensorStates;
  voiceAutoPauseAvailable: boolean;
  onEditBoard: () => void;
};

function DisclosureIcon() {
  return (
    <span className="disclosure-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>
    </span>
  );
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
  const { language, t } = useI18n();
  const normalized = formatDurationSetting(seconds);
  const [draft, setDraft] = useState(normalized);

  useEffect(() => setDraft(normalized), [normalized]);

  function commit() {
    const parsed = parseDurationSetting(draft);
    if (parsed == null) {
      setDraft(normalized);
      return;
    }
    setDraft(formatDurationSetting(parsed));
    if (parsed !== seconds) onChange(parsed);
  }

  return (
    <div className="duration-setting">
      <strong>{label}</strong>
      <input
        className="duration-clock-input"
        aria-label={language === 'ja' ? `${label} 時間、分、秒` : `${label} hours, minutes, and seconds`}
        title={language === 'ja' ? 'クリックして時:分:秒を入力' : 'Click to enter hours:minutes:seconds'}
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        maxLength={8}
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9:]/g, '').slice(0, 8))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(normalized);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function formatDurationSetting(seconds: number) {
  const safeSeconds = Math.min(86_400, Math.max(1, Math.floor(seconds)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, '0')).join(':');
}

function parseDurationSetting(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 1) {
    minutes = Number(parts[0]);
  } else if (parts.length === 2) {
    [minutes, seconds] = parts.map(Number);
  } else if (parts.length === 3) {
    [hours, minutes, seconds] = parts.map(Number);
  } else {
    return null;
  }

  if (minutes < 0 || seconds < 0 || (parts.length > 1 && minutes > 59) || seconds > 59) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total >= 1 && total <= 86_400 ? total : null;
}

function autoPauseQuickLabel(sensorState: SensorState, modelState: LocalModelState, t: (source: string) => string) {
  if (modelState === 'loading') return t('モデル準備中');
  if (modelState === 'error') return t('起動できません');
  if (sensorState === 'starting') return t('マイク準備中');
  if (sensorState === 'watching') return t('会話を確認中');
  if (sensorState === 'analyzing') return t('内容を判定中');
  if (sensorState === 'denied') return t('マイク許可が必要');
  if (sensorState === 'unavailable') return t('利用できません');
  if (sensorState === 'error') return t('起動できません');
  return modelState === 'ready' ? t('待機中') : t('準備中');
}

function AutoPauseOption({
  enabled,
  seconds,
  onSecondsChange,
  language: speechLanguage,
  onLanguageChange,
}: {
  enabled: boolean;
  seconds: number;
  onSecondsChange: (seconds: number) => void;
  language: 'ja' | 'en';
  onLanguageChange: (language: 'ja' | 'en') => void;
}) {
  const { language, t } = useI18n();
  return (
    <div className="auto-pause-option">
      <div className="auto-pause-option-controls">
        <Select
          selectSize="sm"
          aria-label={language === 'ja' ? '会話を検出してから停止するまでの時間' : 'Time before pausing after conversation is detected'}
          disabled={!enabled}
          value={seconds}
          onChange={(event) => onSecondsChange(clampAutoPauseSeconds(Number(event.target.value)))}
        >
          {[1, 2, 3, 5, 10].map((value) => <option key={value} value={value}>{language === 'ja' ? `${value}秒で停止` : `Pause after ${value}s`}</option>)}
        </Select>
        <Select
          selectSize="sm"
          aria-label={language === 'ja' ? '会話を判定する言語' : 'Speech analysis language'}
          disabled={!enabled}
          value={speechLanguage}
          onChange={(event) => onLanguageChange(event.target.value === 'en' ? 'en' : 'ja')}
        >
          <option value="ja">{t('日本語')}</option>
          <option value="en">English</option>
        </Select>
      </div>
    </div>
  );
}

export function ControlPage({
  state,
  session,
  now,
  actions,
  patchSettings,
  setIntervalDuration,
  autoPauseStates,
  voiceAutoPauseAvailable,
  onEditBoard,
}: ControlPageProps) {
  const { language, t } = useI18n();
  const copy = uiCopy[language];
  const isIntervalCompleted = session.intervalCompleted ?? false;
  const [offstreamHours, setOffstreamHours] = useState('0');
  const [offstreamMinutes, setOffstreamMinutes] = useState('0');
  const [offstreamFeedback, setOffstreamFeedback] = useState<'added' | 'subtracted' | null>(null);
  const [autoPauseInfoOpen, setAutoPauseInfoOpen] = useState(false);
  const autoPauseInfoRef = useRef<HTMLDialogElement>(null);
  const offstreamSeconds = (
    Math.max(0, Number(offstreamHours) || 0) * 60
    + Math.max(0, Number(offstreamMinutes) || 0)
  ) * 60;
  const timerIsPaused = phaseTimerPaused(session);
  const studyTotals = metricTotals(session, now);
  const studyIsSelected = session.phase === 'study' && !isIntervalCompleted;
  const breakIsSelected = session.phase === 'break' && !isIntervalCompleted;
  const studyIsActive = studyIsSelected && !timerIsPaused;
  const breakIsActive = breakIsSelected && !timerIsPaused;
  const autoPauseEnabled = state.settings.autoPauseVoiceEnabled ?? false;
  const autoPauseStatus = autoPauseEnabled
    ? autoPauseQuickLabel(autoPauseStates.voice, autoPauseStates.model, t)
    : t('会話で自動停止');
  const autoPauseHasError = autoPauseStates.model === 'error'
    || ['denied', 'unavailable', 'error'].includes(autoPauseStates.voice);
  const adjustOffstreamStudy = (direction: 1 | -1) => {
    if (!offstreamSeconds) return;
    actions.addStudyTime(offstreamSeconds * direction);
    setOffstreamHours('0');
    setOffstreamMinutes('0');
    setOffstreamFeedback(direction === 1 ? 'added' : 'subtracted');
    window.setTimeout(() => setOffstreamFeedback(null), 1800);
  };

  useEffect(() => {
    const dialog = autoPauseInfoRef.current;
    if (!dialog) return;
    if (autoPauseInfoOpen && !dialog.open) dialog.showModal();
    if (!autoPauseInfoOpen && dialog.open) dialog.close();
  }, [autoPauseInfoOpen]);

  function toggleAutoPause() {
    if (autoPauseEnabled) patchSettings({ autoPauseVoiceEnabled: false });
    else setAutoPauseInfoOpen(true);
  }

  return (
    <main className="page control-page">
      <header className="page-heading control-page-header">
        <div>
          <h1>{t('学習タイマー')}</h1>
          <p>{t('学習・休憩・一時停止を切り替え、学習時間を記録します')}</p>
        </div>
        <div className="session-page-actions">
          <Button variant="surface" className="board-edit-button" data-tour="board-edit" aria-label={t('配信表示を編集')} onClick={onEditBoard}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="3.5" width="14" height="13" rx="1.5" /><path d="M3 8h14M8 8v8.5" /></svg>
            <span>{t('配信表示を編集')}</span>
          </Button>
        </div>
      </header>
      <section className="panel session-panel">
        <div className="session-control-column">
          <div className="phase-summary">
            <div className="phase-summary-header">
              <h1>
                <span>{phaseLabel(session, language)}</span>
                {timerIsPaused && <small>{t('停止中')}</small>}
              </h1>
              {voiceAutoPauseAvailable && <Button
                variant="plain"
                size="auto"
                className={`auto-pause-quick-toggle${autoPauseEnabled ? ' enabled' : ' icon-only'}${autoPauseHasError ? ' error' : ''}`}
                data-tour="voice-pause"
                aria-pressed={autoPauseEnabled}
                aria-label={autoPauseEnabled ? (language === 'ja' ? `自動停止をオフにする（${autoPauseStatus}）` : `Turn automatic pause off (${autoPauseStatus})`) : (language === 'ja' ? 'マイクを使った自動停止の説明を開く' : 'Learn about automatic pause by microphone')}
                title={autoPauseEnabled ? (language === 'ja' ? `自動停止：${autoPauseStatus}` : `Automatic pause: ${autoPauseStatus}`) : (language === 'ja' ? 'マイクを使った自動停止について' : 'About automatic pause by microphone')}
                onClick={toggleAutoPause}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <rect x="7" y="3" width="6" height="9" rx="3" />
                  <path d="M4.8 9.5a5.2 5.2 0 0 0 10.4 0M10 14.7V17M7.5 17h5" />
                  {!autoPauseEnabled && <path className="auto-pause-mic-slash" d="m4 4 12 12" />}
                </svg>
                {autoPauseEnabled && <span>{autoPauseStatus}</span>}
                {autoPauseEnabled && <i className="auto-pause-state-dot" aria-hidden="true" />}
              </Button>}
            </div>
            <div className="control-clock">
              <strong>{formatClock(remainingSeconds(session, now))}</strong>
              <span>{copy.remaining}</span>
            </div>
          </div>

          <div className="control-actions" data-tour="phase-controls" aria-label={t('配信状態と操作')}>
            <div className="control-action-primary">
              <div className="phase-switch" aria-label={t('配信状態')}>
                <Button
                  variant="plain"
                  size="auto"
                  className={`phase-select-button${studyIsActive ? ' active' : ''}`}
                  aria-pressed={studyIsActive}
                  disabled={studyIsSelected}
                  onClick={actions.startStudy}
                >
                  {t('学習')}
                </Button>
                <Button
                  variant="plain"
                  size="auto"
                  className={`phase-select-button${breakIsActive ? ' active' : ''}`}
                  aria-pressed={breakIsActive}
                  disabled={session.phase === 'idle' || breakIsSelected}
                  onClick={actions.startBreak}
                >
                  {t('休憩')}
                </Button>
              </div>
              {(studyIsSelected || breakIsSelected) && (
                <IconButton
                  variant="plain"
                  className={`tracking-action-button${timerIsPaused ? ' active' : ''}`}
                  aria-pressed={timerIsPaused}
                  label={timerIsPaused ? t('再開') : t('一時停止')}
                  title={timerIsPaused ? t('再開') : t('一時停止')}
                  onClick={actions.togglePause}
                >
                  {timerIsPaused ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7 5 8 5-8 5Z" /></svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 5v10M13 5v10" /></svg>
                  )}
                </IconButton>
              )}
            </div>
            {session.phase !== 'idle' && (
              <Button variant="surface" className="session-finish-button" onClick={actions.finish}>
                {t('タイマーを終了')}
              </Button>
            )}
          </div>
        </div>

        <div className="session-stats" aria-label={t('学習時間')}>
          <p className="session-stats-heading">{t('学習時間')}</p>
          <div className="session-stat-row"><strong>{formatDuration(studyTotals.session, language)}</strong><span>{copy.session}</span></div>
          <div className="session-stat-row"><strong>{formatDuration(studyTotals.today, language)}</strong><span>{t('今日の合計')}</span></div>
          <div className="session-stat-row"><strong>{formatDuration(studyTotals.total, language)}</strong><span>{copy.total}</span></div>
        </div>
      </section>
      <section className="panel auxiliary-settings-panel" aria-label={t('その他の操作')}>
        <details className="offstream-panel" data-tour="offstream-study">
          <summary>
            <span>
              <strong>{t('配信外の学習時間を追加')}</strong>
              <small>{(session.offstreamTodaySeconds ?? 0) > 0 ? (language === 'ja' ? `本日追加済み ${formatDuration(session.offstreamTodaySeconds ?? 0, language)}` : `Added today: ${formatDuration(session.offstreamTodaySeconds ?? 0, language)}`) : t('今日の合計に反映')}</small>
            </span>
            <DisclosureIcon />
          </summary>
          <form className="offstream-form" onSubmit={(event) => { event.preventDefault(); adjustOffstreamStudy(1); }}>
            <label><input aria-label={language === 'ja' ? '配信外学習の時間' : 'Off-stream study hours'} type="number" min="0" step="1" inputMode="numeric" value={offstreamHours} onChange={(event) => setOffstreamHours(event.target.value)} onBlur={() => setOffstreamHours((value) => value || '0')} /><span>{t('時間')}</span></label>
            <label><input aria-label={language === 'ja' ? '配信外学習の分' : 'Off-stream study minutes'} type="number" min="0" max="59" step="1" inputMode="numeric" value={offstreamMinutes} onChange={(event) => setOffstreamMinutes(event.target.value)} onBlur={() => setOffstreamMinutes((value) => value || '0')} /><span>{t('分')}</span></label>
            <div className="offstream-form-actions">
              <Button type="submit" size="sm" disabled={!offstreamSeconds}>{offstreamFeedback === 'added' ? t('追加済み') : t('追加')}</Button>
              <Button size="sm" disabled={!offstreamSeconds || !(session.offstreamTodaySeconds ?? 0)} onClick={() => adjustOffstreamStudy(-1)}>{offstreamFeedback === 'subtracted' ? t('反映済み') : t('差し引く')}</Button>
            </div>
          </form>
        </details>
        <details className="timer-settings-panel" data-tour="timer-settings">
          <summary>
            <strong>{t('タイマー設定')}</strong>
            <DisclosureIcon />
          </summary>
          <div className="timer-settings-content">
            <section className="timer-setting-group timer-duration-group">
              <div className="timer-interval-options">
                <DurationInput
                  label={t('学習')}
                  seconds={intervalDurationSeconds(state.settings, 'study')}
                  onChange={(seconds) => setIntervalDuration('study', seconds)}
                />
                <DurationInput
                  label={t('休憩')}
                  seconds={intervalDurationSeconds(state.settings, 'break')}
                  onChange={(seconds) => setIntervalDuration('break', seconds)}
                />
              </div>
            </section>
            <section className="timer-setting-group timer-end-group">
              <label className="timer-setting-row">
                <span className="timer-setting-copy">
                  <strong>{t('次のタイマーを自動で開始')}</strong>
                  <small>{t('学習後は休憩、休憩後は学習を始めます')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={state.settings.autoCycleEnabled ?? true}
                  onChange={(event) => patchSettings({ autoCycleEnabled: event.target.checked })}
                />
              </label>
              <div className="timer-setting-row timer-sound-setting">
                <label className="timer-sound-option">
                  <span className="timer-setting-copy">
                    <strong>{t('音で知らせる')}</strong>
                    <small>{t('タイマーが終わった時に鳴ります')}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={state.settings.completionSoundEnabled ?? true}
                    onChange={(event) => {
                      if (event.target.checked) actions.prepareCompletionSound();
                      patchSettings({ completionSoundEnabled: event.target.checked });
                    }}
                  />
                </label>
                <div className="timer-sound-controls">
                  <Select
                    selectSize="sm"
                    aria-label={t('終了音')}
                    value={state.settings.completionSound ?? 'chime'}
                    disabled={!(state.settings.completionSoundEnabled ?? true)}
                    onChange={(event) => patchSettings({ completionSound: event.target.value as CompletionSound })}
                  >
                    <option value="chime">{t('チャイム')}</option>
                    <option value="bell">{t('デジタルベル')}</option>
                    <option value="beep">{t('連続ビープ')}</option>
                  </Select>
                  <Button
                    size="sm"
                    className="sound-preview-button"
                    aria-label={t('選択した終了音を確認')}
                    title={t('選択した音を確認')}
                    disabled={!(state.settings.completionSoundEnabled ?? true)}
                    onClick={() => void actions.previewCompletionSound(state.settings.completionSound ?? 'chime')}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4Z" /><path d="M14 7.2a4 4 0 0 1 0 5.6" /></svg>
                    <span>{t('音を確認')}</span>
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </details>
        {voiceAutoPauseAvailable && <details className="auto-pause-panel">
          <summary>
            <span>
              <strong>{t('マイクによる自動停止')}</strong>
              <em className="summary-beta-badge">{t('ベータ')}</em>
              <small>{t('会話中だけ学習タイマーを停止')}</small>
            </span>
            <DisclosureIcon />
          </summary>
          <div className="auto-pause-panel-content">
            <div className="auto-pause-explanation">
              <p>{t('音声は端末内で判定し、録音・保存・外部送信しません。カメラも使用しません。')}</p>
            </div>
            <div className="auto-pause-panel-controls">
              <label className="auto-pause-enable-option">
                <input type="checkbox" checked={autoPauseEnabled} onChange={toggleAutoPause} />
                <strong>{t('使用する')}</strong>
              </label>
              <AutoPauseOption
                enabled={autoPauseEnabled}
                seconds={clampAutoPauseSeconds(state.settings.autoPauseVoiceSeconds ?? 2)}
                onSecondsChange={(seconds) => patchSettings({ autoPauseVoiceSeconds: seconds })}
                language={state.settings.speechLanguage ?? 'ja'}
                onLanguageChange={(speechLanguage) => patchSettings({ speechLanguage })}
              />
            </div>
          </div>
        </details>}
      </section>
      {voiceAutoPauseAvailable && <dialog
        ref={autoPauseInfoRef}
        className="feature-dialog"
        aria-labelledby="auto-pause-info-title"
        onClose={() => setAutoPauseInfoOpen(false)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setAutoPauseInfoOpen(false);
        }}
      >
        <div className="feature-dialog-content">
          <div className="feature-dialog-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20"><rect x="7" y="3" width="6" height="9" rx="3" /><path d="M4.8 9.5a5.2 5.2 0 0 0 10.4 0M10 14.7V17M7.5 17h5" /></svg>
          </div>
          <div>
            <span className="feature-dialog-beta">{t('ベータ')}</span>
            <h2 id="auto-pause-info-title">{t('マイクによる自動停止')}</h2>
            <p>{t('学習と関係のない会話が設定時間続くと停止し、会話が終わると再開します。')}</p>
          </div>
          <ul>
            <li>{t('マイクの音声は端末内だけで判定')}</li>
            <li>{t('録音・保存・外部送信はしません')}</li>
            <li>{t('手動で停止した場合は自動再開しません')}</li>
            <li>{t('カメラは使用しません')}</li>
          </ul>
          <div className="feature-dialog-actions">
            <Button variant="surface" onClick={() => setAutoPauseInfoOpen(false)}>{t('今は使わない')}</Button>
            <Button
              variant="primary"
              className="primary"
              onClick={() => {
                patchSettings({ autoPauseVoiceEnabled: true });
                setAutoPauseInfoOpen(false);
              }}
            >{t('オンにする')}</Button>
          </div>
        </div>
      </dialog>}
    </main>
  );
}
