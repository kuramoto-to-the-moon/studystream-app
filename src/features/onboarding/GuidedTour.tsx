import { useEffect, useLayoutEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n';

type TourStep = {
  selector: string;
  title: string;
  description: string;
};

const controlSteps: TourStep[] = [
  {
    selector: '[data-tour="phase-controls"]',
    title: '学習と休憩を切り替える',
    description: '配信中の操作はここだけで完結します。学習時間は、学習中だけ自動で記録されます。',
  },
  {
    selector: '[data-tour="board-edit"]',
    title: '配信表示を編集する',
    description: '視聴者へ見せる内容やメッセージを変更する時に使います。',
  },
  {
    selector: '[data-tour="offstream-study"]',
    title: '配信外の学習時間を加える',
    description: '配信前などに勉強した時間を、今日の学習時間へ追加・差し引きできます。',
  },
  {
    selector: '[data-tour="timer-settings"]',
    title: '時間と動作を設定する',
    description: '学習・休憩の時間、自動切替、終了音を必要な時だけ変更できます。',
  },
];

const editorSteps: TourStep[] = [
  {
    selector: '[data-tour="editor-preview"]',
    title: 'プレビューで確認する',
    description: '変更した内容が視聴者にどう見えるか、ここで確認できます。OBSにも同じ表示が反映されます。',
  },
  {
    selector: '[data-tour="editor-tabs"]',
    title: '編集する内容を選ぶ',
    description: '表示する情報、状態ごとのメッセージ、レイアウトを切り替えて編集できます。',
  },
  {
    selector: '[data-tour="editor-main-display"]',
    title: '基本の表示を選ぶ',
    description: '状態、残り時間、メッセージから、視聴者へ見せるものを選びます。',
  },
  {
    selector: '[data-tour="editor-custom-items"]',
    title: '必要なら項目を追加する',
    description: '筋トレや読書など、学習時間以外の記録も表示できます。',
  },
];

export function GuidedTour({ page, onClose }: { page: 'control' | 'editor'; onClose: () => void }) {
  const { language, t } = useI18n();
  const steps = page === 'editor' ? editorSteps : controlSteps;
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];

  useLayoutEffect(() => {
    let target: HTMLElement | null = null;
    let attempts = 0;
    let frame = 0;
    const locateTarget = () => {
      target = document.querySelector<HTMLElement>(step.selector);
      if (!target && attempts < 30) {
        attempts += 1;
        frame = window.requestAnimationFrame(locateTarget);
        return;
      }
      if (!target) return;
      const initialRect = target.getBoundingClientRect();
      if (initialRect.top < 84 || initialRect.bottom > window.innerHeight - 24) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      frame = window.requestAnimationFrame(() => {
        if (target) setTargetRect(target.getBoundingClientRect());
      });
    };
    const update = () => {
      if (!target) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (target) setTargetRect(target.getBoundingClientRect());
      });
    };
    locateTarget();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!targetRect) return null;

  const tooltipWidth = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(targetRect.left, window.innerWidth - tooltipWidth - 12));
  const showAbove = targetRect.bottom + 210 > window.innerHeight && targetRect.top > 230;
  const top = showAbove
    ? Math.max(12, targetRect.top - 198)
    : Math.min(window.innerHeight - 198, targetRect.bottom + 12);

  return (
    <div className="guided-tour" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
      <div className="guided-tour-blocker" aria-hidden="true" />
      <div
        className="guided-tour-highlight"
        style={{
          left: targetRect.left - 5,
          top: targetRect.top - 5,
          width: targetRect.width + 10,
          height: targetRect.height + 10,
        }}
      />
      <section className="guided-tour-card" style={{ left, top, width: tooltipWidth }}>
        <div className="guided-tour-progress" aria-label={language === 'ja' ? `${steps.length}件中${stepIndex + 1}件目` : `Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((item, index) => <span key={item.selector} className={index === stepIndex ? 'active' : ''} />)}
        </div>
        <h2 id="guided-tour-title">{t(step.title)}</h2>
        <p>{t(step.description)}</p>
        <div className="guided-tour-actions">
          <Button variant="ghost" size="sm" className="guided-tour-skip" onClick={onClose}>{t('スキップ')}</Button>
          <Button
            variant="primary"
            size="sm"
            className="guided-tour-next"
            onClick={() => {
              if (stepIndex === steps.length - 1) onClose();
              else {
                setTargetRect(null);
                setStepIndex((current) => current + 1);
              }
            }}
          >
            {stepIndex === steps.length - 1 ? t('完了') : t('次へ')}
          </Button>
        </div>
      </section>
    </div>
  );
}
