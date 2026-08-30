import type { CSSProperties, DragEvent } from 'react';
import type { AppState, SessionState, WidgetId } from './model';
import {
  formatClock,
  formatDuration,
  phaseKey,
  remainingSeconds,
  streakDays,
  uiCopy,
  widgetLabels,
} from './model';

interface BoardProps {
  state: AppState;
  session: SessionState;
  now: number;
  editor?: boolean;
  selected?: WidgetId;
  onSelect?: (id: WidgetId) => void;
  onMove?: (id: WidgetId, direction: -1 | 1) => void;
  onDropWidget?: (source: WidgetId, target: WidgetId) => void;
}

function MoveTools({
  id,
  onMove,
}: {
  id: WidgetId;
  onMove?: (id: WidgetId, direction: -1 | 1) => void;
}) {
  return (
    <span className="widget-move-tools" aria-label="表示順を変更">
      <button type="button" aria-label="前へ移動" onClick={(event) => { event.stopPropagation(); onMove?.(id, -1); }}>
        ‹
      </button>
      <button type="button" aria-label="後ろへ移動" onClick={(event) => { event.stopPropagation(); onMove?.(id, 1); }}>
        ›
      </button>
    </span>
  );
}

export function Board({
  state,
  session,
  now,
  editor = false,
  selected,
  onSelect,
  onMove,
  onDropWidget,
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

  function startDrag(event: DragEvent<HTMLElement>, id: WidgetId) {
    event.dataTransfer.setData('text/studystream-widget', id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function drop(event: DragEvent<HTMLElement>, target: WidgetId) {
    event.preventDefault();
    const source = event.dataTransfer.getData('text/studystream-widget') as WidgetId;
    if (source && source !== target) onDropWidget?.(source, target);
  }

  return (
    <div
      className={`board board-${settings.layout}${editor ? ' board-editor' : ''}`}
      style={boardStyle}
      aria-label="視聴者向け表示"
    >
      {settings.widgets.filter((widget) => widget.visible).map((widget) => (
        <article
          key={widget.id}
          className={`board-widget widget-${widget.id} size-${widget.size}${selected === widget.id ? ' is-selected' : ''}`}
          data-widget={widget.id}
          draggable={editor}
          tabIndex={editor ? 0 : undefined}
          onClick={() => editor && onSelect?.(widget.id)}
          onKeyDown={(event) => {
            if (editor && (event.key === 'Enter' || event.key === ' ')) onSelect?.(widget.id);
          }}
          onDragStart={(event) => startDrag(event, widget.id)}
          onDragOver={(event) => editor && event.preventDefault()}
          onDrop={(event) => editor && drop(event, widget.id)}
        >
          <span className="widget-content">{content[widget.id]}</span>
          {editor && <MoveTools id={widget.id} onMove={onMove} />}
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
