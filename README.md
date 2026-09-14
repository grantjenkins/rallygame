# Dustline — Alpine Rally

A browser dirt racing game built with **Three.js 0.185.1** for rendering and **cannon-es 0.20.0** for rigid-body physics. The playable application consists of `index.html`, `style.css`, and `script.js`, with no build step.

## Latest improvements — 14 September 2026

- The full-width finish stripe follows the road surface without changing the physical terrain.
- Both DUSTLINE sign poles meet the ground independently, without large bases or barrier overlap.
- Continuous barriers follow slopes, banks and curves, with matching Cannon collision geometry and closed joints.
- Player and AI cars have a modest top-speed increase. A level-straight test measured 147.0 → 153.5 km/h (+4.4%), with unchanged 0–80 km/h acceleration, brakes, drift and suspension settings. AI straight-line targets increased while corner and mogul limits remain unchanged.
- All 21 automated tests pass, including barrier impacts and faster jump approaches. A six-car, three-lap browser race completed with replay recording through the final finisher.

Physics records use `alpine-cannon-4`; earlier records remain stored separately. Detailed measurements and browser checks are in [the validation record](tests/VALIDATION.md).

## Run locally

```sh
npm install
npm start
```

Open **http://127.0.0.1:4173**. Node.js is only needed for the local server and tests. Internet access is required for the pinned Three.js and Cannon modules, optional Google Fonts, and supplied audio. Models, textures, and effects are generated locally.

## CodePen 2.0

1. Create `index.html`, `style.css`, and `script.js` in the project root and copy the matching repository files.
2. Preserve the HTML import map before `<script type="module" src="script.js"></script>`.
3. Use native JavaScript modules without Babel/CommonJS preprocessing. Do not load a second Three.js version or duplicate the script/stylesheet links.
4. Run the preview. Open the result independently if the editor iframe does not permit fullscreen.

The package, tools, and tests directories are not needed in CodePen. Do not use `?test` there; it loads a development-only QA file. Browser audio, fullscreen, and storage behavior depend on the embedding environment. The CodePen editor itself has not been used to publish a Pen from this repository.

