import { IconButton } from '../../components/ui/Button';
import { useI18n } from '../../i18n';

export function VisibilityButton({ label, visible, onToggle }: { label: string; visible: boolean; onToggle: () => void }) {
  const { language, t } = useI18n();
  const action = visible ? t('非表示にする') : t('表示する');
  const accessibleLabel = language === 'ja' ? `${label}を${action}` : `${action} ${label}`;
  return (
    <IconButton
      className={`visibility-button${visible ? ' visible' : ''}`}
      label={accessibleLabel}
      aria-pressed={visible}
      title={accessibleLabel}
      onClick={onToggle}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
        <circle cx="10" cy="10" r="2.1" />
        {!visible && <path className="visibility-slash" d="m4 4 12 12" />}
      </svg>
    </IconButton>
  );
}
