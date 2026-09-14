// Optional in-game QA controls; loaded only with ?test. Normal players never load this file.
const qa=document.createElement('div');
qa.style.cssText='position:fixed;right:12px;top:82px;z-index:100;display:flex;gap:5px;padding:8px;background:#17251fed;border:1px solid #a4b891;font:10px Arial;color:white;max-width:90vw;flex-wrap:wrap';
document.body.appendChild(qa);
function button(label,action){const b=document.createElement('button');b.textContent=label;b.style.cssText='background:#436349;color:white;padding:7px;font:10px Arial';b.onclick=action;qa.appendChild(b);return b;}
const status=document.createElement('span');status.style.padding='7px';qa.appendChild(status);
button('QA: drive session',()=>{
  const d=window.RallyDebug;d.startRace();d.setPhase('testing');let steps=0,playerReported=false;
  const run=()=>{d.step(60,true);steps+=60;if(d.sim.cars[0].finished&&!playerReported){d.finishRace();d.setPhase('testing');playerReported=true;}status.textContent=`${d.sim.time.toFixed(1)}s / ${d.sim.cars[0].passedGates} gates`;if(d.sim.finished){d.finishRace();status.textContent='QA: finished';}else if(steps<120*650)setTimeout(run,0);else status.textContent='QA: timeout';};run();
});
button('QA: roof',()=>{const d=window.RallyDebug,c=d.sim.cars[0];d.sim.teleport(c,{roll:Math.PI,pitch:0,rollV:0,pitchV:0,vx:0,vz:0,vy:0,y:d.track.groundHeight(c.x,c.z)+1.1});});
button('QA: inspect jump',()=>{const d=window.RallyDebug,c=d.sim.cars[0],r=d.track.ramps[0],p=d.track.at(r.s-24,r.lane);d.sim.teleport(c,{x:p.x,y:d.track.groundHeight(p.x,p.z)+.7,z:p.z,s:r.s-24,lane:r.lane,heading:p.heading,vx:Math.sin(p.heading)*29,vz:Math.cos(p.heading)*29,vy:0});});

button('QA: report',()=>{const d=window.RallyDebug;status.textContent=d.sim.cars.length+' cars / '+(d.ghostReady?'ghost loaded':'no ghost')+' / '+d.phase+' / CANNON '+d.sim.physics.world.bodies.length+' bodies / recording '+(d.lastReplay?.duration?.toFixed(3)||'none')+'s';});

button('QA: car front',()=>window.RallyDebug.inspectCar(1));
button('QA: car rear',()=>window.RallyDebug.inspectCar(-1));
button('QA: finish player',()=>{const d=window.RallyDebug,c=d.sim.cars[0];c.finished=true;c.finishTime=d.sim.time;c.lap=d.settings.laps;c.progress=c.lap*d.track.length;d.sim.finishOrder.push(0);d.finishRace();});

button('QA: ramp view',()=>window.RallyDebug.inspectRamp());
button('QA: stripe front',()=>window.RallyDebug.inspectTerrain(0,1,-24,7));
button('QA: stripe rear',()=>window.RallyDebug.inspectTerrain(0,-1,24,5));
button('QA: stripe above',()=>window.RallyDebug.inspectTerrain(0,1,-1,36,1));
button('QA: left pole',()=>window.RallyDebug.inspectTerrain(0,-1,-5,2,22));
button('QA: right pole',()=>window.RallyDebug.inspectTerrain(0,1,5,2,22));
for(const [label,score]of [
  ['flat',p=>-Math.abs(p.bank)-Math.abs(window.RallyDebug.track.centerHeight(p.s+3)-window.RallyDebug.track.centerHeight(p.s-3))],
  ['uphill',p=>window.RallyDebug.track.height(p.s+3,14)-window.RallyDebug.track.height(p.s-3,14)],
  ['downhill',p=>window.RallyDebug.track.height(p.s-3,14)-window.RallyDebug.track.height(p.s+3,14)],
  ['bank',p=>Math.abs(p.bank)],['curve',p=>Math.abs(p.curve)]
])button('QA: barrier '+label,()=>{const d=window.RallyDebug,p=d.track.points.reduce((a,b)=>score(a)>score(b)?a:b);d.inspectTerrain(p.s,1,-18,5,5);status.textContent=label+' at '+p.s.toFixed(1)+' m';});
