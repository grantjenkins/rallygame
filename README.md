# Dustline — Alpine Rally

A browser dirt racing game built with **Three.js 0.185.1**. The playable application consists of `index.html`, `style.css`, and `script.js`, with no build step.

## Run locally

```sh
npm start
```

Open **http://127.0.0.1:4173**. Node.js is only needed for the local server and tests. Internet access is required for the pinned Three.js modules, optional Google Fonts, and supplied audio. Models, textures, and effects are generated locally.

## CodePen 2.0

1. Create `index.html`, `style.css`, and `script.js` in the project root and copy the matching repository files.
2. Preserve the HTML import map before `<script type="module" src="script.js"></script>`.
3. Use native JavaScript modules without Babel/CommonJS preprocessing. Do not load a second Three.js version or duplicate the script/stylesheet links.
4. Run the preview. Open the result independently if the editor iframe does not permit fullscreen.

The package, tools, and tests directories are not needed in CodePen. Do not use `?test` there; it loads a development-only QA file. Browser audio, fullscreen, and storage behavior depend on the embedding environment. The CodePen editor itself has not been used to publish a Pen from this repository.

The exact requested import map is included. `OrbitControls` and `BufferGeometryUtils` use the same pinned release. References: [Three.js documentation](https://threejs.org/docs/), [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).

## Features

- A 2.18 km, 28 metre wide dirt circuit with elevation changes, banked corners, straights, three jumps, three pits, and a mogul section.
- Six-car racing or solo time trial, with one or three laps. Basic, intermediate, and advanced AI use different speed, lookahead, grip and boost/drift strategies.
- Rally hatchbacks with interiors, animated wheels, wings, lamps, liveries, and selectable player paint.
- Fixed 120 Hz simulation: acceleration, drag, braking/reverse, lateral friction, drifting, gravity, four ground contacts, pitch/roll, airborne movement, damage, roof recovery, bank forces, oriented car collisions, and barrier response. Cars can push each other.
- Chase, driver, and orbit overview cameras; keyboard and simultaneous touch controls; pause, manual recovery, and fullscreen.
- Jump gems give four seconds of overdrive; orange pickups refill nitro, blue shields impacts for nine seconds, green repairs damage. Pickups respawn after twelve seconds.
- Achievements for flight, drifting, speed, gems, and a clean finish, persisted locally.
- Ordered checkpoint gates, lap splits, standings and results. Personal bests are separated by mode and lap count.
- A translucent ghost of the fastest complete session for the selected mode/lap count.
- Last-session replay of every car with scrubbing, speed selection, and all camera modes. Replays and ghosts persist in the current browser when storage permits.
- Procedural dirt, grass, stone, bark, foliage, rubber and livery textures; forest, mountain ridges, lake, trackside signs, shadows, and dust.
- Optional engine/music from the supplied URLs, plus synthesized collision, landing, pickup, countdown and achievement effects. Click the audio button to enable sound.

This is a custom game-oriented vehicle physics model, not a professional vehicle dynamics simulator. It uses a heightfield and oriented boxes rather than a general-purpose rigid-body engine. Distant mountains and water are scenery outside the enclosing barriers. The art is procedural rather than scanned photorealistic assets. A WebGL2-capable browser is required; mobile performance varies by device.

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

Recover retains the current track location and does not award checkpoints. Cars recover automatically after approximately 2.3 seconds on the roof. Damage reduces acceleration; repair pickups restore performance. The timer excludes the countdown. Recording ends when the player finishes, so trailing rivals may remain unfinished in the replay.

## Validation

```sh
npm run check
npm test
```

Tests execute the exact marked simulation core from `script.js`. They cover terrain continuity, ground queries, acceleration/braking/gravity, car/barrier collisions, roof recovery, powerup cooldowns, jump gem reachability, checkpoint exploit prevention, three-lap counting, deterministic snapshot continuation, the human-only input mode, and actual AI lap completion at all difficulties.

For browser validation, open `http://127.0.0.1:4173/?test`. **QA: drive session** accelerates a real simulation using the selected session settings, records every car and opens the actual results/replay controls. It does not teleport through checkpoints. Other buttons reproduce a roof landing and a jump approach. Normal sessions do not load these controls. QA uses a separate storage namespace, so validation records do not replace player bests.

## Multiplayer next phase

Online play and Railway deployment are not enabled in this initial release. [MULTIPLAYER.md](MULTIPLAYER.md) documents the server/client boundary. The simulation supports a human-only input mode capped at six cars and serializable snapshots. No server credentials or cloud resources are needed for single-player.

## Asset sources

- Supplied engine: https://assets.codepen.io/5126815/engine.wav
- Supplied music: https://assets.codepen.io/5126815/music.mp3
- Third-party audio licensing has not been independently established; retain your source/license information for distribution.
- Three.js: MIT, https://github.com/mrdoob/three.js
- Barlow / Barlow Condensed: SIL Open Font License via Google Fonts; system fonts provide a fallback.
- All game models and canvas textures are generated in the source.
