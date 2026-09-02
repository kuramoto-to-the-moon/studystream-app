export function stateRevision(value) {
  return Number.isFinite(value?.updatedAt) ? value.updatedAt : 0;
}

export function hasSectionRevisions(value) {
  return Number.isFinite(value?.settingsUpdatedAt)
    && Number.isFinite(value?.sessionUpdatedAt);
}

export function sectionRevision(value, section) {
  const key = section === 'settings' ? 'settingsUpdatedAt' : 'sessionUpdatedAt';
  return Number.isFinite(value?.[key]) ? value[key] : stateRevision(value);
}

export function isStaleState(current, incoming) {
  const currentRevision = stateRevision(current);
  if (currentRevision > 0 && stateRevision(incoming) <= currentRevision) return true;
  // Once a current client has begun sending independent revisions, a legacy
  // tab must not write a newer timestamp around stale settings and replace
  // the user's latest colors, layout, or messages.
  return hasSectionRevisions(current) && !hasSectionRevisions(incoming);
}

export function mergeStateSections(current, incoming) {
  const currentSettingsRevision = sectionRevision(current, 'settings');
  const currentSessionRevision = sectionRevision(current, 'session');
  const incomingSettingsRevision = sectionRevision(incoming, 'settings');
  const incomingSessionRevision = sectionRevision(incoming, 'session');

  return {
    ...incoming,
    updatedAt: Math.max(stateRevision(current), stateRevision(incoming)),
    settingsUpdatedAt: Math.max(currentSettingsRevision, incomingSettingsRevision),
    sessionUpdatedAt: Math.max(currentSessionRevision, incomingSessionRevision),
    settings: incomingSettingsRevision > currentSettingsRevision
      ? incoming.settings
      : current.settings,
    session: incomingSessionRevision > currentSessionRevision
      ? incoming.session
      : current.session,
  };
}
