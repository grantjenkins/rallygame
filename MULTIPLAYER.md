# Multiplayer implementation plan

The initial release is single-player. This is the next implementation boundary, not a deployed network service.

## Shared simulation

The `SIMULATION_CORE_BEGIN` / `SIMULATION_CORE_END` block in `script.js` contains `DirtTrack` and `RallySimulation`. It depends on pinned cannon-es 0.20.0, with no dependency on Three.js, the DOM, audio, storage, wall clocks or networking. Tests execute this same block.

Extract it to a shared ES module when adding the server, then bundle it into `script.js` for the three-file CodePen distribution. Do not maintain two copies of the physics.

```js
const simulation = new RallySimulation(track, {
  mode: 'multiplayer',
  playerCount: 6, // actual joined human count, clamped to 1–6
  laps: 3
});
simulation.step({
  0: { throttle: 1, brake: 0, steer: -0.3, drift: false, boost: true },
  1: { throttle: 0.7, brake: 0, steer: 0.2, drift: true, boost: false }
});
const snapshot = simulation.snapshot();
simulation.restore(snapshot);
```

Missing inputs in multiplayer mode are neutral and never invoke AI. Snapshots include Cannon position/quaternion, linear and angular velocities, wheel/suspension state, checkpoint progress, damage, pickups, timers and finish order. Restoration updates world-space inertia and reconstructs contact caches. All human slots use identical tire parameters; AI difficulty bonuses do not leak into multiplayer. The current restore method rebuilds the world for correctness; optimize that path before running frequent client reconciliation. Do not assume bit-identical floating-point results across different browsers or hardware: the server remains authoritative.

## Authoritative server

Use a Node.js WebSocket service with in-memory rooms. The server owns the roster, countdown, fixed simulation steps, pickups, checkpoints and official times. Clients submit controls rather than claimed positions or awards.

| Direction | Message | Payload |
| --- | --- | --- |
| Client → server | create / join | room code, nickname, protocol version, session options |
| Client → server | ready | ready boolean |
| Client → server | input | monotonic sequence, tick, throttle, brake, steer, drift, boost, recover |
| Server → client | welcome | slot, roster, track version, timestep |
| Server → client | countdown | authoritative start tick |
| Server → client | snapshot | tick, state, acknowledged input sequences |
| Server → client | event | pickup, recovery, lap, finish |

Validate finite input values, clamp controls, reject oversized messages and stale sequences, and rate-limit joins/inputs. Use unguessable room/reconnect tokens, an origin allowlist, heartbeat timeouts and server-side membership checks. Client prediction must never become authority.

Start with physics at 120 Hz and snapshots at 20 Hz. Predict the local player immediately; reconcile acknowledged inputs against snapshots and interpolate remote cars with an approximately 100 ms buffer. Measure CPU, latency and bandwidth before adjusting rates. Rendering runs independently of the server loop.

Reserve disconnected human slots for a short reconnect grace period, then retire the car without inserting AI. Late joiners should spectate after the countdown. Add room-level lobby, ready, countdown and result states. The simulation continues until every car has finished; the player result is independent of the remaining field. Add a room timeout and explicit retirement rules for disconnected humans so a room cannot wait forever.

## Railway deployment

Create a separate server package, bind to `0.0.0.0` and the provider's `PORT`, provide a health endpoint, and configure HTTPS/WSS. Keep the static client on CodePen or other static hosting and configure the WSS endpoint without exposing secrets.

One process with in-memory rooms is enough to start. Rooms disappear on restarts; define reconnect/retirement behavior before release. Horizontal scaling would require shared room routing or sticky sessions. A database is optional for saved records, not required for live racing.

Verify Railway's current allowance, trial limits, sleep behavior, WebSocket support and billing before provisioning. This project does not assume a continuously running service can be hosted free.

## Acceptance tests for network play

- One to six human clients; reject the seventh; never spawn AI.
- Separate rooms cannot exchange state or inputs.
- Lobby, countdown and results remain consistent through reconnects.
- Playable prediction with 100–200 ms RTT, jitter and packet loss.
- Shared crash and contested pickup outcomes agree across all clients.
- Duplicate, reordered or forged inputs cannot award checkpoints or pickups.
- Three-lap races continue after the first finisher and end by room policy.
- Verify provider resource consumption and restart behavior with six active racers.
