// Compare the exact simulation against an optional saved pre-change script.
const fs=require('node:fs');
const CANNON=require('cannon-es');
const source=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'../script.js'),'utf8').split('// SIMULATION_CORE_BEGIN')[1].split('// SIMULATION_CORE_END')[0];
const {DirtTrack,RallySimulation,DT}=new Function('CANNON',source+';return {DirtTrack,RallySimulation,DT};')(CANNON);
const track=new DirtTrack();track.buildCollider();
function flatRun(boost){
  // A level, unlimited straight isolates terminal speed from the circuit's
  // corners and grades; vehicle mass, tires, suspension, forces stay intact.
  // Cannon's ray-heightfield traversal assumes a square grid for its bounds.
  const flat=Object.create(track),grid={minX:-2600,maxZ:5000,cell:20,data:Array.from({length:261},()=>Array(261).fill(0))};
  flat.nearest=(x,z)=>({s:z,lane:x,d:x*x});flat.height=()=>0;flat.groundHeight=()=>0;flat.buildCollider=()=>grid;
  flat.sample=s=>({s,x:0,z:s,heading:0,bank:0,curve:0});flat.at=(s,lane=0)=>({x:lane,y:0,z:s,heading:0});flat.barrierSections=()=>[];
  const sim=new RallySimulation(flat,{mode:'trial'}),c=sim.cars[0];
  for(const wall of sim.physics.walls)sim.physics.world.removeBody(wall);
  sim.pickups=[];sim.progress=()=>{};sim.teleport(c,{x:0,y:.8,z:0,s:0,lane:0,heading:0,pitch:0,roll:0,vx:0,vy:0,vz:0});
  let time80=null,speed5=null;
  for(let i=0;i<60/DT;i++){if(boost)c.boost=100;sim.step({0:{throttle:1,boost}});const speed=Math.hypot(c.vx,c.vz);if(time80===null&&speed>=80/3.6)time80=sim.time;if(i===599)speed5=speed*3.6;}
  const top=Math.hypot(c.vx,c.vz)*3.6,start=c.z,t=sim.time;
  while(sim.time-t<12&&Math.hypot(c.vx,c.vz)>.5)sim.step({0:{brake:1}});
  return {boost,topKmh:+top.toFixed(2),secondsTo80:time80===null?null:+time80.toFixed(3),speedAt5SecondsKmh:+speed5.toFixed(2),brakeSeconds:+(sim.time-t).toFixed(3),brakeMetres:+(c.z-start).toFixed(2),position:[c.x,c.y,c.z],hits:c.hits};
}
console.log('LEVEL STRAIGHT',JSON.stringify([flatRun(false),flatRun(true)]));
for(const difficulty of ['basic','intermediate','advanced']){
  const sim=new RallySimulation(track,{mode:'trial',difficulty}),c=sim.cars[0];let top=0,straightTop=0;
  for(let i=0;i<240/DT&&!sim.finished;i++){sim.step({0:sim.ai(c)});const speed=Math.hypot(c.vx,c.vz);top=Math.max(top,speed);if(c.s<150)straightTop=Math.max(straightTop,speed);}
  console.log('CIRCUIT',JSON.stringify({difficulty,finished:sim.finished,time:+sim.time.toFixed(3),topKmh:+(top*3.6).toFixed(2),pineStraightTopKmh:+(straightTop*3.6).toFixed(2),hits:c.hits,damage:c.damage}));
}
