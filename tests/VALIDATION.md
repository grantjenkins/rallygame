# Validation record

## Focused terrain and speed update — 14 September 2026

Current physics record version: `alpine-cannon-4`. Prior-version records remain in storage but are not used as bests/ghosts/replays for the changed physics.

- Syntax check and all 21 automated tests pass. The added barrier suite probes every join and midpoint around both sides of the circuit, including the loop seam, and checks approximately 107 km/h glancing chassis impacts on flat, uphill, downhill, banked and curved sections.
- All three jumps pass at 26 and 27.3 m/s approach speeds: gem collection, landing pitch below 0.25 radians, and at least 14 m/s retained for a full second after landing, without chassis impacts. The test identifies flight at the ramp rather than an earlier road bounce.
- Final suite AI laps: Basic 123.025 s, Intermediate 114.717 s, Advanced 106.808 s; all gates passed and difficulty ordering preserved.
- `tools/speed-probe.cjs` compares the actual Cannon vehicle on a level test heightfield against a saved pre-change script. Unboosted terminal speed increased from 147.04 to 153.47 km/h (+4.4%); sustained-boost diagnostic speed rose from 173.14 to 180.62 km/h. The boost fixture continuously refills nitro to measure equilibrium, unlike ordinary gameplay.
- The same fixture measured identical 0–80 km/h times: 2.492 s without boost, 1.808 s with boost. Braking from the respective unboosted maximum to below 0.5 m/s changed from 2.058 s / 39.68 m to 2.125 s / 42.64 m; brake force is unchanged.
- The stripe is clipped from existing road triangles with a 2.5 cm lift, so the physical surface stays unchanged. Poles independently sample rendered terrain beneath their footprint. Barrier meshes and convex colliders share cross-sections, with a millimetre-scale collision skin at joins; lower faces extend into the ground.
- Browser inspection covered the stripe from front, rear, overhead and low oblique angles; both pole feet; and uphill, downhill, banked and tight curved barriers. No browser warnings/errors were reported during these inspections.
- The final six-car, three-lap browser race completed with the player second at 340.000 s and FIRST FLIGHT, GEM HUNTER and CLEAN FINISH. All six finished; the complete 363.167 s recording opened in replay. Rival simulation and recording continued for about 23 seconds after the player's finish.
- A direct comparison against the pre-change working script confirmed identical physical terrain heightfield data. The baseline script is saved locally as `test-results/terrain-speed-before.js` for speed-probe reproduction.

## Previous validation — 13 September 2026

The following is historical evidence for `alpine-cannon-3`, using Node.js and the Chromium-based Codex browser.

## Automated checks

- JavaScript syntax and Git whitespace checks passed.
- All 19 tests passed. The tests run the exact simulation core from `script.js` with pinned cannon-es 0.20.0.
- Physical controller lap times: Basic 123.508 s, Intermediate 115.083 s, Advanced 107.392 s. Each completed all 16 ordered gates.
- Coverage includes world/heightfield construction, rendering height agreement, engine/brake/reverse forces, ballistic gravity, off-centre car momentum and angular response, barriers, inverted recovery, boost/drift tire settings, ordered lap rules, and snapshot continuation.
- Human multiplayer slots have equal grip and missing controls do not trigger AI.
- A finished player no longer stops rival simulation; the player's time remains fixed.
- Recovery from five lanes in the mogul section drove at least 38 m in six seconds without becoming trapped again.
- All three ramp tests collected a gem, landed with less than 0.25 radians of pitch, and retained at least 14 m/s for the following full second without chassis impacts. Diagnostic runs showed roughly 17–23 m/s during that interval.
- Compressed replay round-trips preserve full quaternion and wheel/suspension frames; corrupt compressed data is rejected.

## Browser checks

- A final six-car, three-lap run finished the player at 346.283 s with three lap splits and FIRST FLIGHT, GEM HUNTER and CLEAN FINISH achievements. All six cars finished.
- Recording continued until the final rival at 366.317 s. Reloading restored this complete recording. At 95% of the replay, the player's 346.283 s result panel was visible while two rivals were still racing.
- Replay pause and seeking, fitted car glazing/arches/decals from front and rear, and the finish-line spectator camera were visually checked.
- Overview stayed centred on the player across widely separated replay positions (Quarry Bend and Mogul Field). The same target-translation code is used during live racing.
- Desktop and 390 × 844 mobile finish layouts were checked. Mobile results sit below the main track view; replay controls remain accessible. This is browser viewport testing, not testing on physical iPhone/Android hardware.
- Earlier single-player validation exercised one-/three-lap races and time trials, best ghosts, audio activation and touch-control layout. These controls remain present; the current automated suite replaces the original custom-physics tests.
- Browser error logs were empty during the checked Cannon sessions.

The three CodePen files are supplied and documented; a Pen has not been created or published in the live CodePen editor. Fullscreen depends on the browser and iframe permissions. Hosted multiplayer remains the next phase, not a deployed feature.

Reproduce with `npm test`, `npm run check`, and the opt-in `?test` browser controls. QA records use a separate local storage namespace. `tools/terrain-probe.cjs` prints landing and recovery diagnostics.
