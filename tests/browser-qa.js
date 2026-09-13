// Optional in-game QA controls; loaded only with ?test. Normal players never load this file.
const qa=document.createElement('div');
qa.style.cssText='position:fixed;right:12px;top:82px;z-index:100;display:flex;gap:5px;padding:8px;background:#17251fed;border:1px solid #a4b891;font:10px Arial;color:white;max-width:90vw;flex-wrap:wrap';
document.body.appendChild(qa);
function button(label,action){const b=document.createElement('button');b.textContent=label;b.style.cssText='background:#436349;color:white;padding:7px;font:10px Arial';b.onclick=action;qa.appendChild(b);return b;}
const status=document.createElement('span');status.style.padding='7px';qa.appendChild(status);
button('QA: drive session',()=>{
  const d=window.RallyDebug;d.startRace();d.setPhase('testing');let steps=0;
  const run=()=>{d.step(180,true);steps+=180;status.textContent=`${d.sim.time.toFixed(1)}s / ${d.sim.cars[0].passedGates} gates`;if(d.sim.finished){d.finishRace();status.textContent='QA: finished';}else if(steps<120*650)setTimeout(run,0);else status.textContent='QA: timeout';};run();
});
button('QA: roof',()=>{const d=window.RallyDebug,c=d.sim.cars[0];d.sim.teleport(c,{roll:Math.PI,pitch:0,rollV:0,pitchV:0,vx:0,vz:0,vy:0,y:d.track.groundHeight(c.x,c.z)+1.1});});
button('QA: inspect jump',()=>{const d=window.RallyDebug,c=d.sim.cars[0],r=d.track.ramps[0],p=d.track.at(r.s-24,r.lane);d.sim.teleport(c,{x:p.x,y:d.track.groundHeight(p.x,p.z)+.7,z:p.z,s:r.s-24,lane:r.lane,heading:p.heading,vx:Math.sin(p.heading)*29,vz:Math.cos(p.heading)*29,vy:0});});

button('QA: report',()=>{const d=window.RallyDebug;status.textContent=d.sim.cars.length+' cars / '+(d.ghostReady?'ghost loaded':'no ghost')+' / '+d.phase+' / CANNON '+d.sim.physics.world.bodies.length+' bodies';});
