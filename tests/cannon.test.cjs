const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CANNON,DirtTrack,RallySimulation,DT}=require('./load-core.cjs');
const track=new DirtTrack();track.buildCollider();
function step(sim,n,input={}){for(let i=0;i<n;i++)sim.step({0:input});}
test('Cannon owns dynamic chassis, four suspension rays, a heightfield and solid barriers',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),p=s.physics;
  assert.ok(p.world instanceof CANNON.World);assert.ok(p.rigs[0].vehicle instanceof CANNON.RaycastVehicle);
  assert.equal(p.rigs[0].body.mass,1150);assert.equal(p.rigs[0].vehicle.wheelInfos.length,4);
  assert.ok(p.ground.shapes[0] instanceof CANNON.Heightfield);assert.ok(p.walls.length>20);
  assert.equal(p.world.gravity.y,-9.81);
});
test('rendered surface sampling agrees with the Cannon heightfield, including pits and jumps',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),grid=track.collider,hf=s.physics.ground.shapes[0];
  for(let x=-240;x<310;x+=37)for(let z=-280;z<250;z+=39)assert.ok(Math.abs(track.groundHeight(x,z)-hf.getHeightAt(x-grid.minX,grid.maxZ-z,true))<1e-8);
  for(const p of track.pits){const a=track.at(p.s,p.lane),b=track.at(p.s+10,p.lane);assert.ok(track.groundHeight(a.x,a.z)<track.groundHeight(b.x,b.z)-1.5);}
});
test('engine force accelerates, brakes stop, then a deliberate hold reverses',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];step(s,600,{throttle:1});const speed=Math.hypot(c.vx,c.vz);assert.ok(speed>15,`speed ${speed}`);
  step(s,240,{brake:1});assert.ok(Math.hypot(c.vx,c.vz)<speed*.6);step(s,240,{brake:1});
  assert.ok(c.vx*Math.sin(c.heading)+c.vz*Math.cos(c.heading)<0);
});
test('gravity produces a ballistic airborne trajectory without a manual floor clamp',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];s.teleport(c,{y:c.y+30,vx:0,vy:0,vz:0});const y=c.y;step(s,60);
  assert.equal(c.grounded,false);assert.ok(c.vy<-4.7&&c.vy>-5.1);assert.ok(c.y<y-1.1&&c.y>y-1.4);
});
test('airborne offset car impacts transfer momentum and produce angular motion',()=>{
  const s=new RallySimulation(track,{mode:'multiplayer',playerCount:2}),a=s.cars[0],b=s.cars[1];
  const p=track.at(70),fx=Math.sin(p.heading),fz=Math.cos(p.heading),rx=fz,rz=-fx;
  s.teleport(a,{x:p.x-rx*2,y:p.y+15,z:p.z-rz*2,heading:p.heading,pitch:0,roll:0,vx:rx*10,vy:0,vz:rz*10});
  s.teleport(b,{x:p.x+rx*.8+fx,y:p.y+15,z:p.z+rz*.8+fz,heading:p.heading,pitch:0,roll:0,vx:0,vy:0,vz:0});
  step(s,35);assert.ok(b.vx*rx+b.vz*rz>1);assert.ok(a.vx*rx+a.vz*rz<9);assert.ok(s.physics.rigs.some(r=>r.body.angularVelocity.length()>.1));
});
test('barrier collision is resolved by Cannon and reports an impact',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0],p=track.at(90,10),rx=Math.cos(p.heading),rz=-Math.sin(p.heading);
  s.teleport(c,{x:p.x,y:track.groundHeight(p.x,p.z)+.7,z:p.z,heading:p.heading,vx:rx*25,vy:0,vz:rz*25});step(s,100);
  assert.ok(c.hits>0);assert.ok(c.lane<15,`escaped barrier: ${c.lane}`);
});
test('roof contact triggers timed recovery without advancing checkpoints',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];s.teleport(c,{roll:Math.PI,pitch:0,y:track.groundHeight(c.x,c.z)+1.1,vx:0,vy:0,vz:0});
  let recovered=false;for(let i=0;i<480;i++){s.step();recovered ||= s.events.some(e=>e.type==='recover');}
  assert.ok(recovered);assert.ok(Math.abs(c.roll)<.5);assert.equal(c.passedGates,0);
});
test('boost increases wheel forces; handbrake reduces rear grip instead of directly rotating the car',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];step(s,2,{throttle:1});const normal=Math.abs(s.physics.rigs[0].vehicle.wheelInfos[0].engineForce);
  step(s,1,{throttle:1,boost:true,drift:true,steer:.5});const wheels=s.physics.rigs[0].vehicle.wheelInfos;
  assert.ok(Math.abs(wheels[0].engineForce)>normal);assert.ok(wheels[0].frictionSlip<wheels[1].frictionSlip);assert.ok(wheels[0].brake>0);assert.ok(c.boost<100);
});
test('pickup cooldown and ordered one/three lap gates remain game rules',()=>{
  const s=new RallySimulation(track,{mode:'trial',laps:3}),c=s.cars[0],p=s.pickups[0];Object.assign(c,{s:p.s,lane:p.lane,y:p.y-.6});s.collect(c);s.collect(c);assert.equal(c.gems,1);assert.equal(c.boostTime,4);
  for(const pos of [track.length-1,1,track.length-1,1]){const p=track.at(pos);s.teleport(c,{x:p.x,z:p.z,s:pos,lane:0});s.progress(c);}assert.equal(c.lap,0);
  for(let lap=0;lap<3;lap++){for(let gate=1;gate<=16;gate++)for(const offset of [-1,1]){const pos=gate%16*track.length/16+offset,p=track.at(pos);s.teleport(c,{x:p.x,z:p.z,s:pos,lane:0});s.time+=1;s.progress(c);}assert.equal(c.finished,lap===2);}
  assert.equal(c.passedGates,48);assert.equal(c.lapTimes.length,3);
});
test('snapshot restore preserves Cannon pose, momentum and suspension for continued simulation',()=>{
  const a=new RallySimulation(track,{mode:'trial'}),b=new RallySimulation(track,{mode:'trial'});step(a,300,{throttle:1,steer:.04});const snapshot=a.snapshot();b.restore(snapshot);
  step(a,120,{throttle:1});step(b,120,{throttle:1});
  const ca=a.cars[0],cb=b.cars[0];assert.ok(Math.hypot(ca.x-cb.x,ca.y-cb.y,ca.z-cb.z)<1e-5);assert.ok(Math.abs(ca.qw-cb.qw)<1e-6);assert.equal(ca.passedGates,cb.passedGates);
});
test('multiplayer mode accepts only joined humans and never inserts an AI input',()=>{
  const s=new RallySimulation(track,{mode:'multiplayer',playerCount:9});assert.equal(s.cars.length,6);step(s,10,{throttle:1});for(const c of s.cars.slice(1))assert.equal(c.input.throttle,0);
});

test('human multiplayer slots use identical grip regardless of slot number',()=>{
  const s=new RallySimulation(track,{mode:'multiplayer',playerCount:3,difficulty:'advanced'});step(s,1);
  const grip=s.physics.rigs[0].vehicle.wheelInfos[0].frictionSlip;
  for(const rig of s.physics.rigs)assert.equal(rig.vehicle.wheelInfos[0].frictionSlip,grip);
  for(const c of s.cars)assert.equal(c.isAI,false);
});
