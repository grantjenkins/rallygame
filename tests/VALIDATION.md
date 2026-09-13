# Validation record

Validated on 13 September 2026 using Node.js and the Chromium-based Codex browser.

- JavaScript syntax check and whitespace validation passed.
- All 12 simulation tests passed. Controller-only lap times: Basic 99.05 s, Intermediate 90.64 s, Advanced 86.06 s.
- Browser: six-car one-lap session completed in 91.358 s; results opened and replay played all six cars.
- Browser: six-car three-lap session completed in 272.291 s, with 48 ordered checkpoint gates and three lap splits.
- Browser: solo three-lap time trial completed in 268.466 s. Starting another trial loaded the saved personal-best ghost and reported exactly one live car.
- Replay pause, timeline seeking, chase/cockpit camera switching and persistent last-session data were exercised.
- Audio activation displayed ON from a user gesture and was switched off after checking.
- Race setup, HUD, results and touch button layout were visually checked at a 390 × 844 viewport, along with the desktop layout. This is browser viewport testing, not a physical iPhone/Android device test.
- Geometry merge and deprecated shadow API errors found during development were corrected; subsequent page loads produced no new instances.

The CodePen files are supplied and documented; a Pen has not been created/published in the live CodePen editor. Fullscreen behavior depends on the host browser and iframe permissions. Network multiplayer and Railway deployment belong to the next phase.

Reproduce with `npm test` and the opt-in `?test` browser controls. QA records use a separate local storage namespace.
