# Cannon integration checkpoint

The original single-player build is preserved at Git commit `ab55e53`.

Work is saved incrementally in the workspace. Planned stages:

1. Pin cannon-es 0.20.0 for the browser and Node tests.
2. Replace custom integration/contact response with a Cannon world, terrain collider, static barriers, and dynamic vehicle chassis with four suspension rays.
3. Retune inputs, AI, jumps and recovery; preserve records/replays with a new physics version.
4. Update snapshot restoration for authoritative multiplayer use; verify complete races and browser rendering.

Three.js remains the renderer. Cannon owns rigid-body position, velocity, orientation, contact resolution, and suspension impulses. Race rules, pickups, input routing, and achievements remain game logic.
