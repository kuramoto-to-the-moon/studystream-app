import { useMemo, useState } from 'react';
import { Board } from './Board';
import type { AppState, Phase, WidgetId, WidgetSize } from './model';
import { formatClock, formatDuration, phaseKey, remainingSeconds, uiCopy, widgetLabels } from './model';
import { useStudyStream } from './useStudyStream';

type Page = 'control' | 'editor';

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

function Dashboard({ store }: { store: ReturnType<typeof useStudyStream> }) {
  const { state, displaySession, now, connected, update, actions } = store;
  const [page, setPage] = useState<Page>('control');
  const [selected, setSelected] = useState<WidgetId>('state');
  if (!state || !displaySession) return null;

  const selectedWidget = state.settings.widgets.find((widget) => widget.id === selected) || state.settings.widgets[0];

  function patchState(mutator: (draft: AppState) => AppState) {
    update(mutator);
  }

  function patchSettings(changes: Partial<AppState['settings']>) {
    patchState((current) => ({ ...current, settings: { ...current.settings, ...changes } }));
  }

  function moveWidget(id: WidgetId, direction: -1 | 1) {
    patchState((current) => {
      const widgets = [...current.settings.widgets];
      const index = widgets.findIndex((widget) => widget.id === id);
      const nextIndex = Math.max(0, Math.min(widgets.length - 1, index + direction));
      if (index === nextIndex) return current;
      const [item] = widgets.splice(index, 1);
      widgets.splice(nextIndex, 0, item);
      return { ...current, settings: { ...current.settings, widgets } };
    });
  }

  function dropWidget(source: WidgetId, target: WidgetId) {
    patchState((current) => {
      const widgets = [...current.settings.widgets];
      const sourceIndex = widgets.findIndex((widget) => widget.id === source);
      const targetIndex = widgets.findIndex((widget) => widget.id === target);
      const [item] = widgets.splice(sourceIndex, 1);
      widgets.splice(targetIndex, 0, item);
      return { ...current, settings: { ...current.settings, widgets } };
    });
  }

  function updateSelected(changes: { visible?: boolean; size?: WidgetSize }) {
    patchState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: current.settings.widgets.map((widget) => (widget.id === selected ? { ...widget, ...changes } : widget)),
      },
    }));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="wordmark" onClick={() => setPage('control')}>StudyStream</button>
        <nav aria-label="メインナビゲーション">
          <button className={page === 'control' ? 'active' : ''} onClick={() => setPage('control')}>配信コントロール</button>
          <button className={page === 'editor' ? 'active' : ''} onClick={() => setPage('editor')}>ボード編集</button>
        </nav>
        <div className="header-tools">
          <span className={`connection-dot ${connected ? 'online' : ''}`} aria-hidden="true" />
          <span>{connected ? 'ローカル保存' : '再接続中'}</span>
          <select
            aria-label="視聴者表示言語"
            value={state.settings.language}
            onChange={(event) => patchSettings({ language: event.target.value as 'ja' | 'en' })}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>
      </header>

      {page === 'control' ? (
        <ControlPage state={state} session={displaySession} now={now} actions={actions} patchSettings={patchSettings} />
      ) : (
        <EditorPage
          state={state}
          session={displaySession}
          now={now}
          selected={selected}
          selectedWidget={selectedWidget}
          onSelect={setSelected}
          onMove={moveWidget}
          onDrop={dropWidget}
          onUpdateSelected={updateSelected}
          patchSettings={patchSettings}
          patchState={patchState}
        />
      )}
    </div>
  );
}

