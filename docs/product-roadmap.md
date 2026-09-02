# Product roadmap

This roadmap keeps the core promise small: one action updates the study timer,
the viewer-facing board, and the study record. Items are ordered by user value,
not implementation novelty.

## 1. Simplify configuration

Goal: a first-time streamer can install the app, add it to OBS, and start a
study timer without understanding the full settings model.

- Keep the two-page structure: study timer and stream display.
- Make dark/horizontal/default metrics the usable starting point.
- Keep timer settings and infrequent adjustments collapsed.
- Put advanced appearance and custom items after the essential visibility and
  message controls.
- Add a short first-run path that ends with a working OBS preview.
- Do not add another permanent navigation page for this work.

Acceptance: five new users can reach a working OBS source without verbal help;
the median setup time is under three minutes.

## 2. Keep the interface understandable

Goal: frequent actions stay visible while setup and customization do not compete
for attention.

- Always show only the current state, timer, primary actions, key totals, and
  conversation detection status on the timer page.
- Keep timer duration, automatic switching, completion sound, and off-stream
  study entry collapsed until needed.
- Keep stream-display editing in three tasks: content, messages, and layout.
- Avoid duplicate page/tab headings and explanatory copy that repeats the
  control label.
- Add no new permanent page unless user testing proves the task cannot fit this
  hierarchy.

Acceptance: a user can identify the current state and next action immediately;
each setting has one predictable location.

## 3. Reliability and local data

Goal: a long-running stream remains correct without requiring maintenance from
the streamer.

- Keep timer transitions, settings persistence, and window-size restoration
  covered by focused tests.
- Preserve JSON backup/restore as the recovery path; do not add a history UI
  until real users demonstrate that need.
- Test long durations, long messages, both board orientations, and all optional
  rows before release.
- Keep speech analysis optional, local, and inactive while disabled.

Acceptance: restarting the app does not change configured durations or resume a
finished timer; the board never overflows at the documented OBS sizes.

## 4. Stream controls and integrations

Goal: reduce window switching during a broadcast.

1. Add configurable global shortcuts for study, break, pause/resume, and finish.
2. Document Stream Deck use through those shortcuts before building a dedicated
   plugin.
3. Add optional OBS WebSocket integration only for concrete workflows such as
   switching state with a scene or detecting stream start/end.
4. Consider Twitch chat/OAuth after the local workflow is stable and user tests
   show a repeated need.

Acceptance: the core timer can be controlled while another app is focused;
integrations remain optional and the local OBS browser-source flow still works
without an account.
