# Project context

Maintain this concise decision record as work proceeds: update requirements, architectural decisions, rejected approaches, unresolved problems and next steps. Replace stale entries rather than accumulating a session log; omit code and repository-obvious details.

## Requirements and decisions
- Continue the existing rally game incrementally; preserve local changes and checkpoint tested milestones. Avoid speculative rewrites.
- Preserve the no-build, three-file CodePen distribution alongside desktop/mobile play, touch controls and responsive fullscreen layouts.
- Single-player comes first: solo time trials or a player plus five AI, one or three laps, with progressively stronger AI difficulty levels. Do not implement multiplayer until requested.
- Future online play must support up to six humans without AI. Keep simulation independent of rendering/browser services; share one simulation implementation with an eventual authoritative server. Railway is a possible host, not a commitment.
- Retain Cannon vehicle physics; reverting to custom motion requires an exceptional reason. Rendering and collision terrain must share height data. Snapshot restoration must preserve full physical state, momentum and world-space inertia for replay/reconciliation.
- The player's finish freezes their official time, not the simulation: rivals continue, results leave the track visible, and replay records through the last finisher. Overview follows the player in both live play and replay.
- Preserve improved banks, broad ramps, landing momentum, traversable moguls and safe recovery placement; test physical effects before changing them. Preserve the rebuilt car model and inspect front, rear, side and overhead when modifying it.
- Aim for realistic dirt scenery and physical racing contact; current procedural art and temporary audio can be improved later.
- Current review scope: conform the finish stripe to the existing road, ground gantry poles independently without bases/barrier overlap, and share continuous terrain-following barrier geometry with Cannon. Do not reshape the physical terrain or redesign unrelated features.
- Raise top speed modestly through existing engine-force falloff, preserving low-speed torque, drag, braking, drift and suspension. Raise AI straight-line targets correspondingly while retaining corner/mogul limits. Version records for the changed physics so old best times do not compete with the faster cars.

## Open issues and next steps
- Snapshot restoration currently rebuilds the physics world; optimize before frequent network reconciliation. Cross-device deterministic physics is not guaranteed.
- Physical mobile-device testing and live CodePen publishing remain unverified; prior browser checks are recorded in `tests/VALIDATION.md`.
- User authorized committing and pushing all latest changes to GitHub `main`, including the earlier uncommitted refinements and updated README. Keep future Git status in Git rather than in this decision record.
- Handoff fixes for race finish, following cameras, jumps, moguls, car model and quaternion/suspension replays are present on inspection. Prior browser evidence is not a fresh visual validation.
- Focused fixes on 2026-09-14 pass syntax and all 21 tests, including continuous barrier contacts and 5% faster jump approaches. Level-straight top speed rises about 4.4% with unchanged 0–80 time. Measurements and visual evidence belong in `tests/VALIDATION.md`; rerun relevant checks after significant changes.
- All six cars finished the three-lap browser validation; the complete replay includes the remaining field after the player's clean finish. Local source checkpoint: `test-results/terrain-speed-checkpoint.zip` (not a Git commit/push).
- Next: user review of the focused fixes and modest speed increase; no further gameplay changes selected.