function ControlPage({
  state,
  session,
  now,
  actions,
  patchSettings,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  actions: ReturnType<typeof useStudyStream>['actions'];
  patchSettings: (changes: Partial<AppState['settings']>) => void;
}) {
  const copy = uiCopy[state.settings.language];
  const key = phaseKey(session);
  const primaryAction = session.phase === 'idle' ? actions.startStudy : actions.finish;
  const primaryLabel = session.phase === 'idle' ? '学習を開始' : 'セッションを終了';

  return (
    <main className="page control-page">
      <section className="panel session-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT SESSION</p>
            <h1>{copy[key]}</h1>
          </div>
          <span className={`tracking-pill ${session.tracking ? 'active' : ''}`}>
            <span aria-hidden="true" />{session.tracking ? copy.tracking : copy.notTracking}
          </span>
        </div>

        <div className="hero-clock">
          <strong>{formatClock(remainingSeconds(session, now))}</strong>
          <span>{copy.remaining}</span>
        </div>

        <div className="control-actions">
          <button type="button" className="button primary" onClick={primaryAction}>
            {session.phase === 'idle' ? <PlayIcon /> : <StopIcon />}
            {primaryLabel}
          </button>
          <button type="button" className="button" disabled={session.phase !== 'study'} onClick={actions.toggleTracking}>
            {session.tracking ? <PauseIcon /> : <PlayIcon />}
            {session.tracking ? '計測を一時停止' : '計測を再開'}
          </button>
          <button type="button" className="button" disabled={session.phase === 'idle'} onClick={actions.startBreak}>
            <CupIcon />休憩へ
          </button>
        </div>

        <div className="session-stats">
          <div><strong>{formatDuration(session.sessionSeconds, state.settings.language)}</strong><span>{copy.session}</span></div>
          <div><strong>{formatDuration(session.todaySeconds, state.settings.language)}</strong><span>{copy.today}</span></div>
          <div><strong>{formatDuration(session.totalSeconds, state.settings.language)}</strong><span>{copy.total}</span></div>
        </div>
      </section>

      <section className="panel preview-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">OBS PREVIEW</p>
            <h2>視聴者表示</h2>
          </div>
          <div className="inline-fields">
            <label>形
              <select value={state.settings.layout} onChange={(event) => patchSettings({ layout: event.target.value as 'horizontal' | 'vertical' })}>
                <option value="horizontal">横長</option>
                <option value="vertical">縦長</option>
              </select>
            </label>
          </div>
        </div>
        <div className={`preview-canvas preview-${state.settings.layout}`}>
          <Board state={state} session={session} now={now} />
        </div>
        <div className="obs-url">
          <div><span>OBS Browser Source</span><code>http://127.0.0.1:47831/overlay</code></div>
          <button type="button" onClick={() => void navigator.clipboard?.writeText('http://127.0.0.1:47831/overlay')}>URLをコピー</button>
        </div>
      </section>
    </main>
  );
}

