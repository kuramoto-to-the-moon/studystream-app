import type { CSSProperties } from 'react';
import type { AppState, SessionState, WidgetId } from './model';
import {
  formatClock,
  formatDuration,
  phaseKey,
  remainingSeconds,
  streakDays,
  uiCopy,
  widgetLabels,
  widgetOrder,
} from './model';

interface BoardProps {
  state: AppState;
  session: SessionState;
  now: number;
  editor?: boolean;
  selected?: WidgetId;
  onSelect?: (id: WidgetId) => void;
}

export function Board({
  state,
  session,
  now,
  editor = false,
  selected,
  onSelect,
}: BoardProps) {
  const { settings } = state;
  const language = settings.language;
  const copy = uiCopy[language];
  const key = phaseKey(session);
  const remaining = remainingSeconds(session, now);
  const message = settings.messages[key];
  const firstStreak = settings.streaks.find((item) => item.visible);
  const boardStyle = {
    '--board-bg': hexToRgba(settings.background, settings.backgroundOpacity),
    '--board-text': settings.textColor,
  } as CSSProperties;
  const visibleWidgets = [...settings.widgets]
    .filter((widget) => widget.visible)
    .sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id));

  const content: Record<WidgetId, React.ReactNode> = {
    state: <strong className="board-state">{copy[key]}</strong>,
    timer: (
      <span className="board-timer-wrap">
        <strong className="board-timer">{formatClock(remaining)}</strong>
        <span>{copy.remaining}</span>
      </span>
    ),
    message: <span className="board-message" title={message}>{message}</span>,
    session: (
      <span className="board-metric">
        <span>{copy.session}</span>
        <strong>{formatDuration(session.sessionSeconds, language)}</strong>
      </span>
    ),
    today: (
      <span className="board-metric">
        <span>{copy.today}</span>
        <strong>{formatDuration(session.todaySeconds, language)}</strong>
      </span>
    ),
    streaks: (
      <span className="board-metric board-streak">
        <span>{firstStreak?.name || widgetLabels[language].streaks}</span>
        <strong>
          {firstStreak
            ? streakDays(firstStreak.startedOn) < 0
              ? copy.beforeStart
              : `${streakDays(firstStreak.startedOn)}${language === 'ja' ? copy.days : ` ${copy.days}`}`
            : '—'}
        </strong>
      </span>
    ),
  };

  return (
    <div
      className={`board board-${settings.layout}${editor ? ' board-editor' : ''}`}
      style={boardStyle}
      aria-label="視聴者向け表示"
    >
      {visibleWidgets.map((widget) => (
        <article
          key={widget.id}
          className={`board-widget widget-${widget.id} size-${widget.size}${selected === widget.id ? ' is-selected' : ''}`}
          data-widget={widget.id}
          tabIndex={editor ? 0 : undefined}
          onClick={() => editor && onSelect?.(widget.id)}
          onKeyDown={(event) => {
            if (editor && (event.key === 'Enter' || event.key === ' ')) onSelect?.(widget.id);
          }}
        >
          <span className="widget-content">{content[widget.id]}</span>
        </article>
      ))}
    </div>
  );
}

function hexToRgba(hex: string, opacity: number) {
  const clean = hex.replace('#', '');
  const parsed = Number.parseInt(clean.length === 3 ? clean.split('').map((value) => value + value).join('') : clean, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, opacity))})`;
}
