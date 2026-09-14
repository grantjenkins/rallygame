const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CANNON,DirtTrack,RallySimulation,DT}=require('./load-core.cjs');
const track=new DirtTrack();track.buildCollider();

test('barrier collision surfaces close every seam and stay grounded around the entire circuit',()=>{
  const sim=new RallySimulation(track,{mode:'trial'}),sections=track.barrierSections(),result=new CANNON.RaycastResult();
  for(const section of sections)for(const offset of [0,.5,1]){
    const s=section.s+offset*track.length/(sections.length/2),a=track.at(s,section.side*13.6),b=track.at(s,section.side*15.4);
    const from=new CANNON.Vec3(a.x,track.groundHeight(a.x,a.z)+.45,a.z),to=new CANNON.Vec3(b.x,track.groundHeight(b.x,b.z)+.45,b.z);
    result.reset();const ray=new CANNON.Ray(from,to);ray.mode=CANNON.Ray.CLOSEST;ray.intersectBodies(sim.physics.walls,result);
    assert.equal(result.body?.kind,'barrier',`gap at ${s.toFixed(2)} m, side ${section.side}`);
    assert.ok(Math.abs(track.nearest(result.hitPointWorld.x,result.hitPointWorld.z).lane)<15.05);
  }
});

test('high-speed chassis impacts contact barriers on flats, slopes, banks and curves',()=>{
  const scores=[p=>-Math.abs(p.bank),p=>track.height(p.s+3,14)-track.height(p.s-3,14),p=>track.height(p.s-3,14)-track.height(p.s+3,14),p=>Math.abs(p.bank),p=>Math.abs(p.curve)];
  for(const score of scores)for(const side of [-1,1]){
    const point=track.points.reduce((a,b)=>score(a)>score(b)?a:b),sim=new RallySimulation(track,{mode:'trial'}),c=sim.cars[0],lane=side*13,p=track.at(point.s,lane);
    const height=(s,l)=>{const q=track.at(s,l);return track.groundHeight(q.x,q.z);},grade=(height(point.s+1,lane)-height(point.s-1,lane))/2,crossGrade=(height(point.s,lane+.5)-height(point.s,lane-.5));
    sim.teleport(c,{x:p.x,y:track.groundHeight(p.x,p.z)+.8,z:p.z,s:point.s,lane,heading:p.heading,pitch:-Math.atan(grade),roll:Math.atan(crossGrade),vx:Math.cos(p.heading)*side*10+Math.sin(p.heading)*28,vz:-Math.sin(p.heading)*side*10+Math.cos(p.heading)*28,vy:grade*28+crossGrade*side*10});
    let contacted=false;
    for(let i=0;i<.8/DT;i++){sim.step();contacted ||= sim.physics.world.contacts.some(contact=>(contact.bi.kind==='barrier'&&contact.bj.carId===0)||(contact.bj.kind==='barrier'&&contact.bi.carId===0));}
    assert.ok(contacted,`no barrier contact at ${point.s}, side ${side}`);
    assert.ok(Math.abs(c.lane)<16,`escaped at ${point.s}, side ${side}: ${c.lane}`);
  }
});
