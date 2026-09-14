# Cannon physics migration

Completed on 13 September 2026. The original single-player build remains at `ab55e53`; migration checkpoints are `551a029` and `18ee305`.

- Pinned cannon-es 0.20.0 in the browser import map and Node dependency lockfile. Three.js 0.185.1 remains the renderer.
- Replaced custom motion/contact resolution with a 120 Hz Cannon world, a heightfield shared with the visible road, compound solid barriers, and six dynamic compound chassis with four raycast suspension wheels each.
- Retuned acceleration, braking, tire grip, handbrake, AI, banks, jumps and moguls for physical suspension. Recovery handles inverted contact and places pit-trapped cars on an adjacent clear lane without advancing checkpoints.
- Recorded full quaternions and suspension/wheel state for ghosts and replays. Added compressed replay persistence and versioned records to keep earlier physics times separate.
- Restored snapshots into Cannon bodies, including inertia, momentum and wheel state. Human-only slots never receive AI input or AI grip bonuses.
- Added live post-finish racing and full-field replays, a following overview camera and finish-line spectator camera; rebuilt fitted rally bodywork and extended suspension/air-control tests after user feedback.
- Passed all 19 automated tests and browser session/replay checks. See `tests/VALIDATION.md` for evidence and remaining deployment boundaries.

Cannon owns rigid-body position, velocity, orientation, contact resolution and suspension impulses. Race rules, pickups, input routing and achievements remain game logic. Network transport, prediction/reconciliation and hosted multiplayer remain the next phase described in `MULTIPLAYER.md`.
