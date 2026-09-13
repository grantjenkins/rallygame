const {DirtTrack,RallySimulation,DT}=require('../tests/load-core.cjs');
const track=new DirtTrack();track.buildCollider();
for(const [ri,r]of track.ramps.entries()){
 const sim=new RallySimulation(track,{mode:'trial'}),c=sim.cars[0],p=track.at(r.s-40,r.lane);
 sim.teleport(c,{x:p.x,y:track.groundHeight(p.x,p.z)+.8,z:p.z,heading:p.heading,vx:Math.sin(p.heading)*26,vz:Math.cos(p.heading)*26});
 let airborne=false,land=null,minSpeed=100;
 for(let i=0;i<7/DT;i++){sim.step({0:sim.ai(c)});const speed=Math.hypot(c.vx,c.vz);if(c.airTime>.15)airborne=true;if(airborne&&c.grounded&&!land)land={pitch:c.pitch,speed,air:c.maxAir};if(track.delta(c.s,r.s)>0)minSpeed=Math.min(minSpeed,speed);}
 console.log('JUMP',ri,{land,minSpeed,gems:c.gems,end:track.delta(c.s,r.s),damage:c.damage});
}
for(const lane of [-8,-4,0,4,8]){
 const sim=new RallySimulation(track,{mode:'trial'}),c=sim.cars[0],p=track.at(track.moguls[0]+28,lane);
 sim.teleport(c,{x:p.x,y:track.groundHeight(p.x,p.z)+.7,z:p.z,heading:p.heading});sim.recover(c,true);const start=c.s;
 for(let i=0;i<6/DT;i++)sim.step({0:sim.ai(c)});
 console.log('RECOVER',lane,{distance:track.delta(c.s,start),speed:Math.hypot(c.vx,c.vz),lane:c.lane});
}
