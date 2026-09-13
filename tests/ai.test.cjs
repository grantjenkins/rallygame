const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DirtTrack,RallySimulation,DT}=require('./load-core.cjs');
test('all three AI difficulties finish a physical lap through all ordered gates',()=>{
  const track=new DirtTrack(),times={};
  for(const difficulty of ['basic','intermediate','advanced']){
    const sim=new RallySimulation(track,{mode:'trial',difficulty}),c=sim.cars[0];c.isAI=true;
    for(let i=0;i<260/DT&&!sim.finished;i++)sim.step({0:sim.ai(c)});
    assert.ok(sim.finished,`${difficulty} stalled at ${c.s}, ${c.passedGates} gates`);assert.equal(c.passedGates,16);times[difficulty]=sim.time;
  }
  console.log('Cannon AI lap times',times);assert.ok(times.advanced<times.intermediate);assert.ok(times.intermediate<times.basic);
});
