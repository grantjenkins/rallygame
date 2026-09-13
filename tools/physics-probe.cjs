const {DirtTrack,RallySimulation,DT}=require('../tests/load-core.cjs');
const t=new DirtTrack();console.time('collider');t.buildCollider();console.timeEnd('collider');
const sim=new RallySimulation(t,{mode:'trial',difficulty:'intermediate'}),c=sim.cars[0];
const kind=process.argv[2]||'straight';
const seconds=Number(process.argv[3])||10;
for(let i=0;i<seconds/DT&&!sim.finished;i++){
  sim.step({0:kind==='ai'?sim.ai(c):{throttle:1}});
  if(i%120===0)console.log(JSON.stringify({time:+sim.time.toFixed(1),speed:+Math.hypot(c.vx,c.vz).toFixed(1),s:+c.s.toFixed(0),lane:+c.lane.toFixed(1),height:+(c.y-t.groundHeight(c.x,c.z)).toFixed(2),pitch:+c.pitch.toFixed(2),roll:+c.roll.toFixed(2),ground:c.grounded,gates:c.passedGates,damage:c.damage,steer:+c.steer.toFixed(2)}));
}
console.log('FINAL',sim.finished,sim.time,c.passedGates,c.gems,c.maxAir);