function EditorPage({
  state,
  session,
  now,
  selected,
  selectedWidget,
  onSelect,
  onMove,
  onDrop,
  onUpdateSelected,
  patchSettings,
  patchState,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  selected: WidgetId;
  selectedWidget: AppState['settings']['widgets'][number];
  onSelect: (id: WidgetId) => void;
  onMove: (id: WidgetId, direction: -1 | 1) => void;
  onDrop: (source: WidgetId, target: WidgetId) => void;
  onUpdateSelected: (changes: { visible?: boolean; size?: WidgetSize }) => void;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
}) {
  const language = state.settings.language;
  const messageKey = phaseKey(session);
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');

  const visibleCount = useMemo(() => state.settings.widgets.filter((widget) => widget.visible).length, [state.settings.widgets]);

  return (
    <main className="page editor-page">
      <section className="panel editor-preview-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">BOARD EDITOR</p>
            <h1>視聴者表示を直接編集</h1>
          </div>
          <span className="helper-text">要素を選択、またはドラッグして移動</span>
        </div>
        <div className={`preview-canvas editor-canvas preview-${state.settings.layout}`}>
          <Board
            state={state}
            session={session}
            now={now}
            editor
            selected={selected}
            onSelect={onSelect}
            onMove={onMove}
            onDropWidget={onDrop}
          />
        </div>
        <div className="widget-visibility-row" aria-label="表示する項目">
          {state.settings.widgets.map((widget) => (
            <label key={widget.id} className={widget.visible ? 'enabled' : ''}>
              <input
                type="checkbox"
                checked={widget.visible}
                onChange={(event) => {
                  patchState((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      widgets: current.settings.widgets.map((item) => item.id === widget.id ? { ...item, visible: event.target.checked } : item),
                    },
                  }));
                  if (event.target.checked) onSelect(widget.id);
                }}
              />
              {widgetLabels[language][widget.id]}
            </label>
          ))}
          <span>{visibleCount}/6 表示</span>
        </div>
      </section>

      <aside className="panel inspector">
        <div className="inspector-tabs">
          <button className={section === 'widget' ? 'active' : ''} onClick={() => setSection('widget')}>項目</button>
          <button className={section === 'message' ? 'active' : ''} onClick={() => setSection('message')}>文言</button>
          <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>外観</button>
        </div>

        {section === 'widget' && (
          <div className="inspector-content">
            <p className="eyebrow">SELECTED WIDGET</p>
            <h2>{widgetLabels[language][selected]}</h2>
            <Field label="表示サイズ">
              <div className="segmented">
                {(['small', 'medium', 'large'] as WidgetSize[]).map((size) => (
                  <button key={size} className={selectedWidget.size === size ? 'active' : ''} onClick={() => onUpdateSelected({ size })}>
                    {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                  </button>
                ))}
              </div>
            </Field>
            <label className="switch-row">
              <span><strong>ボードに表示</strong><small>非表示にしても設定は残ります</small></span>
              <input type="checkbox" checked={selectedWidget.visible} onChange={(event) => onUpdateSelected({ visible: event.target.checked })} />
            </label>
            {selected === 'streaks' && <StreakEditor state={state} patchState={patchState} />}
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content">
            <p className="eyebrow">MESSAGE</p>
            <h2>状態別メッセージ</h2>
            <Field label="現在の状態">
              <select value={messageKey} disabled>
                <option>{uiCopy[language][messageKey]}</option>
              </select>
            </Field>
            <Field label="視聴者に表示する文言">
              <textarea
                rows={5}
                maxLength={220}
                value={state.settings.messages[messageKey]}
                onChange={(event) => patchSettings({ messages: { ...state.settings.messages, [messageKey]: event.target.value } })}
              />
              <small>{state.settings.messages[messageKey].length}/220文字</small>
            </Field>
          </div>
        )}

        {section === 'appearance' && (
          <div className="inspector-content">
            <p className="eyebrow">APPEARANCE</p>
            <h2>ボードの外観</h2>
            <Field label="形">
              <div className="segmented">
                <button className={state.settings.layout === 'horizontal' ? 'active' : ''} onClick={() => patchSettings({ layout: 'horizontal' })}>横長</button>
                <button className={state.settings.layout === 'vertical' ? 'active' : ''} onClick={() => patchSettings({ layout: 'vertical' })}>縦長</button>
              </div>
            </Field>
            <div className="color-fields">
              <Field label="背景色"><input type="color" value={state.settings.background} onChange={(event) => patchSettings({ background: event.target.value })} /></Field>
              <Field label="文字色"><input type="color" value={state.settings.textColor} onChange={(event) => patchSettings({ textColor: event.target.value })} /></Field>
            </div>
            <Field label={`背景の不透明度 ${Math.round(state.settings.backgroundOpacity * 100)}%`}>
              <input type="range" min="0" max="100" value={state.settings.backgroundOpacity * 100} onChange={(event) => patchSettings({ backgroundOpacity: Number(event.target.value) / 100 })} />
            </Field>
          </div>
        )}
      </aside>
    </main>
  );
}

function StreakEditor({ state, patchState }: { state: AppState; patchState: (mutator: (draft: AppState) => AppState) => void }) {
  const streak = state.settings.streaks[0];
  if (!streak) return null;
  const change = (changes: Partial<typeof streak>) => patchState((current) => ({
    ...current,
    settings: { ...current.settings, streaks: current.settings.streaks.map((item) => item.id === streak.id ? { ...item, ...changes } : item) },
  }));
  return (
    <div className="streak-editor">
      <Field label="項目名"><input value={streak.name} maxLength={32} onChange={(event) => change({ name: event.target.value })} /></Field>
      <Field label="開始日"><input type="date" value={streak.startedOn} onChange={(event) => change({ startedOn: event.target.value })} /></Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 10 7-10 7V5Z" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>;
}
function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z" /></svg>;
}
function CupIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Zm11 2h2a2 2 0 0 1 0 4h-2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}
