const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../script.js'),'utf8').split('// SIMULATION_CORE_BEGIN')[1].split('// SIMULATION_CORE_END')[0];
const context=vm.createContext({});
vm.runInContext(source+'\nglobalThis.core={DirtTrack,RallySimulation,DT,DIFFICULTY};',context);
const {DirtTrack,RallySimulation,DT}=context.core;
const track=new DirtTrack();
test('long, wide circuit has matching height queries, continuous seam, pits and jumps',()=>{
  assert.ok(track.length>2000);assert.equal(track.width,28);
  for(let s=0;s<track.length;s+=71){const p=track.at(s,5),n=track.surface(p.x,p.z);assert.ok(Math.abs(n.y-p.y)<.15);}
  assert.ok(Math.abs(track.height(0,0)-track.height(track.length-.001,0))<.01);
  for(const p of track.pits)assert.ok(track.height(p.s,p.lane)<track.height(p.s+10,p.lane)-2);
  for(const p of track.ramps)assert.ok(track.height(p.s,p.lane)>track.height(p.s-18,p.lane)+2);
});
test('acceleration, braking, gravity, steering and drift use physical state',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];
  for(let i=0;i<360;i++)s.step({0:{throttle:1}});
  const speed=Math.hypot(c.vx,c.vz);assert.ok(speed>20);
  for(let i=0;i<90;i++)s.step({0:{brake:1}});
  assert.ok(Math.hypot(c.vx,c.vz)<speed-8);
  c.y+=12;c.vy=0;s.step();assert.ok(c.vy<0);assert.equal(c.grounded,false);
  assert.ok(Number.isFinite(c.pitch));
});
test('oriented car collisions separate overlap and transfer momentum',()=>{
  const s=new RallySimulation(track),a=s.cars[0],b=s.cars[1];
  Object.assign(a,{x:0,z:0,y:20,heading:0,vx:10,vz:0});Object.assign(b,{x:1.6,z:0,y:20,heading:0,vx:0,vz:0});s.collide(a,b);
  assert.ok(b.vx>0);assert.ok(a.vx<10);assert.ok(b.x-a.x>2.1);
  b.y=25;const vx=b.vx;s.collide(a,b);assert.equal(b.vx,vx);
});
test('barriers contain the car; roof recovery restores an upright car',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0],p=track.at(40,13.8);
  Object.assign(c,{x:p.x,z:p.z,y:p.y+.7,s:40,lane:13.8,vx:12,vz:0});s.step();assert.ok(Math.abs(c.lane)<=12.76);
  s.recover(c,true);c.roll=Math.PI;c.vx=c.vz=c.vy=0;c.y=track.height(c.s,c.lane)+1.04;
  for(let i=0;i<420;i++)s.step();assert.ok(Math.abs(c.roll)<.5,`roll ${c.roll}`);
});
test('powerups apply timed effects and cooldown prevents double collection',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0],p=s.pickups[0];Object.assign(c,{s:p.s,lane:p.lane,y:p.y-.6});s.collect(c);assert.equal(c.gems,1);assert.equal(c.boostTime,4);s.collect(c);assert.equal(c.gems,1);assert.ok(p.cooldown>0);
});
test('ordered checkpoints reject shortcut and reverse finish exploits',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];
  for(const pos of [track.length-1,1,track.length-1,1]){const p=track.at(pos);Object.assign(c,{x:p.x,z:p.z,s:pos,lane:0});s.progress(c);}assert.equal(c.lap,0);
  for(let gate=1;gate<=16;gate++){const gs=gate%16*track.length/16;for(const pos of [gs-1,gs+1]){const p=track.at(pos);Object.assign(c,{x:p.x,z:p.z,s:pos,lane:0});s.progress(c);}}
  assert.equal(c.lap,1);assert.equal(c.finished,true);
});
test('snapshots restore deterministic continuation',()=>{
  const a=new RallySimulation(track,{mode:'trial'}),b=new RallySimulation(track,{mode:'trial'});
  for(let i=0;i<100;i++)a.step({0:{throttle:1,steer:.2}});b.restore(a.snapshot());
  for(let i=0;i<100;i++){a.step({0:{throttle:1,drift:true,steer:.4}});b.step({0:{throttle:1,drift:true,steer:.4}});}
  assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));
});
test('multiplayer input mode creates at most six humans and never fills missing inputs with AI',()=>{
  const s=new RallySimulation(track,{mode:'multiplayer',playerCount:99});assert.equal(s.cars.length,6);
  for(let i=0;i<30;i++)s.step({0:{throttle:1}});
  for(const c of s.cars.slice(1)){assert.equal(c.input.throttle,0);assert.equal(c.input.steer,0);}
  assert.equal(new RallySimulation(track,{mode:'multiplayer',playerCount:2}).cars.length,2);
});
test('all three lap gates must be completed in a three-lap session',()=>{
  const s=new RallySimulation(track,{mode:'trial',laps:3}),c=s.cars[0];
  for(let lap=0;lap<3;lap++){
    for(let gate=1;gate<=16;gate++){const gs=gate%16*track.length/16;for(const pos of [gs-1,gs+1]){const p=track.at(pos);Object.assign(c,{x:p.x,z:p.z,s:pos,lane:0});s.time+=1;s.progress(c);}}
    assert.equal(c.lap,lap+1);assert.equal(c.finished,lap===2);
  }
  assert.equal(c.lapTimes.length,3);assert.equal(c.passedGates,48);
});
test('jump physics make the elevated speed gem reachable',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0],r=track.ramps[0],p=track.at(r.s-25,r.lane);
  Object.assign(c,{x:p.x,y:p.y+.68,z:p.z,s:r.s-25,lane:r.lane,heading:p.heading,vx:Math.sin(p.heading)*30,vz:Math.cos(p.heading)*30});
  let airborne=false;
  for(let i=0;i<300;i++){
    const target=track.at(c.s+20,r.lane),wanted=Math.atan2(target.x-c.x,target.z-c.z),err=Math.atan2(Math.sin(wanted-c.heading),Math.cos(wanted-c.heading));
    s.step({0:{throttle:.6,steer:Math.max(-1,Math.min(1,err*2))}});airborne ||= !c.grounded;
  }
  assert.ok(airborne);assert.ok(c.gems>0,`jump missed gem; max air ${c.maxAir}, lane ${c.lane}`);
});
test('all difficulty controllers complete a full lap without skipping checkpoints',()=>{
  const times={};
  for(const difficulty of ['basic','intermediate','advanced']){
    const s=new RallySimulation(track,{mode:'trial',difficulty}),c=s.cars[0];
    for(let i=0;i<120*240&&!s.finished;i++)s.step({0:s.ai(c)});
    assert.ok(s.finished,`${difficulty}: s=${c.s.toFixed(0)}, gates=${c.passedGates}, speed=${Math.hypot(c.vx,c.vz).toFixed(1)}, lane=${c.lane.toFixed(1)}`);assert.equal(c.passedGates,16);times[difficulty]=s.time;
  }
  console.log('AI lap times',times);assert.ok(times.advanced<times.basic);assert.ok(times.intermediate<times.basic);
});

test('finished cars brake to a stop without reversing back across the finish',()=>{
  const s=new RallySimulation(track,{mode:'trial'}),c=s.cars[0];
  c.finished=true;c.vx=Math.sin(c.heading)*10;c.vz=Math.cos(c.heading)*10;
  for(let i=0;i<360;i++)s.integrate(c,DT);
  assert.ok(c.vx*Math.sin(c.heading)+c.vz*Math.cos(c.heading)>=-0.01);
});