The requested Three.js entries are preserved in the import map, with a pinned `cannon-es` entry added. No npm installation is needed in CodePen. `OrbitControls` and `BufferGeometryUtils` use the same pinned release. References: [Three.js documentation](https://threejs.org/docs/), [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).

## Features

- A 2.18 km, 28 metre wide dirt circuit with elevation changes, banked corners, straights, three jumps, three pits, and a mogul section.
- Six-car racing or solo time trial, with one or three laps. Basic, intermediate, and advanced AI use different speed, lookahead, grip and boost/drift strategies.
- Rally hatchbacks with fitted sloping glazing, bevelled bodywork and open wheel arches, roll cages, bucket seats, harnesses, mirrors, wipers, grille details, roof scoops, wings, rally wheels, clear number/sponsor panels, and selectable player paint.
- Cannon physics at 120 Hz: dynamic 1,150 kg compound chassis, four raycast suspension wheels, tire forces, engine/brake forces, drag, gravity, angular inertia, rollover, and solid barrier/terrain/car contacts. The driving loop never clamps cars to the track or manually rotates them to steer. Cars can push, spin and roll one another.
- Chase, driver, and orbit overview cameras that follow the player in live races and replays; a finish-line spectator camera; keyboard and simultaneous touch controls; pause, manual recovery, and fullscreen.
- Jump gems give four seconds of overdrive; orange pickups refill nitro, blue shields impacts for nine seconds, green repairs damage. Pickups respawn after twelve seconds.
- Achievements for flight, drifting, speed, gems, and a clean finish, persisted locally.
- Ordered checkpoint gates, lap splits, standings and results. A compact finish panel appears as soon as the player finishes while the remaining field keeps racing; the replay includes every finisher and displays the same panel after the player crosses the line. Personal bests are separated by mode and lap count.
- A translucent ghost of the fastest complete session for the selected mode/lap count.
- Last-session replay of every car with scrubbing, speed selection, and all camera modes. Replays and ghosts include full quaternions, wheel rotation and suspension travel. Replays are gzip-compressed for local storage when the browser supports CompressionStream; ghosts and bests are versioned for the new physics.
- Procedural dirt, grass, stone, bark, foliage, rubber and livery textures; forest, mountain ridges, lake, trackside signs, shadows, and dust.
- Optional engine/music from the supplied URLs, plus synthesized collision, landing, pickup, countdown and achievement effects. Click the audio button to enable sound.

Cannon owns the rigid-body simulation and contact solver. Vehicle settings are tuned for playable rally driving, not professional tire simulation. Longer-travel suspension and physically applied pitch/roll damping help the car land aligned with banked ground. Ramp faces are broad across their width with a distinct takeoff lip, and the lower, longer moguls reward controlled speed without beaching the chassis. Wheel contacts use Cannon's raycast vehicle model; the chassis is a compound solid collider. A sampled heightfield supports wheel, body and roof contacts, and the visible road uses the same height sampler. Distant mountains and water are scenery outside the enclosing barriers. The art is procedural rather than scanned photorealistic assets. A WebGL2-capable browser is required; mobile performance varies by device.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Accelerate | W / Up | GAS |
| Brake, then reverse | S / Down | BRAKE |
| Steer | A/D or Left/Right | Arrow buttons |
| Drift | Space | DRIFT |
| Nitro | Shift | BOOST |
| Recover upright | R | RECOVER |
| Change camera | C | Camera button |
| Orbit / zoom overview | Drag / wheel | Drag / pinch |
| Pause | Escape / P | Pause button |
| Audio | M | Audio button |

Recover retains progress along the course and does not award checkpoints. Inside a pit, it places the car on the clear lane beside that pit; in the moguls, it uses the smoother outside lane. Placement samples the whole chassis footprint to avoid embedding the car in a bump. Automatic recovery starts after approximately 2.3 seconds following inverted ground contact; small bounces do not restart the timer. Damage reduces acceleration; repair pickups restore performance. The timer excludes the countdown. The player’s official time freezes on crossing the line. Recording continues until every car finishes. Finished cars drive clear of the line before stopping. The live finish panel enables replay after the last rival finishes. Leaving the session early saves the recording available so far.

## Validation

```sh
npm run check
npm test
```

Tests execute the exact marked simulation core from `script.js`. They cover Cannon world construction, renderer/collider height agreement, acceleration/braking/reverse, ballistic gravity, off-centre collision momentum, barriers, roof/pit recovery, wheel grip and boost forces, checkpoint rules, snapshot continuation, equal grip for human slots, compressed replay round-trips, and physical AI laps at all difficulties, momentum for one second after all three jump landings, mogul recovery, and continued racing after the player finishes.

For browser validation, open `http://127.0.0.1:4173/?test`. **QA: drive session** accelerates a real simulation using the selected session settings, records every car and opens the actual results/replay controls. It does not teleport through checkpoints. Other buttons reproduce a roof landing and a jump approach or inspect the finish stripe, gantry poles and terrain-following barriers. Normal sessions do not load these controls. QA uses a separate storage namespace, so validation records do not replace player bests.

Run `node tools/speed-probe.cjs` for speed and braking measurements, or supply a saved earlier `script.js` path to compare a previous implementation. The level-straight fixture isolates vehicle performance from circuit grades and corners; the sustained-boost measurement refills nitro for testing only.

## Multiplayer next phase

Online play and Railway deployment are not enabled in this initial release. [MULTIPLAYER.md](MULTIPLAYER.md) documents the server/client boundary. The simulation supports a human-only input mode capped at six cars and serializable snapshots. No server credentials or cloud resources are needed for single-player.

## Asset sources

- Supplied engine: https://assets.codepen.io/5126815/engine.wav
- Supplied music: https://assets.codepen.io/5126815/music.mp3
- Third-party audio licensing has not been independently established; retain your source/license information for distribution.
- cannon-es: MIT, https://github.com/pmndrs/cannon-es (0.20.0 pinned in both browser imports and package-lock.json)
- Three.js: MIT, https://github.com/mrdoob/three.js
- Barlow / Barlow Condensed: SIL Open Font License via Google Fonts; system fonts provide a fallback.
- All game models and canvas textures are generated in the source.
