import { useMemo, useState } from 'react';
import { Board } from './Board';
import type { AppState, WidgetId, WidgetSize } from './model';
import { formatClock, formatDuration, phaseKey, remainingSeconds, uiCopy, widgetLabels, widgetOrder } from './model';
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
        <ControlPage state={state} session={displaySession} now={now} actions={actions} onEdit={() => setPage('editor')} />
      ) : (
        <EditorPage
          state={state}
          session={displaySession}
          now={now}
          selected={selected}
          selectedWidget={selectedWidget}
          onSelect={setSelected}
          onUpdateSelected={updateSelected}
          patchSettings={patchSettings}
          patchState={patchState}
          onBack={() => setPage('control')}
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
  onEdit,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  actions: ReturnType<typeof useStudyStream>['actions'];
  onEdit: () => void;
}) {
  const copy = uiCopy[state.settings.language];
  const key = phaseKey(session);
  const isPaused = session.phase === 'study' && !session.tracking;
  const enterStudy = () => {
    if (session.phase === 'idle' || session.phase === 'break') actions.startStudy();
  };

  return (
    <main className="page control-page">
      <section className="panel session-panel">
        <div className="control-section-title">
          <div>
            <h1>配信操作</h1>
            <p>いまの状態を選択します</p>
          </div>
        </div>
        <div className="phase-summary">
          <div>
            <div className="phase-label-row">
              <p className="eyebrow">現在の状態</p>
            </div>
            <h1>{copy[key]}</h1>
          </div>
          <div className="control-clock">
            <strong>{formatClock(remainingSeconds(session, now))}</strong>
            <span>{copy.remaining}</span>
          </div>
        </div>

        <div className="control-actions" aria-label="配信状態">
          <button type="button" className={`button${session.phase === 'study' && session.tracking ? ' active' : ''}`} disabled={isPaused} onClick={enterStudy}>
            学習
          </button>
          <button type="button" className={`button${isPaused ? ' active' : ''}`} disabled={session.phase !== 'study'} onClick={actions.toggleTracking}>
            {isPaused ? '再開' : '一時停止'}
          </button>
          <button type="button" className={`button${session.phase === 'break' ? ' active' : ''}`} disabled={session.phase === 'idle'} onClick={actions.startBreak}>
            休憩
          </button>
        </div>

        <div className="session-stats">
          <div><strong>{formatDuration(session.sessionSeconds, state.settings.language)}</strong><span>{copy.session}</span></div>
          <div><strong>{formatDuration(session.todaySeconds, state.settings.language)}</strong><span>{copy.today}</span></div>
          <div><strong>{formatDuration(session.totalSeconds, state.settings.language)}</strong><span>{copy.total}</span></div>
        </div>
        <div className="control-utilities">
          <button type="button" className="open-editor-button" onClick={onEdit}>
            <span><strong>ボード編集</strong><small>色・文字・表示項目を変更</small></span>
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="copy-obs-button" onClick={() => void navigator.clipboard?.writeText('http://127.0.0.1:47831/overlay')}>
            OBS URLをコピー
          </button>
          {session.phase !== 'idle' && (
            <button type="button" className="session-end-button" onClick={actions.finish} aria-label="現在のセッションを終了">
              セッション終了
            </button>
          )}
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
  onUpdateSelected,
  patchSettings,
  patchState,
  onBack,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  selected: WidgetId;
  selectedWidget: AppState['settings']['widgets'][number];
  onSelect: (id: WidgetId) => void;
  onUpdateSelected: (changes: { visible?: boolean; size?: WidgetSize }) => void;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
  onBack: () => void;
}) {
  const language = state.settings.language;
  const messageKey = phaseKey(session);
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');

  const visibleCount = useMemo(() => state.settings.widgets.filter((widget) => widget.visible).length, [state.settings.widgets]);

  return (
    <main className="page editor-page">
      <section className="panel editor-preview-panel">
        <div className="section-heading compact">
          <div className="editor-heading-copy">
            <button type="button" className="editor-back" onClick={onBack}>← 配信操作へ戻る</button>
            <h1>視聴者表示を直接編集</h1>
          </div>
          <span className="helper-text">表示する内容を選び、文字サイズを調整</span>
        </div>
        <div className={`preview-canvas editor-canvas preview-${state.settings.layout}`}>
          <Board
            state={state}
            session={session}
            now={now}
            editor
            selected={selected}
            onSelect={onSelect}
          />
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
            <div className="visibility-panel" aria-label="表示・非表示">
              <div className="visibility-heading"><strong>表示・非表示</strong><span>{visibleCount}/6</span></div>
              <div className="visibility-list">
                {[...state.settings.widgets].sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id)).map((widget) => (
                  <label key={widget.id}>
                    <span>{widgetLabels[language][widget.id]}</span>
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
                  </label>
                ))}
              </div>
            </div>
            <div className="selected-item-settings">
            <p className="eyebrow">選択中の項目</p>
            <h2>{widgetLabels[language][selected]}</h2>
            <Field label="文字サイズ">
              <div className="segmented">
                {(['small', 'medium', 'large'] as WidgetSize[]).map((size) => (
                  <button key={size} className={selectedWidget.size === size ? 'active' : ''} onClick={() => onUpdateSelected({ size })}>
                    {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                  </button>
                ))}
              </div>
            </Field>
            {selected === 'streaks' && <StreakEditor state={state} patchState={patchState} />}
            </div>
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content">
            <p className="eyebrow">メッセージ設定</p>
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
            <p className="eyebrow">表示設定</p>
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
