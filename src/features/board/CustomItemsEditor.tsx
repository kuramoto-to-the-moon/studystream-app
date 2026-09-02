import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useI18n } from '../../i18n';
import { localizedStreakName, localizedStreakUnit, type AppState, type Streak } from '../../model';
import { VisibilityButton } from './VisibilityButton';

const weekdayOptions = [
  { day: 1, label: '月' }, { day: 2, label: '火' }, { day: 3, label: '水' }, { day: 4, label: '木' },
  { day: 5, label: '金' }, { day: 6, label: '土' }, { day: 0, label: '日' },
];

export function CustomItemsEditor({ state, patchState }: { state: AppState; patchState: (mutator: (draft: AppState) => AppState) => void }) {
  const { language, t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(state.settings.streaks[0]?.id ?? null);
  const [deletePending, setDeletePending] = useState(false);
  const streak = state.settings.streaks.find((item) => item.id === selectedId) ?? state.settings.streaks[0];
  const streakDisplayName = streak ? localizedStreakName(streak, language) : '';
  const change = (changes: Partial<Streak>) => {
    if (!streak) return;
    patchState((current) => ({
      ...current,
      settings: { ...current.settings, streaks: current.settings.streaks.map((item) => item.id === streak.id ? { ...item, ...changes } : item) },
    }));
  };
  const addItem = () => {
    const id = globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
    const item: Streak = { id, name: t('新しい項目'), kind: 'count', count: 0, unit: language === 'ja' ? '回' : 'times', visible: true };
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
        <span className="streak-group-label">{t('編集する項目')}</span>
        <div className="streak-selector-row">
          {state.settings.streaks.length > 0 && (
            <Select
              aria-label={t('編集する項目')}
              value={streak?.id ?? ''}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setDeletePending(false);
              }}
            >
              {state.settings.streaks.map((item) => {
                const itemName = localizedStreakName(item, language);
                const itemUnit = localizedStreakUnit(item, language);
                const value = item.kind === 'count'
                  ? `${Math.max(0, Math.floor(item.count ?? 0))}${language === 'ja' ? '' : ' '}${itemUnit || (language === 'ja' ? '回' : 'times')}`
                  : t('継続日数');
                return <option key={item.id} value={item.id}>{itemName || t('名称未設定')} ({value})</option>;
              })}
            </Select>
          )}
          <Button size="sm" className="add-streak-button" onClick={addItem}>{t('＋ 追加')}</Button>
        </div>
      </div>
      {state.settings.streaks.length === 0 && <p className="empty-settings">{t('まだ項目がありません。「追加」から作成できます。')}</p>}
      {streak && (
        <div className="streak-detail">
          <div className="streak-detail-heading">
            <strong>{t('選択中の項目を編集')}</strong>
            <VisibilityButton
              label={streakDisplayName || t('名称未設定')}
              visible={streak.visible}
              onToggle={() => change({ visible: !streak.visible })}
            />
          </div>
          <div className="streak-field-group">
            <div className="streak-core-fields">
              <label className="compact-field">
                <span>{t('項目名')}</span>
                <input value={streakDisplayName} maxLength={32} onChange={(event) => change({ name: event.target.value })} />
              </label>
              <label className="compact-field">
                <span>{t('種類')}</span>
                <Select
                  value={streak.kind ?? 'days'}
                  onChange={(event) => event.target.value === 'days'
                    ? change({ kind: 'days', startedOn: streak.startedOn || new Date().toISOString().slice(0, 10), dayMode: streak.dayMode || 'all' })
                    : change({ kind: 'count', count: streak.count ?? 0, unit: streak.unit || (language === 'ja' ? '回' : 'times') })}
                >
                  <option value="days">{t('継続日数')}</option>
                  <option value="count">{t('回数・数量')}</option>
                </Select>
              </label>
            </div>
          </div>
          <div className="streak-field-group">
            {(streak.kind ?? 'days') === 'days' ? (
              <>
              <div className="streak-day-fields">
                <label className="compact-field">
                  <span>{t('開始日')}</span>
                  <input type="date" value={streak.startedOn || ''} onChange={(event) => change({ startedOn: event.target.value })} />
                </label>
                <label className="compact-field">
                  <span>{t('数える日')}</span>
                  <Select value={streak.dayMode ?? 'all'} onChange={(event) => change({ dayMode: event.target.value as Streak['dayMode'] })}>
                    <option value="all">{t('毎日')}</option>
                    <option value="weekdays">{t('平日のみ')}</option>
                    <option value="weekends">{t('土日のみ')}</option>
                    <option value="custom">{t('曜日を選ぶ')}</option>
                  </Select>
                </label>
              </div>
              {streak.dayMode === 'custom' && (
                <div className="weekday-picker" aria-label={t('数える曜日')}>
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
                        <span>{language === 'ja' ? label : ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              </>
            ) : (
              <div className="count-fields">
                <label className="compact-field"><span>{t('現在の数')}</span><input aria-label={language === 'ja' ? `${streak.name || 'カスタム項目'}の現在の数` : `Current value for ${streak.name || 'custom item'}`} type="number" min="0" step="1" value={streak.count ?? 0} onChange={(event) => change({ count: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="compact-field"><span>{t('単位')}</span><input value={streak.unit || ''} maxLength={8} placeholder={t('回・冊・本')} onChange={(event) => change({ unit: event.target.value })} /></label>
              </div>
            )}
          </div>
          {deletePending ? (
            <div className="streak-delete-confirm" role="alert">
              <span>{language === 'ja' ? `「${streakDisplayName.trim() || 'この項目'}」を削除しますか？` : `Delete “${streakDisplayName.trim() || 'this item'}”?`}</span>
              <div>
                <Button size="sm" onClick={() => setDeletePending(false)}>{t('キャンセル')}</Button>
                <Button size="sm" variant="danger" className="confirm-delete-button" onClick={removeItem}>{t('削除')}</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" size="auto" className="remove-streak-button" onClick={() => setDeletePending(true)}>
              <span>{language === 'ja' ? (streakDisplayName.trim() ? `${streakDisplayName.trim()}を削除` : 'この項目を削除') : `Delete ${streakDisplayName.trim() || 'this item'}`}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
