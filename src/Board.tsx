import type { CSSProperties } from 'react';
import type { AppState, MetricKind, MetricWidgetId, SessionState, WidgetId } from './model';
import {
  DEFAULT_SECONDARY_TEXT_OPACITY,
  formatClock,
  metricKindIds,
  metricLabels,
  metricSlotIds,
  metricSeconds,
  phaseKey,
  phaseLabel,
  remainingSeconds,
  resolveMetricKinds,
  streakDays,
  uiCopy,
  widgetOrder,
} from './model';

interface BoardProps {
  state: AppState;
  session: SessionState;
  now: number;
}

export function Board({
  state,
  session,
  now,
}: BoardProps) {
  const { settings } = state;
  const language = settings.language;
  const copy = uiCopy[language];
  const key = phaseKey(session);
  const remaining = remainingSeconds(session, now);
  const message = settings.messages[key];
  const note = settings.note?.trim() ?? '';
  const offstreamTodaySeconds = session.offstreamTodaySeconds ?? 0;
  const visibleStreaks = settings.streaks.filter((item) => item.visible);
  const currentStreak = visibleStreaks.length > 0
    ? visibleStreaks[Math.floor(now / 4500) % visibleStreaks.length]
    : undefined;
  const currentStreakDays = currentStreak && currentStreak.kind !== 'count'
    ? streakDays(currentStreak.startedOn || '', currentStreak.dayMode, currentStreak.includedWeekdays)
    : 0;
  const boardStyle = {
    '--board-bg': hexToRgba(settings.background, settings.backgroundOpacity),
    '--board-text': hexToRgba(settings.textColor, settings.textOpacity ?? 1),
    '--board-subtext': hexToRgba(
      settings.secondaryTextColor ?? settings.textColor,
      settings.secondaryTextOpacity ?? DEFAULT_SECONDARY_TEXT_OPACITY,
    ),
  } as CSSProperties;
  const visibleWidgets = [...settings.widgets]
    .filter((widget) => widget.visible
      && (widget.id !== 'note' || note.length > 0)
      && (widget.id !== 'offstream' || (settings.offstreamEnabled && offstreamTodaySeconds > 0)))
    .sort((left, right) => widgetOrder.indexOf(left.id) - widgetOrder.indexOf(right.id));
  const metricKinds = resolveMetricKinds(settings.metricKinds);
  const clock = formatClock(remaining);
  const clockSecondsStart = clock.lastIndexOf(':');
  const clockMain = clock.slice(0, clockSecondsStart);
  const clockSeconds = clock.slice(clockSecondsStart);

  const durationContent = (seconds: number) => {
    const hours = Math.floor(Math.max(0, seconds) / 3600);
    const minutes = Math.floor((Math.max(0, seconds) % 3600) / 60);
    const secondsPart = Math.max(0, Math.floor(seconds)) % 60;
    const lengthClass = hours >= 10_000 ? ' is-very-long' : hours >= 100 ? ' is-long' : '';
    const main = `${hours.toLocaleString('en-US')}:${String(minutes).padStart(2, '0')}`;
    if (!settings.showMetricSeconds) return <strong className={lengthClass.trim()}>{main}</strong>;
    return (
      <span className={`board-metric-time${lengthClass}`}>
        <strong>{main}</strong>
        <small>{`:${String(secondsPart).padStart(2, '0')}`}</small>
      </span>
    );
  };

  const metricContent = (kind: MetricKind) => kind === 'streaks' ? (
    <span className="board-metric board-streak">
      <span>{currentStreak?.name || metricLabels[language].streaks}</span>
      <strong>
        {currentStreak
          ? currentStreak.kind === 'count'
            ? `${Math.max(0, Math.floor(currentStreak.count ?? 0)).toLocaleString(language)}${currentStreak.unit || (language === 'ja' ? '回' : ' times')}`
            : currentStreakDays < 0
              ? copy.beforeStart
              : `${currentStreakDays}${language === 'ja' ? copy.days : ` ${copy.days}`}`
          : '—'}
      </strong>
    </span>
  ) : (
    <span className={`board-metric${settings.showMetricSeconds ? ' with-seconds' : ''}`}>
      <span>{kind === 'session' ? (language === 'ja' ? '現在の記録' : 'Current record') : metricLabels[language][kind]}</span>
      {durationContent(metricSeconds(session, kind, now))}
    </span>
  );

  const content: Record<WidgetId, React.ReactNode> = {
    state: (
      <strong className="board-state">
        <span>{phaseLabel(session, language)}</span>
      </strong>
    ),
    timer: (
      <span className="board-timer-wrap">
        <strong className={`board-timer${remaining >= 3600 ? ' is-long' : ''}`}>
          <span>{clockMain}</span><span>{clockSeconds}</span>
        </strong>
        <span>{copy.remaining}</span>
      </span>
    ),
    message: <span className="board-message" title={message}>{message}</span>,
    offstream: (
      <span className="board-offstream">
        <span>{language === 'ja' ? '配信外' : 'Off-stream'}</span>
        {durationContent(offstreamTodaySeconds)}
      </span>
    ),
    note: <span className="board-note" title={note}>{note}</span>,
    session: metricContent(metricKinds.session),
    today: metricContent(metricKinds.today),
    streaks: metricContent(metricKinds.streaks),
    metric4: metricContent(metricKinds.metric4),
    metric5: metricContent(metricKinds.metric5),
    metric6: metricContent(metricKinds.metric6),
    metric7: metricContent(metricKinds.metric7),
  };

  const renderWidget = (widget: (typeof visibleWidgets)[number]) => (
    <article
      key={widget.id}
      className={`board-widget widget-${widget.id}`}
      data-widget={widget.id}
    >
      <span className="widget-content">{content[widget.id]}</span>
    </article>
  );

  const mainWidgets = visibleWidgets.filter((widget) => widget.id === 'state' || widget.id === 'timer' || widget.id === 'message');
  const metricSlotWidgets = visibleWidgets
    .filter((widget) => metricSlotIds.includes(widget.id as MetricWidgetId))
    .sort((left, right) => (
      metricKindIds.indexOf(metricKinds[left.id as MetricWidgetId])
      - metricKindIds.indexOf(metricKinds[right.id as MetricWidgetId])
    ));
  const metricWidgets = metricSlotWidgets.filter((widget) => metricKinds[widget.id as MetricWidgetId] !== 'streaks');
  const extraWidgets = metricSlotWidgets.filter((widget) => metricKinds[widget.id as MetricWidgetId] === 'streaks');
  const supplementWidgets = [
    ...visibleWidgets.filter((widget) => widget.id === 'offstream'),
    ...extraWidgets,
  ];
  const noteWidgets = visibleWidgets.filter((widget) => widget.id === 'note');
  const auxiliaryRowCount = (supplementWidgets.length > 0 ? 1 : 0) + (noteWidgets.length > 0 ? 1 : 0);

  return (
    <div
      className={`board board-${settings.layout} board-lang-${language}${settings.backgroundOpacity > 0 && settings.backgroundOpacity < 1 ? ' board-translucent' : ''}${!mainWidgets.some((widget) => widget.id === 'state') ? ' board-no-state' : ''}${!mainWidgets.some((widget) => widget.id === 'timer') ? ' board-no-timer' : ''}${!mainWidgets.some((widget) => widget.id === 'message') ? ' board-no-message' : ''}${auxiliaryRowCount > 0 ? ` board-has-auxiliary-row board-auxiliary-rows-${auxiliaryRowCount}` : ''}`}
      style={boardStyle}
      aria-label="視聴者向け表示"
    >
      {mainWidgets.length > 0 && <div className="board-row board-main-row">{mainWidgets.map(renderWidget)}</div>}
      {metricWidgets.length > 0 && <div className="board-row board-metrics-row">{metricWidgets.map(renderWidget)}</div>}
      {auxiliaryRowCount > 0 && (
        <div className="board-auxiliary-rows">
          {supplementWidgets.length > 0 && (
            <div className="board-row board-note-row board-supplement-row">
              {supplementWidgets.map(renderWidget)}
            </div>
          )}
          {noteWidgets.map((widget) => (
            <div key={`row-${widget.id}`} className={`board-row board-note-row board-note-row-${widget.id}`}>
              {renderWidget(widget)}
            </div>
          ))}
        </div>
      )}
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
