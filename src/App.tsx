import { useState } from 'react';
import { Board } from './Board';
import type { AppState, MetricKind, MetricWidgetId, Streak, WidgetId } from './model';
import { defaultMetricKinds, formatClock, formatDuration, metricLabels, phaseKey, remainingSeconds, uiCopy, widgetLabels, widgetOrder } from './model';
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

  function patchState(mutator: (draft: AppState) => AppState) {
    update(mutator);
  }

  function patchSettings(changes: Partial<AppState['settings']>) {
    patchState((current) => ({ ...current, settings: { ...current.settings, ...changes } }));
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
          onSelect={setSelected}
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
  onSelect,
  patchSettings,
  patchState,
  onBack,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  selected: WidgetId;
  onSelect: (id: WidgetId) => void;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
  onBack: () => void;
}) {
  const language = state.settings.language;
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');
  const metricKinds = { ...defaultMetricKinds, ...state.settings.metricKinds };

  return (
    <main className="page editor-page">
      <header className="editor-page-header">
        <button type="button" className="editor-back" onClick={onBack}>← 配信操作へ戻る</button>
        <div>
          <h1>ボード編集</h1>
          <p>視聴者に表示する内容と見た目を調整します</p>
        </div>
      </header>
      <section className="panel editor-preview-panel">
        <div className="preview-card-heading">
          <h2>視聴者表示プレビュー</h2>
          <span>OBSに表示される画面</span>
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
              <div className="visibility-heading"><strong>上段の表示</strong><span>状態・時間・文言</span></div>
              <div className="visibility-list">
                {[...state.settings.widgets].filter((widget) => ['state', 'timer', 'message'].includes(widget.id)).sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id)).map((widget) => (
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
            <div className="metric-slot-settings">
              <p className="eyebrow">メッセージ下の表示</p>
              <h2>集計ウィジェット</h2>
              <p className="settings-note">最大3枠。表示する数に合わせて横幅が自動調整されます。</p>
              <div className="metric-slot-list">
                {metricSlotIds.map((slotId, index) => {
                  const widget = state.settings.widgets.find((item) => item.id === slotId);
                  return (
                    <div className="metric-slot-row" key={slotId}>
                      <input
                        type="checkbox"
                        aria-label={`下段${index + 1}を表示`}
                        checked={widget?.visible ?? true}
                        onChange={(event) => {
                          const visible = event.target.checked;
                          patchState((current) => ({
                            ...current,
                            settings: {
                              ...current.settings,
                              widgets: current.settings.widgets.map((item) => item.id === slotId ? { ...item, visible } : item),
                            },
                          }));
                          if (visible) onSelect(slotId);
                        }}
                      />
                      <span>枠 {index + 1}</span>
                      <select
                        aria-label={`下段${index + 1}の内容`}
                        value={metricKinds[slotId]}
                        onChange={(event) => patchSettings({
                          metricKinds: { ...metricKinds, [slotId]: event.target.value as MetricKind },
                        })}
                      >
                        {metricKindIds.map((kind) => <option key={kind} value={kind}>{metricLabels[language][kind]}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <details className="streak-manager">
                <summary>継続項目を管理</summary>
                <StreakEditor state={state} patchState={patchState} />
              </details>
            </div>
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content">
            <p className="eyebrow">メッセージ設定</p>
            <h2>状態別メッセージ</h2>
            <p className="settings-note">各状態で視聴者に表示する文言を設定します。</p>
            {(['study', 'paused', 'break', 'idle'] as const).map((messageKey) => (
              <Field key={messageKey} label={messageLabels[language][messageKey]}>
                <textarea
                  rows={3}
                  maxLength={220}
                  value={state.settings.messages[messageKey]}
                  onChange={(event) => patchSettings({ messages: { ...state.settings.messages, [messageKey]: event.target.value } })}
                />
                <small>{state.settings.messages[messageKey].length}/220文字</small>
              </Field>
            ))}
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
            <Field label={`文字の不透明度 ${Math.round((state.settings.textOpacity ?? 1) * 100)}%`}>
              <input type="range" min="0" max="100" value={(state.settings.textOpacity ?? 1) * 100} onChange={(event) => patchSettings({ textOpacity: Number(event.target.value) / 100 })} />
            </Field>
          </div>
        )}
      </aside>
    </main>
  );
}

function StreakEditor({ state, patchState }: { state: AppState; patchState: (mutator: (draft: AppState) => AppState) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.settings.streaks[0]?.id ?? null);
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
  };
  const removeItem = () => {
    if (!streak) return;
    patchState((current) => ({
      ...current,
      settings: { ...current.settings, streaks: current.settings.streaks.filter((item) => item.id !== streak.id) },
    }));
    setSelectedId(state.settings.streaks.find((item) => item.id !== streak.id)?.id ?? null);
  };
  return (
    <div className="streak-editor">
      <div className="streak-editor-heading">
        <div><strong>登録した項目</strong><small>表示中の項目は6秒ごとに切り替わります</small></div>
        <button type="button" className="add-streak-button" onClick={addItem}>＋ 追加</button>
      </div>
      {state.settings.streaks.length > 0 ? (
        <div className="streak-list">
          {state.settings.streaks.map((item) => (
            <div key={item.id} className={`streak-list-row${item.id === streak?.id ? ' active' : ''}`}>
              <button type="button" onClick={() => setSelectedId(item.id)}>
                <strong>{item.name || '名称未設定'}</strong>
                <small>{item.kind === 'count' ? `${Math.max(0, Math.floor(item.count ?? 0))}${item.unit || '回'}` : '開始日からの日数'}</small>
              </button>
              <input
                type="checkbox"
                aria-label={`${item.name || '名称未設定'}を表示`}
                checked={item.visible}
                onChange={(event) => {
                  const visible = event.target.checked;
                  patchState((current) => ({
                    ...current,
                    settings: { ...current.settings, streaks: current.settings.streaks.map((currentItem) => currentItem.id === item.id ? { ...currentItem, visible } : currentItem) },
                  }));
                }}
              />
            </div>
          ))}
        </div>
      ) : <p className="empty-settings">まだ項目がありません。「追加」から作成できます。</p>}
      {streak && (
        <div className="streak-detail">
          <Field label="項目名"><input value={streak.name} maxLength={32} onChange={(event) => change({ name: event.target.value })} /></Field>
          <Field label="記録方法">
            <div className="segmented">
              <button type="button" className={(streak.kind ?? 'days') === 'days' ? 'active' : ''} onClick={() => change({ kind: 'days', startedOn: streak.startedOn || new Date().toISOString().slice(0, 10) })}>開始日からの日数</button>
              <button type="button" className={streak.kind === 'count' ? 'active' : ''} onClick={() => change({ kind: 'count', count: streak.count ?? 0, unit: streak.unit || '回' })}>回数・数量</button>
            </div>
          </Field>
          {(streak.kind ?? 'days') === 'days' ? (
            <Field label="開始日"><input type="date" value={streak.startedOn || ''} onChange={(event) => change({ startedOn: event.target.value })} /></Field>
          ) : (
            <>
              <div className="count-fields">
                <Field label="現在の数"><input type="number" min="0" step="1" value={streak.count ?? 0} onChange={(event) => change({ count: Math.max(0, Number(event.target.value) || 0) })} /></Field>
                <Field label="単位"><input value={streak.unit || ''} maxLength={8} placeholder="回・冊・本" onChange={(event) => change({ unit: event.target.value })} /></Field>
              </div>
              <div className="count-actions">
                <button type="button" onClick={() => change({ count: Math.max(0, (streak.count ?? 0) - 1) })}>−1</button>
                <button type="button" onClick={() => change({ count: (streak.count ?? 0) + 1 })}>＋1</button>
              </div>
            </>
          )}
          <button type="button" className="remove-streak-button" onClick={removeItem}>この項目を削除</button>
        </div>
      )}
    </div>
  );
}

const messageLabels = {
  ja: { study: '学習中', paused: '一時停止中', break: '休憩中', idle: '待機中' },
  en: { study: 'Studying', paused: 'Paused', break: 'On break', idle: 'Ready' },
} as const;

const metricSlotIds: MetricWidgetId[] = ['session', 'today', 'streaks'];
const metricKindIds: MetricKind[] = ['session', 'today', 'week', 'month', 'year', 'total', 'streaks'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
