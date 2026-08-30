import { useEffect, useState } from 'react';
import { Board } from './Board';
import type { AppState, MetricKind, MetricWidgetId, Streak } from './model';
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
  const { state, displaySession, now, update, actions } = store;
  const [page, setPage] = useState<Page>('control');
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('studystream-app-theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('studystream-app-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  if (!state || !displaySession) return null;

  function patchState(mutator: (draft: AppState) => AppState) {
    update(mutator);
  }

  function patchSettings(changes: Partial<AppState['settings']>) {
    patchState((current) => ({ ...current, settings: { ...current.settings, ...changes } }));
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  return (
    <div className="app-shell">
      <header className={`app-header app-header-${page}`}>
        <div className="app-header-inner">
          <button type="button" className="wordmark" onClick={() => navigate('control')}>StudyStream</button>
          <details className="app-settings">
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
                <span>配信者向けの操作画面</span>
              </div>
              <div className="app-settings-group">
                <span>表示テーマ</span>
                <div className="theme-options">
                  <button type="button" className={!darkMode ? 'active' : ''} onClick={() => setDarkMode(false)}>ライト</button>
                  <button type="button" className={darkMode ? 'active' : ''} onClick={() => setDarkMode(true)}>ダーク</button>
                </div>
              </div>
              <p>視聴者表示の色には影響しません</p>
            </div>
          </details>
        </div>
      </header>

      {page === 'control' ? (
        <ControlPage state={state} session={displaySession} now={now} actions={actions} onEdit={() => navigate('editor')} />
      ) : (
        <EditorPage
          state={state}
          session={displaySession}
          now={now}
          patchSettings={patchSettings}
          patchState={patchState}
          onBack={() => navigate('control')}
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
      <header className="page-heading">
        <h1>配信操作</h1>
        <p>学習と休憩の状態を切り替えます</p>
      </header>
      <section className="panel session-panel">
        <div className="panel-heading">
          <div><h2>現在のセッション</h2><p>操作はOBSの表示にすぐ反映されます</p></div>
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

        <div className={`control-actions${session.phase !== 'idle' ? ' has-session' : ''}`} aria-label="配信状態">
          <button type="button" className={`button${session.phase === 'study' && session.tracking ? ' active' : ''}`} disabled={isPaused} onClick={enterStudy}>
            学習
          </button>
          <button type="button" className={`button${isPaused ? ' active' : ''}`} disabled={session.phase !== 'study'} onClick={actions.toggleTracking}>
            {isPaused ? '再開' : '一時停止'}
          </button>
          <button type="button" className={`button${session.phase === 'break' ? ' active' : ''}`} disabled={session.phase === 'idle'} onClick={actions.startBreak}>
            休憩
          </button>
          {session.phase !== 'idle' && (
            <button type="button" className="button session-end-button" onClick={actions.finish} aria-label="現在のセッションを終了">
              セッション終了
            </button>
          )}
        </div>

        <div className="session-stats">
          <div><strong>{formatDuration(session.sessionSeconds, state.settings.language)}</strong><span>{copy.session}</span></div>
          <div><strong>{formatDuration(session.todaySeconds, state.settings.language)}</strong><span>{copy.today}</span></div>
          <div><strong>{formatDuration(session.totalSeconds, state.settings.language)}</strong><span>{copy.total}</span></div>
        </div>
      </section>
      <section className="panel board-tools-panel">
        <div className="panel-heading">
          <div><h2>配信ボード</h2><p>視聴者に見せる情報とデザインを管理します</p></div>
        </div>
        <div className="board-tools-actions">
          <button type="button" className="open-editor-button" onClick={onEdit}>
            <span><strong>ボード編集</strong><small>表示内容・メッセージ・色を変更</small></span>
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="copy-obs-button" onClick={() => void navigator.clipboard?.writeText('http://127.0.0.1:47831/overlay')}>
            OBS URLをコピー
          </button>
        </div>
      </section>
    </main>
  );
}

function EditorPage({
  state,
  session,
  now,
  patchSettings,
  patchState,
  onBack,
}: {
  state: AppState;
  session: NonNullable<ReturnType<typeof useStudyStream>['displaySession']>;
  now: number;
  patchSettings: (changes: Partial<AppState['settings']>) => void;
  patchState: (mutator: (draft: AppState) => AppState) => void;
  onBack: () => void;
}) {
  const language = state.settings.language;
  const [section, setSection] = useState<'widget' | 'appearance' | 'message'>('widget');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [messageEditorKey, setMessageEditorKey] = useState<keyof AppState['settings']['messages']>(phaseKey(session));
  const metricKinds = { ...defaultMetricKinds, ...state.settings.metricKinds };
  const currentMessageKey = phaseKey(session);

  function changeMetricKind(slotId: MetricWidgetId, nextKind: MetricKind) {
    const previousKind = metricKinds[slotId];
    const occupiedSlot = metricSlotIds.find((candidate) => candidate !== slotId && metricKinds[candidate] === nextKind);
    const nextMetricKinds = { ...metricKinds, [slotId]: nextKind };
    if (occupiedSlot) nextMetricKinds[occupiedSlot] = previousKind;
    patchSettings({ metricKinds: nextMetricKinds });
  }

  return (
    <main className={`page editor-page${previewOpen ? '' : ' preview-hidden'}`}>
      <header className="editor-page-header page-heading">
        <button type="button" className="editor-back" onClick={onBack}>← 配信操作へ戻る</button>
        <div className="editor-title-row">
          <div>
            <h1>ボード編集</h1>
            <p>視聴者に表示する内容と見た目を調整します</p>
          </div>
          <button type="button" className="preview-toggle-button" onClick={() => setPreviewOpen((open) => !open)}>
            {previewOpen ? 'プレビューを閉じる' : 'プレビューを表示'}
          </button>
        </div>
      </header>
      {previewOpen && <section className="panel editor-preview-panel">
        <div className="preview-card-heading">
          <h2>視聴者表示プレビュー</h2>
          <span>OBSに表示される画面</span>
        </div>
        <div className={`preview-canvas editor-canvas preview-${state.settings.layout}`}>
          <Board
            state={state}
            session={session}
            now={now}
          />
        </div>
      </section>}

      <aside className="panel inspector">
        <div className="inspector-tabs">
          <button className={section === 'widget' ? 'active' : ''} onClick={() => setSection('widget')}>表示内容</button>
          <button className={section === 'message' ? 'active' : ''} onClick={() => setSection('message')}>状態メッセージ</button>
          <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>色・レイアウト</button>
        </div>

        {section === 'widget' && (
          <div className="inspector-content">
            <div className="inspector-page-heading">
              <h2>表示内容</h2>
              <p>視聴者に見せる情報を選びます</p>
            </div>
            <section className="settings-section">
              <div className="settings-section-heading"><strong>配信表示の言語</strong><span>ラベルと時間表記が変わります</span></div>
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
            <section className="settings-section" aria-label="基本表示">
              <div className="settings-section-heading"><strong>基本表示</strong><span>状態・残り時間・メッセージ</span></div>
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
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-heading"><strong>集計表示</strong><span>最大3件。同じ内容を選ぶと枠が入れ替わります</span></div>
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
                        }}
                      />
                      <span>枠 {index + 1}</span>
                      <select
                        aria-label={`下段${index + 1}の内容`}
                        value={metricKinds[slotId]}
                        onChange={(event) => changeMetricKind(slotId, event.target.value as MetricKind)}
                      >
                        {metricKindIds.map((kind) => <option key={kind} value={kind}>{metricLabels[language][kind]}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>
            <details className="settings-section streak-manager">
              <summary><span><strong>継続項目</strong><small>継続日数や回数を管理</small></span><span aria-hidden="true">開く</span></summary>
              <StreakEditor state={state} patchState={patchState} />
            </details>
          </div>
        )}

        {section === 'message' && (
          <div className="inspector-content">
            <div className="inspector-page-heading">
              <h2>状態メッセージ</h2>
              <p>状態ごとに視聴者へ表示する文を設定します</p>
            </div>
            <div className="message-state-grid">
              {(['study', 'paused', 'break', 'idle'] as const).map((messageKey) => (
                <button
                  type="button"
                  key={messageKey}
                  className={messageEditorKey === messageKey ? 'active' : ''}
                  onClick={() => setMessageEditorKey(messageKey)}
                >
                  <strong>{messageLabels[language][messageKey]}</strong>
                  <small>{currentMessageKey === messageKey ? '現在の状態' : messageDescriptions[language][messageKey]}</small>
                </button>
              ))}
            </div>
            <div className="message-editor-box">
              <div className="message-editor-heading">
                <strong>{messageLabels[language][messageEditorKey]}</strong>
                <span>{messageDescriptions[language][messageEditorKey]}</span>
              </div>
              <textarea
                rows={4}
                maxLength={220}
                aria-label={`${messageLabels[language][messageEditorKey]}の表示文`}
                value={state.settings.messages[messageEditorKey]}
                onChange={(event) => patchSettings({ messages: { ...state.settings.messages, [messageEditorKey]: event.target.value } })}
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
                  {messageTemplates[language][messageEditorKey].map((template) => <option key={template} value={template}>{template}</option>)}
                </select>
                <small>{state.settings.messages[messageEditorKey].length}/220文字</small>
              </div>
            </div>
          </div>
        )}

        {section === 'appearance' && (
          <div className="inspector-content">
            <div className="inspector-page-heading">
              <h2>色・レイアウト</h2>
              <p>配信画面に合わせて形と色を整えます</p>
            </div>
            <section className="settings-section">
              <div className="settings-section-heading"><strong>レイアウト</strong><span>OBSで使う縦横比に合わせます</span></div>
              <div className="segmented">
                <button className={state.settings.layout === 'horizontal' ? 'active' : ''} onClick={() => patchSettings({ layout: 'horizontal' })}>横長</button>
                <button className={state.settings.layout === 'vertical' ? 'active' : ''} onClick={() => patchSettings({ layout: 'vertical' })}>縦長</button>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-heading"><strong>色と透過</strong><span>背景と文字を個別に調整できます</span></div>
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
            </section>
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
            <>
              <div className="count-fields">
                <label className="compact-field"><span>現在の数</span><input type="number" min="0" step="1" value={streak.count ?? 0} onChange={(event) => change({ count: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="compact-field"><span>単位</span><input value={streak.unit || ''} maxLength={8} placeholder="回・冊・本" onChange={(event) => change({ unit: event.target.value })} /></label>
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

const messageDescriptions = {
  ja: { study: '学習時間を計測中', paused: '学習タイマーを一時停止中', break: '休憩時間中', idle: 'セッション開始前' },
  en: { study: 'While study time runs', paused: 'While the timer is paused', break: 'During a break', idle: 'Before the session starts' },
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

const metricSlotIds: MetricWidgetId[] = ['session', 'today', 'streaks'];
const metricKindIds: MetricKind[] = ['session', 'today', 'week', 'month', 'year', 'total', 'streaks'];
const weekdayOptions = [
  { day: 1, label: '月' }, { day: 2, label: '火' }, { day: 3, label: '水' }, { day: 4, label: '木' },
  { day: 5, label: '金' }, { day: 6, label: '土' }, { day: 0, label: '日' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
