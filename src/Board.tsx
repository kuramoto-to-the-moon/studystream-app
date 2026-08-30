import type { CSSProperties } from 'react';
import type { AppState, MetricKind, SessionState, WidgetId } from './model';
import {
  defaultMetricKinds,
  formatClock,
  formatDuration,
  metricLabels,
  metricSeconds,
  phaseKey,
  remainingSeconds,
  streakDays,
  uiCopy,
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
  const visibleStreaks = settings.streaks.filter((item) => item.visible);
  const currentStreak = visibleStreaks.length > 0
    ? visibleStreaks[Math.floor(now / 6000) % visibleStreaks.length]
    : undefined;
  const boardStyle = {
    '--board-bg': hexToRgba(settings.background, settings.backgroundOpacity),
    '--board-text': hexToRgba(settings.textColor, settings.textOpacity ?? 1),
  } as CSSProperties;
  const visibleWidgets = [...settings.widgets]
    .filter((widget) => widget.visible)
    .sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id));
  const metricKinds = { ...defaultMetricKinds, ...settings.metricKinds };

  const metricContent = (kind: MetricKind) => kind === 'streaks' ? (
    <span className="board-metric board-streak">
      <span>{currentStreak?.name || metricLabels[language].streaks}</span>
      <strong>
        {currentStreak
          ? currentStreak.kind === 'count'
            ? `${Math.max(0, Math.floor(currentStreak.count ?? 0)).toLocaleString(language)}${currentStreak.unit || (language === 'ja' ? '回' : ' times')}`
            : streakDays(currentStreak.startedOn || '') < 0
              ? copy.beforeStart
              : `${streakDays(currentStreak.startedOn || '')}${language === 'ja' ? copy.days : ` ${copy.days}`}`
          : '—'}
      </strong>
    </span>
  ) : (
    <span className="board-metric">
      <span>{metricLabels[language][kind]}</span>
      <strong>{formatDuration(metricSeconds(session, kind, now), language)}</strong>
    </span>
  );

  const content: Record<WidgetId, React.ReactNode> = {
    state: <strong className="board-state">{copy[key]}</strong>,
    timer: (
      <span className="board-timer-wrap">
        <strong className={`board-timer${remaining >= 3600 ? ' is-long' : ''}`}>{formatClock(remaining)}</strong>
        <span>{copy.remaining}</span>
      </span>
    ),
    message: <span className="board-message" title={message}>{message}</span>,
    session: metricContent(metricKinds.session),
    today: metricContent(metricKinds.today),
    streaks: metricContent(metricKinds.streaks),
  };

  const renderWidget = (widget: (typeof visibleWidgets)[number]) => (
    <article
      key={widget.id}
      className={`board-widget widget-${widget.id}${selected === widget.id ? ' is-selected' : ''}`}
      data-widget={widget.id}
      tabIndex={editor ? 0 : undefined}
      onClick={() => editor && onSelect?.(widget.id)}
      onKeyDown={(event) => {
        if (editor && (event.key === 'Enter' || event.key === ' ')) onSelect?.(widget.id);
      }}
    >
      <span className="widget-content">{content[widget.id]}</span>
    </article>
  );

  const primaryWidgets = visibleWidgets.filter((widget) => widget.id === 'state' || widget.id === 'timer');
  const messageWidgets = visibleWidgets.filter((widget) => widget.id === 'message');
  const metricWidgets = visibleWidgets.filter((widget) => widget.id === 'session' || widget.id === 'today' || widget.id === 'streaks');

  return (
    <div
      className={`board board-${settings.layout}${editor ? ' board-editor' : ''}`}
      style={boardStyle}
      aria-label="視聴者向け表示"
    >
      {primaryWidgets.length > 0 && <div className="board-row board-primary-row">{primaryWidgets.map(renderWidget)}</div>}
      {messageWidgets.length > 0 && <div className="board-row board-message-row">{messageWidgets.map(renderWidget)}</div>}
      {metricWidgets.length > 0 && <div className="board-row board-metrics-row">{metricWidgets.map(renderWidget)}</div>}
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
