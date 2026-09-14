import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as CANNON from "cannon-es";

// SIMULATION_CORE_BEGIN
// No DOM, renderer, audio, or wall clock in this section. A future authoritative
// server can run this exact fixed-step simulation and exchange inputs/snapshots.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (v, n) => ((v % n) + n) % n;
const angle = a => wrap(a + Math.PI, TAU) - Math.PI;
const DT = 1 / 120;
const TRACK_VERSION = 'alpine-cannon-4';
const CAR_COLORS = ['#fa6837', '#8ec7bc', '#e9dfc8', '#70a9e8', '#d5b55e', '#b998d2'];
const DRIVERS = ['YOU', 'S. MOREAU', 'K. TANAKA', 'A. COSTA', 'J. REED', 'M. NOVAK'];
function randomGenerator(seed = 78219) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
class DirtTrack {
  constructor() {
    this.width = 28;
    const controls = [[-230,-210],[-230,-65],[-212,98],[-155,223],[-45,242],[10,183],[-33,125],[18,65],[111,93],[186,222],[284,195],[309,89],[267,-12],[305,-117],[258,-241],[136,-277],[48,-228],[-30,-270],[-145,-270]];
    const raw = [];
    for (let i = 0; i < controls.length; i++) for (let j = 0; j < 100; j++) {
      const t=j/100, p0=controls[wrap(i-1,controls.length)],p1=controls[i],p2=controls[(i+1)%controls.length],p3=controls[(i+2)%controls.length];
      const axis=k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t);
      raw.push({x:axis(0),z:axis(1)});
    }
    const lengths=[0];
    for(let i=1;i<=raw.length;i++){const a=raw[i-1],b=raw[i%raw.length];lengths.push(lengths[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}
    this.length=lengths.at(-1);this.count=Math.ceil(this.length/2);this.step=this.length/this.count;this.points=[];
    let ri=0;
    for(let i=0;i<this.count;i++){const d=i*this.step;while(lengths[ri+1]<d)ri++;const t=(d-lengths[ri])/(lengths[ri+1]-lengths[ri]);this.points.push({x:lerp(raw[ri].x,raw[(ri+1)%raw.length].x,t),z:lerp(raw[ri].z,raw[(ri+1)%raw.length].z,t)});}
    const startOffset=Math.round(85/this.step);this.points.push(...this.points.splice(0,startOffset));
    this.points.forEach((p,i)=>{const a=this.points[wrap(i-2,this.count)],b=this.points[(i+2)%this.count];p.heading=Math.atan2(b.x-a.x,b.z-a.z);p.s=i*this.step;});
    this.points.forEach((p,i)=>{p.curve=angle(this.points[(i+3)%this.count].heading-this.points[wrap(i-3,this.count)].heading)/(6*this.step);p.bank=clamp(p.curve*49,-.65,.65);});
    const banks=this.points.map(p=>p.bank);this.points.forEach((p,i)=>{let value=0,weight=0;for(let j=-9;j<=9;j++){const w=10-Math.abs(j);value+=banks[wrap(i+j,this.count)]*w;weight+=w;}p.bank=value/weight;});
    this.ramps=[.115,.435,.745].map((t,i)=>({s:t*this.length,lane:[-4,3,-3][i],length:22,height:3.2}));
    this.pits=[{s:this.length*.27,lane:5,depth:3.7,radius:5.2},{s:this.length*.59,lane:-5,depth:4.3,radius:5.5},{s:this.length*.875,lane:4,depth:3.2,radius:4.7}];
    this.moguls=[this.length*.64,this.length*.70];
  }
  sample(s){const v=wrap(s,this.length)/this.step,i=Math.floor(v),t=v-i,a=this.points[i],b=this.points[(i+1)%this.count];return {x:lerp(a.x,b.x,t),z:lerp(a.z,b.z,t),heading:a.heading+angle(b.heading-a.heading)*t,bank:lerp(a.bank,b.bank,t),curve:lerp(a.curve,b.curve,t),s:wrap(s,this.length)};}
  delta(a,b){return wrap(a-b+this.length/2,this.length)-this.length/2;}
  centerHeight(s){const t=wrap(s,this.length)/this.length;return 17+8*Math.sin(t*TAU-.8)+5*Math.sin(t*TAU*3)+1.4*Math.sin(t*TAU*9);}
  height(s,lane){
    s=wrap(s,this.length);const p=this.sample(s);
    let y=this.centerHeight(s)-p.bank*lane+.10*Math.sin(s/this.length*TAU*167+lane*.8)+.07*Math.sin(s/this.length*TAU*521-lane*.7);
    for(const r of this.ramps){const d=this.delta(s,r.s);if(d>-r.length&&d<5){const edge=clamp((Math.abs(lane-r.lane)-4)/3,0,1),side=1-edge*edge*(3-2*edge),t=clamp((d+r.length)/r.length,0,1);y+=r.height*(d<0?t*(.5+.5*t):Math.max(0,1-d/5))*side;}}
    for(const p of this.pits){const ds=this.delta(s,p.s),r=Math.hypot(ds,(lane-p.lane)*1.15)/p.radius;if(r<1)y-=p.depth*Math.pow(Math.cos(r*Math.PI/2),1.25);}
    if(s>this.moguls[0]&&s<this.moguls[1]){const fade=Math.min(1,(s-this.moguls[0])/12,(this.moguls[1]-s)/12);y+=fade*(.24+.24*Math.cos(s*TAU/12+Math.round(lane/4)*Math.PI))*Math.pow(Math.cos(lane*Math.PI/8),2)*clamp((11-Math.abs(lane))/4,0,1);}
    return y;
  }
  at(s,lane=0){const p=this.sample(s);return {x:p.x+Math.cos(p.heading)*lane,y:this.height(s,lane),z:p.z-Math.sin(p.heading)*lane,heading:p.heading};}
  nearest(x,z,hint){
    let best=Infinity,index=0;const start=hint===undefined?0:Math.floor(wrap(hint,this.length)/this.step)-35;const n=hint===undefined?this.count:71;
    for(let k=0;k<n;k++){const i=wrap(start+k,this.count),p=this.points[i],d=(p.x-x)**2+(p.z-z)**2;if(d<best){best=d;index=i;}}
    if(best>80**2&&hint!==undefined)return this.nearest(x,z);
    let result;
    for(const i of [wrap(index-1,this.count),index]){const a=this.points[i],b=this.points[(i+1)%this.count],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),px=lerp(a.x,b.x,t),pz=lerp(a.z,b.z,t),d=(x-px)**2+(z-pz)**2;if(!result||d<result.d){const s=wrap((i+t)*this.step,this.length),p=this.sample(s);result={s,lane:(x-px)*Math.cos(p.heading)-(z-pz)*Math.sin(p.heading),d};}}
    return result;
  }
  surface(x,z,hint){const n=this.nearest(x,z,hint);return {...n,y:this.height(n.s,clamp(n.lane,-this.width/2,this.width/2))};}
  buildCollider(){
    if(this.collider)return this.collider;
    // A regular grid supports both Cannon's wheel rays AND box/roof contacts.
    // Cache immutable height data per track; every race receives a fresh World.
    const minX=-310,maxZ=310,cell=2,nx=341,nz=326,data=[];
    for(let ix=0;ix<nx;ix++){
      const row=[];let hint;
      for(let iz=0;iz<nz;iz++){
        const x=minX+ix*cell,z=maxZ-iz*cell,n=this.nearest(x,z,hint);hint=n.s;
        const distance=Math.sqrt(n.d),edge=this.height(n.s,clamp(n.lane,-14,14));
        const earth=-3+8*Math.sin(x*.014)*Math.cos(z*.009)+3*Math.sin(z*.03+x*.009);
        row.push(distance<14?this.height(n.s,n.lane):lerp(edge,earth,clamp((distance-14)/30,0,1)));
      }
      data.push(row);
    }
    this.collider={minX,maxZ,cell,data};return this.collider;
  }
  groundHeight(x,z){
    const {minX,maxZ,cell,data}=this.buildCollider(),u=clamp((x-minX)/cell,0,data.length-1.00001),v=clamp((maxZ-z)/cell,0,data[0].length-1.00001),ix=Math.floor(u),iz=Math.floor(v),a=u-ix,b=v-iz;
    return a+b<=1?data[ix][iz]*(1-a-b)+data[ix+1][iz]*a+data[ix][iz+1]*b:data[ix+1][iz+1]*(a+b-1)+data[ix][iz+1]*(1-a)+data[ix+1][iz]*(1-b);
  }
  barrierSections(){
    if(this.barriers)return this.barriers;
    // Shared cross-sections close the loop exactly. Each triangular prism has
    // planar faces, so Cannon and the renderer can use the very same vertices.
    const count=Math.ceil(this.length/4),sections=[];
    for(const side of [-1,1]){
      const rings=Array.from({length:count},(_,i)=>[-.4,.4].map(offset=>{
        const p=this.at(i*this.length/count,side*14.5+offset);
        return [p.x,this.groundHeight(p.x,p.z)+1.16,p.z];
      }));
      for(let i=0;i<count;i++){
        const [a,b]=rings[i],[d,c]=rings[(i+1)%count],prisms=[];
        for(let triangle of [[a,b,c],[a,c,d]]){
          const [p,q,r]=triangle;
          if((q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0])<0)triangle=[p,r,q];
          prisms.push({vertices:[...triangle.map(v=>[v[0],v[1]-3,v[2]]),...triangle],faces:[[0,1,2],[5,4,3],[0,3,4,1],[1,4,5,2],[2,5,3,0]]});
        }
        sections.push({s:i*this.length/count,side,prisms});
      }
    }
    this.barriers=sections;return sections;
  }
  sector(s){const t=wrap(s,this.length)/this.length;return t<.10?'PINE STRAIGHT':t<.23?'SKYLINE JUMP':t<.36?'QUARRY BEND':t<.52?'HIGH RIDGE':t<.63?'THE HOLLOW':t<.71?'MOGUL FIELD':t<.84?'SUMMIT LEAP':'HOME RUN';}
}
const DIFFICULTY={basic:{speed:24.15,grip:1,look:12},intermediate:{speed:33.6,grip:1.08,look:14},advanced:{speed:43.05,grip:1.14,look:16}};

class CannonDrivingWorld {
  constructor(sim){
    this.sim=sim;this.track=sim.track;this.rigs=[];
    this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0),allowSleep:false});
    this.world.broadphase=new CANNON.SAPBroadphase(this.world);
    this.world.broadphase.axisIndex=0;this.world.solver.iterations=12;this.world.solver.tolerance=1e-7;
    this.world.defaultContactMaterial.friction=.35;this.world.defaultContactMaterial.restitution=.08;
    this.carMaterial=new CANNON.Material('rally chassis');
    this.groundMaterial=new CANNON.Material('dirt');this.wallMaterial=new CANNON.Material('barrier');
    for(const [other,friction,restitution]of [[this.groundMaterial,.45,.04],[this.wallMaterial,.25,.12],[this.carMaterial,.3,.12]])this.world.addContactMaterial(new CANNON.ContactMaterial(this.carMaterial,other,{friction,restitution,contactEquationStiffness:1e7,contactEquationRelaxation:4}));
    const grid=this.track.buildCollider();
    this.ground=new CANNON.Body({mass:0,material:this.groundMaterial});
    this.ground.addShape(new CANNON.Heightfield(grid.data,{elementSize:grid.cell}));
    this.ground.position.set(grid.minX,0,grid.maxZ);this.ground.quaternion.setFromEuler(-Math.PI/2,0,0);this.ground.kind='terrain';this.world.addBody(this.ground);
    // Group nearby wall segments into small compound bodies for broadphase efficiency.
    this.walls=[];let wall;
    for(const [index,section]of this.track.barrierSections().entries()){
      if(index%12===0){wall=new CANNON.Body({mass:0,material:this.wallMaterial});const p=this.track.at(section.s,section.side*14.5);wall.position.set(p.x,p.y,p.z);wall.kind='barrier';this.walls.push(wall);this.world.addBody(wall);}
      for(const prism of section.prisms){
        // Millimetre-scale collision skin closes floating-point cracks exactly
        // on shared edges, without a visible mismatch or overlapping draw faces.
        const origin=[0,1,2].map(axis=>prism.vertices.reduce((sum,v)=>sum+v[axis],0)/6),vertices=prism.vertices.map(v=>new CANNON.Vec3((v[0]-origin[0])*1.001,(v[1]-origin[1])*1.001,(v[2]-origin[2])*1.001));
        wall.addShape(new CANNON.ConvexPolyhedron({vertices,faces:prism.faces}),new CANNON.Vec3(origin[0]-wall.position.x,origin[1]-wall.position.y,origin[2]-wall.position.z));
      }
    }
    sim.cars.forEach(c=>this.addCar(c));
  }
  addCar(c){
    const body=new CANNON.Body({mass:1150,material:this.carMaterial,linearDamping:.015,angularDamping:.42});
    body.addShape(new CANNON.Box(new CANNON.Vec3(1.03,.25,2.12)));
    body.addShape(new CANNON.Box(new CANNON.Vec3(.83,.38,.94)),new CANNON.Vec3(0,.70,0));
    body.carId=c.id;body.kind='car';
    const vehicle=new CANNON.RaycastVehicle({chassisBody:body,indexRightAxis:0,indexForwardAxis:2,indexUpAxis:1});
    for(const x of [-1.02,1.02])for(const z of [-1.44,1.4])vehicle.addWheel({radius:.46,chassisConnectionPointLocal:new CANNON.Vec3(x,.1,z),directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(-1,0,0),isFrontWheel:z>0,suspensionStiffness:45,suspensionRestLength:.46,maxSuspensionTravel:.36,dampingRelaxation:3.6,dampingCompression:8,maxSuspensionForce:60000,frictionSlip:1.8,rollInfluence:.38,customSlidingRotationalSpeed:-25,useCustomSlidingRotationalSpeed:true});
    vehicle.addToWorld(this.world);this.rigs.push({body,vehicle});
    body.addEventListener('collide',e=>{
      const car=this.sim.cars[c.id],force=Math.abs(e.contact.getImpactVelocityAlongNormal());
      if(force>4&&car.crashCooldown<=0){car.crashCooldown=.3;car.hits++;car.damage=clamp(car.damage+(force-4)*.7*(car.shield>0?.12:1),0,80);this.sim.emit(e.body.kind==='terrain'?'land':'crash',car,{force});}
    });
    this.place(c,{...c,y:this.track.groundHeight(c.x,c.z)+.80});
  }
  place(c,state){
    Object.assign(c,state);const {body,vehicle}=this.rigs[c.id];
    body.position.set(c.x,c.y,c.z);body.velocity.set(c.vx||0,c.vy||0,c.vz||0);
    if(state.qw!==undefined)body.quaternion.set(c.qx,c.qy,c.qz,c.qw);else body.quaternion.setFromEuler(c.pitch||0,c.heading||0,c.roll||0,'YXZ');
    body.angularVelocity.set(c.pitchV||0,c.yawRate||0,c.rollV||0);body.force.setZero();body.torque.setZero();
    body.previousPosition.copy(body.position);body.interpolatedPosition.copy(body.position);body.previousQuaternion.copy(body.quaternion);body.interpolatedQuaternion.copy(body.quaternion);body.aabbNeedsUpdate=true;body.updateInertiaWorld(true);body.wakeUp();this.world.broadphase.dirty=true;
    for(const w of vehicle.wheelInfos){w.suspensionLength=.44;w.suspensionRelativeVelocity=0;w.rotation=0;w.deltaRotation=0;w.engineForce=0;w.brake=0;w.steering=0;w.isInContact=false;w.raycastResult.reset();}
    this.sync(c);
  }
  controls(c,dt){
    const {body,vehicle}=this.rigs[c.id],i=c.finished?(this.sim.time-c.finishTime<9?{...this.sim.ai(c),throttle:Math.hypot(c.vx,c.vz)<13?.45:0,brake:Math.hypot(c.vx,c.vz)>16?.3:0,boost:false,drift:false}:{throttle:0,brake:1,steer:0,drift:false,boost:false}):c.input;
    for(const key of ['recoveryCooldown','crashCooldown','shield','boostTime'])c[key]=Math.max(0,(c[key]||0)-dt);
    const forward=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(0,0,1),forward);
    const speed=body.velocity.dot(forward),boost=(i.boost&&c.boost>0&&i.throttle>0)||c.boostTime>0;
    if(i.boost&&c.boost>0&&i.throttle>0)c.boost=Math.max(0,c.boost-dt*25);else c.boost=Math.min(100,c.boost+dt*3.3);
    c.steer=lerp(c.steer,i.steer,1-Math.exp(-dt*9));
    const steering=c.steer*(.53/(1+Math.abs(speed)*.026));
    // Reverse requires holding brake once the car has come to a halt.
    c.reverseTimer=i.brake>.5&&Math.abs(speed)<1?c.reverseTimer+dt:i.brake<=.5?0:c.reverseTimer;
    const reverse=!c.finished&&i.brake>.5&&c.reverseTimer>.45&&speed<1;
    // Keep low-speed torque; a slightly later falloff lifts cruising/top speed.
    const drive=i.throttle*(boost?4400:2800)*Math.min(1,27/(Math.abs(speed)+1))*(1-c.damage*.004),reverseForce=reverse&&speed>-7?1900:0;
    const grip=(c.isAI?DIFFICULTY[this.sim.options.difficulty].grip:1)*(Math.abs(c.lane)>14?.7:1);
    vehicle.wheelInfos.forEach((w,j)=>{
      vehicle.setSteeringValue(w.isFrontWheel?steering:0,j);
      vehicle.applyEngineForce(reverse?reverseForce:-drive,j);
      vehicle.setBrake(reverse?0:i.brake*80+(i.drift&&!w.isFrontWheel?18:0),j);
      w.frictionSlip=grip*(i.drift?(w.isFrontWheel?1.6:.65):1.85);
    });
    const velocity=body.velocity.length(),drag=18+velocity*3;
    body.applyForce(new CANNON.Vec3(-body.velocity.x*drag,0,-body.velocity.z*drag));
    // Rally air control acts through torque, preserving Cannon's free flight and impacts.
    // Dampen the rear-axle launch kick; aim for a slight nose-up landing attitude.
    const up=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(0,1,0),up);
    if(!c.grounded&&c.airTime>.06&&up.y>.25){
      const right=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(1,0,0),right);
      const pitch=Math.atan2(-forward.y,Math.hypot(forward.x,forward.z)),rate=body.angularVelocity.dot(right),targetS=c.s+Math.hypot(c.vx,c.vz)*.2;
      const grade=(this.track.height(targetS+3,c.lane)-this.track.height(targetS-3,c.lane))/6;
      const targetPitch=clamp(-Math.atan(grade)-.04,-.3,.18),targetRoll=-Math.atan(this.track.sample(targetS).bank),roll=Math.atan2(right.y,up.y);
      body.applyTorque(right.scale(clamp((targetPitch-pitch)*11000-rate*6000,-11000,11000)));
      body.applyTorque(forward.scale(clamp((targetRoll-roll)*9000-body.angularVelocity.dot(forward)*4500,-9000,9000)));
    }
    if(c.grounded){const down=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(0,-Math.min(2400,velocity*velocity*1.4),0),down);body.applyForce(down);}
  }
  sync(c){
    const {body,vehicle}=this.rigs[c.id],p=body.position,q=body.quaternion,v=body.velocity,omega=body.angularVelocity;
    Object.assign(c,{x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,qx:q.x,qy:q.y,qz:q.z,qw:q.w,pitchV:omega.x,yawRate:omega.y,rollV:omega.z});
    c.pitch=Math.asin(clamp(2*(q.w*q.x-q.y*q.z),-1,1));c.heading=Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y));c.roll=Math.atan2(2*(q.x*q.y+q.w*q.z),1-2*(q.x*q.x+q.z*q.z));
    c.wheelState=vehicle.wheelInfos.map(w=>({suspensionLength:w.suspensionLength,rotation:w.rotation,deltaRotation:w.deltaRotation,steering:w.steering,suspensionRelativeVelocity:w.suspensionRelativeVelocity}));
    const n=this.track.nearest(c.x,c.z,c.s);c.s=n.s;c.lane=n.lane;
  }
  afterStep(c,dt){
    const wasGrounded=c.grounded;this.sync(c);const {body,vehicle}=this.rigs[c.id];
    c.grounded=vehicle.wheelInfos.some(w=>w.isInContact);
    const up=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(0,1,0),up);
    const roof=up.y<-.35,bodyContact=this.world.contacts.some(contact=>contact.bi===body||contact.bj===body);
    if(!roof)c.roofTime=0;else if(bodyContact||c.roofTime>0)c.roofTime+=dt;if(c.roofTime>2.3)this.sim.recover(c,true);
    if(c.grounded){if(!wasGrounded&&c.airTime>.18){c.maxAir=Math.max(c.maxAir,c.airTime);this.sim.emit('land',c,{air:c.airTime,force:Math.abs(c.vy)});}c.airTime=0;}else if(!bodyContact){c.airTime+=dt;c.totalAir+=dt;}
    const side=new CANNON.Vec3();body.vectorToWorldFrame(new CANNON.Vec3(1,0,0),side);c.drift=Math.abs(body.velocity.dot(side));
    const speed=Math.hypot(c.vx,c.vz);if(c.grounded&&c.input.drift&&speed>8&&c.drift>2)c.driftDistance+=speed*dt;
    c.stuck=speed<2&&c.input.throttle>.5?c.stuck+dt:0;c.offTrackTime=Math.abs(c.lane)>22?c.offTrackTime+dt:0;
    if((c.isAI&&c.stuck>5)||c.offTrackTime>3||c.y<-35)this.sim.recover(c,true);
  }
  step(dt){for(const c of this.sim.cars)this.controls(c,dt);this.world.step(dt);for(const c of this.sim.cars)this.afterStep(c,dt);}
  restore(snapshot){
    // Rebuild contact caches and subscriptions, then restore canonical rigid-body state.
    for(const c of this.sim.cars){const state=snapshot.cars[c.id];this.place(c,state);Object.assign(c,JSON.parse(JSON.stringify(state)));const wheels=this.rigs[c.id].vehicle.wheelInfos;state.wheelState?.forEach((w,i)=>Object.assign(wheels[i],w));}
    this.world.time=snapshot.time;this.world.stepnumber=snapshot.tick;
  }
}
class RallySimulation {
  constructor(track,options={}){
    this.track=track;this.options={mode:'race',laps:1,difficulty:'intermediate',...options};this.time=0;this.tick=0;this.events=[];this.cars=[];this.finished=false;this.finishOrder=[];
    this.pickups=[];
    track.ramps.forEach(r=>this.pickups.push({s:r.s+6,lane:r.lane,kind:'gem',y:track.height(r.s,r.lane)+3.0,cooldown:0}));
    [.19,.36,.55,.79,.94].forEach((t,i)=>{const lane=[-5,4,5,-4,0][i];this.pickups.push({s:t*track.length,lane,kind:['nitro','shield','repair','nitro','shield'][i],y:track.height(t*track.length,lane)+1.5,cooldown:0});});
    this.options.laps=this.options.laps===3?3:1;
    if(!DIFFICULTY[this.options.difficulty])this.options.difficulty='intermediate';
    const count=this.options.mode==='trial'?1:this.options.mode==='multiplayer'?clamp(Math.floor(this.options.playerCount)||1,1,6):6;
    for(let id=0;id<count;id++){
      const s=-8-Math.floor(id/2)*7,lane=count===1?0:(id%2===0?-3.5:3.5),p=track.at(s,lane);
      this.cars.push({id,isAI:id>0&&this.options.mode==='race',x:p.x,y:p.y+.68,z:p.z,vx:0,vy:0,vz:0,heading:p.heading,yawRate:0,pitch:0,roll:0,pitchV:0,rollV:0,s:wrap(s,track.length),lane,progress:s,lap:0,lapStart:0,lapTimes:[],nextGate:1,passedGates:0,grounded:true,roofTime:0,stuck:0,boost:100,boostTime:0,shield:0,damage:0,drift:0,airTime:0,totalAir:0,maxAir:0,driftDistance:0,gems:0,hits:0,finished:false,finishTime:null,steer:0,recoveryCooldown:0,crashCooldown:0,reverseTimer:0,offTrackTime:0,achievements:[],input:{}});
    }
    this.physics=new CannonDrivingWorld(this);
  }
  emit(type,car,extra={}){this.events.push({type,id:car.id,...extra});}
  recover(c,automatic=false){
    if(c.recoveryCooldown>0&&!automatic)return;
    let lane=clamp(c.lane,-8,8);
    for(const pit of this.track.pits)if(Math.abs(this.track.delta(c.s,pit.s))<pit.radius+5)lane=pit.lane>0?-6:6;
    if(c.s>this.track.moguls[0]-8&&c.s<this.track.moguls[1]+8)lane=c.lane<0?-9:9;
    const p=this.track.at(c.s,lane);let support=this.track.groundHeight(p.x,p.z);
    for(const dx of [-1.15,0,1.15])for(const dz of [-2.2,0,2.2])support=Math.max(support,this.track.groundHeight(p.x+Math.cos(p.heading)*dx+Math.sin(p.heading)*dz,p.z-Math.sin(p.heading)*dx+Math.cos(p.heading)*dz));
    this.physics.place(c,{x:p.x,y:support+1,z:p.z,heading:p.heading,vx:0,vy:0,vz:0,pitch:0,roll:0,pitchV:0,rollV:0,yawRate:0,roofTime:0,stuck:0,offTrackTime:0,reverseTimer:0,steer:0,recoveryCooldown:2,damage:Math.max(0,c.damage-10)});
    this.emit('recover',c);
  }
  teleport(c,state){this.physics.place(c,state);}
  ai(c){
    const config=DIFFICULTY[this.options.difficulty],speed=Math.hypot(c.vx,c.vz),look=config.look+speed*.4;
    let lane=(c.id%3-1)*4,trafficSpeed=Infinity;
    for(const p of this.track.pits)if(this.track.delta(p.s,c.s)>-24&&this.track.delta(p.s,c.s)<90)lane=p.lane>0?-4:4;
    for(const other of this.cars)if(other!==c){const ds=this.track.delta(other.s,c.s);if(ds>0&&ds<22&&Math.abs(other.lane-lane)<3){lane=clamp(other.lane+(c.id%2?4:-4),-9,9);if(ds<9)trafficSpeed=Math.hypot(other.vx,other.vz)+2;}}
    for(const [ri,r]of this.track.ramps.entries())if(this.track.delta(r.s,c.s)>-15&&this.track.delta(r.s,c.s)<75)lane=c.id===0||c.id%3===ri?r.lane:(r.lane<0?8:-8);
    if(c.s>this.track.moguls[0]-30&&c.s<this.track.moguls[1]+15)lane=c.id%2?4:-4;
    lane=clamp(lane-this.track.sample(c.s+look*.5).curve*look*look*.12,-9,9);
    const target=this.track.at(c.s+look,lane),desired=Math.atan2(target.x-c.x,target.z-c.z),error=angle(desired-c.heading);
    let curve=0;for(let d=8;d<90;d+=12)curve=Math.max(curve,Math.abs(this.track.sample(c.s+d).curve));
    let wanted=Math.min(config.speed,Math.sqrt(({basic:8.5,intermediate:10,advanced:11.5}[this.options.difficulty])/(curve+.002)));
    if(c.s>this.track.moguls[0]-20&&c.s<this.track.moguls[1])wanted=Math.min(wanted,{basic:8,intermediate:10,advanced:12}[this.options.difficulty]);
    if(Math.abs(error)>.65)wanted*=.5;wanted=Math.min(wanted,trafficSpeed);
    return {throttle:speed<wanted?1:.13,brake:speed>wanted+2?.7:0,steer:clamp(error*1.4-c.yawRate*.08,-1,1),recover:c.stuck>5,drift:Math.abs(error)>.5&&speed>20&&this.options.difficulty!=='basic',boost:this.options.difficulty==='advanced'&&curve<.009&&speed>20};
  }
  step(inputs={},dt=DT){
    if(this.finished)return;
    this.time+=dt;this.tick++;this.events.length=0;
    for(const p of this.pickups)p.cooldown=Math.max(0,p.cooldown-dt);
    for(const c of this.cars){const raw=inputs[c.id]??(c.isAI?this.ai(c):{});c.input={throttle:clamp(Number(raw.throttle)||0,0,1),brake:clamp(Number(raw.brake)||0,0,1),steer:clamp(Number(raw.steer)||0,-1,1),drift:!!raw.drift,boost:!!raw.boost};if(raw.recover)this.recover(c);}
    this.physics.step(dt);
    for(const c of this.cars){this.progress(c);this.collect(c);this.achievements(c);}
    this.finished=this.cars.every(c=>c.finished);
  }
  progress(c){
    if(c.finished)return;
    const s=this.track.nearest(c.x,c.z,c.s).s;c.s=s;
    // Gate sequence prevents shortcuts, reverse-line exploits, and recovery lap awards.
    const gateS=c.nextGate*this.track.length/16,gap=this.track.delta(c.s,gateS),old=c.lastGateGap;
    if(gap>=0&&gap<22&&(old===undefined||old<0)&&Math.abs(c.lane)<this.track.width/2+2){c.passedGates++;c.nextGate=(c.nextGate+1)%16;c.lastGateGap=undefined;
      if(c.nextGate===1){c.lap++;c.lapTimes.push(this.time-c.lapStart);c.lapStart=this.time;this.emit('lap',c,{lap:c.lap});if(c.lap>=this.options.laps){c.finished=true;c.finishTime=this.time;this.finishOrder.push(c.id);this.emit('finish',c);}}
    }else c.lastGateGap=gap;
    c.progress=c.lap*this.track.length+c.s;
    // Cars starting just behind zero belong to the start grid, not the end of lap one.
    if(c.passedGates===0&&c.s>this.track.length*.9)c.progress=c.s-this.track.length;
  }
  collect(c){for(const p of this.pickups){if(p.cooldown>0||Math.abs(this.track.delta(c.s,p.s))>4||Math.abs(c.lane-p.lane)>2.7||Math.abs(c.y+.6-p.y)>2.2)continue;p.cooldown=12;
    if(p.kind==='gem'){c.boostTime=4;c.gems++;}if(p.kind==='nitro')c.boost=Math.min(100,c.boost+55);if(p.kind==='shield')c.shield=9;if(p.kind==='repair')c.damage=0;this.emit('pickup',c,{kind:p.kind});}}
  achievements(c){const checks=[['FIRST FLIGHT',c.maxAir>.6],['SIDEWAYS / 100 M',c.driftDistance>=100],['GEM HUNTER',c.gems>=3],['FLYING LOW',Math.hypot(c.vx,c.vz)*3.6>160],['CLEAN FINISH',c.finished&&c.damage<5]];for(const [name,yes]of checks)if(yes&&!c.achievements.includes(name)){c.achievements.push(name);this.emit('achievement',c,{name});}}
  standings(){return [...this.cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);}
  snapshot(){return JSON.parse(JSON.stringify({version:TRACK_VERSION,options:this.options,tick:this.tick,time:this.time,cars:this.cars,pickups:this.pickups,finished:this.finished,finishOrder:this.finishOrder}));}
  restore(s){
    if(s.version!==TRACK_VERSION||s.cars.length!==this.cars.length)throw new Error('Incompatible physics snapshot');
    const state=JSON.parse(JSON.stringify(s));this.tick=state.tick;this.time=state.time;this.options=state.options;this.cars=state.cars;this.pickups=state.pickups;this.finished=state.finished;this.finishOrder=state.finishOrder;this.events=[];
    this.physics=new CannonDrivingWorld(this);this.physics.restore(s);
  }

}
// SIMULATION_CORE_END

// REPLAY_STORAGE_BEGIN
async function encodeReplayForStorage(replay){
  if(typeof CompressionStream==='undefined')return replay;
  const stream=new Blob([JSON.stringify(replay)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {encoding:'gzip-base64',data:btoa(binary)};
}
async function decodeReplayFromStorage(saved){
  if(saved?.encoding!=='gzip-base64')return saved;
  if(typeof DecompressionStream==='undefined')return null;
  try{const bytes=Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0));return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());}catch{return null;}
}
// REPLAY_STORAGE_END
const FRAME_STRIDE=22;
const $=id=>document.getElementById(id);
const track=new DirtTrack();
track.buildCollider();
const settings={mode:'race',laps:1,difficulty:'intermediate',color:0};
let sim,phase='menu',cameraMode=0,accumulator=0,lastTime=0,countdown=3.3,toastTimer=0,renderTime=0,hudTimer=0;
let recording=[],lastReplay=null,replayTime=0,replayRate=1,ghostData=null,recordTimer=0,replayPaused=false,replayMenuSettings=null,cachedBestTime=null;
const storagePrefix=new URLSearchParams(location.search).has('test')?'dustline-qa:':'dustline:';
const storage={get(key,fallback=null){try{return JSON.parse(localStorage.getItem(storagePrefix+key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(storagePrefix+key,JSON.stringify(value));return true;}catch{return false;}}};
const bestKey=()=>`${TRACK_VERSION}:${settings.mode}:${settings.laps}`;
lastReplay=await decodeReplayFromStorage(storage.get('lastReplay'));
let replaySaveSequence=0;
async function persistReplay(replay){const sequence=++replaySaveSequence;try{const encoded=await encodeReplayForStorage(replay);return sequence===replaySaveSequence?storage.set('lastReplay',encoded):true;}catch{return storage.set('lastReplay',replay);}}
if(!lastReplay||lastReplay.version!==TRACK_VERSION||!Array.isArray(lastReplay.frames)||lastReplay.frames.length<2||lastReplay.frames[0]?.length<1+FRAME_STRIDE)lastReplay=null;
$('watch-menu').disabled=!lastReplay;
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('load-error').classList.remove('hidden');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.5:2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#b8cbc8');scene.fog=new THREE.FogExp2('#b9c9bc',.00165);
const sky=new THREE.Mesh(new THREE.SphereGeometry(1800,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#729db4')},bottom:{value:new THREE.Color('#d5d8bd')}},vertexShader:'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vDirection;void main(){float h=max(normalize(vDirection).y,0.0);gl_FragColor=vec4(mix(bottom,top,pow(h,0.6)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));scene.add(sky);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,2500);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enabled=false;orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.maxPolarAngle=Math.PI*.47;orbit.minDistance=12;orbit.maxDistance=950;orbit.enablePan=true;
scene.add(new THREE.HemisphereLight('#d8ebef','#716440',2.5));
const sun=new THREE.DirectionalLight('#ffe5b9',3.6);sun.position.set(-160,240,-90);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;sun.shadow.camera.near=5;sun.shadow.camera.far=600;sun.shadow.bias=-.0003;sun.shadow.normalBias=.12;scene.add(sun,sun.target);
const rand=randomGenerator(5169);
function texture(kind,size=512){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');
  const colors={dirt:['#96754e','#604d35','#b49a70'],grass:['#65734a','#465b36','#959462'],rock:['#7b8070','#525c54','#a0a28b'],rubber:['#242824','#101813','#465044'],bark:['#625943','#393c2d','#968261'],foliage:['#8b9b64','#42573a','#b1ad76']};
  const pal=colors[kind]||colors.dirt;ctx.fillStyle=pal[0];ctx.fillRect(0,0,size,size);
  for(let i=0;i<27000;i++){const x=rand()*size,y=rand()*size,r=rand()*2.1+.3;ctx.globalAlpha=.15+rand()*.5;ctx.fillStyle=pal[i%3];ctx.fillRect(x,y,kind==='bark'?r:r*1.5,kind==='bark'?r*11:r);}
  if(kind==='dirt'){ctx.globalAlpha=.15;for(let i=0;i<16;i++){ctx.strokeStyle=i%2?'#ddc49b':'#372f24';ctx.lineWidth=rand()*2+1;ctx.beginPath();ctx.moveTo(i*34,0);ctx.bezierCurveTo(i*34+7,170,i*34-5,350,i*34+2,512);ctx.stroke();}}
  ctx.globalAlpha=1;const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;
}
const dirtTex=texture('dirt'),grassTex=texture('grass'),rockTex=texture('rock'),rubberTex=texture('rubber'),barkTex=texture('bark'),foliageTex=texture('foliage');
const mats={dirt:new THREE.MeshStandardMaterial({map:dirtTex,bumpMap:dirtTex,bumpScale:.16,roughness:1,vertexColors:true}),grass:new THREE.MeshStandardMaterial({map:grassTex,roughness:1,vertexColors:true}),rock:new THREE.MeshStandardMaterial({map:rockTex,roughness:1}),barrier:new THREE.MeshStandardMaterial({color:'#d6c7a5',map:rockTex,roughness:.95}),rubber:new THREE.MeshStandardMaterial({map:rubberTex,color:'#8d9388',roughness:1}),metal:new THREE.MeshStandardMaterial({color:'#aab4ad',metalness:.7,roughness:.37}),black:new THREE.MeshStandardMaterial({color:'#18231f',roughness:.7}),glass:new THREE.MeshPhysicalMaterial({color:'#7aabaa',metalness:.15,roughness:.12,transparent:true,opacity:.43,depthWrite:false}),bark:new THREE.MeshStandardMaterial({map:barkTex,roughness:1})};
function mesh(geo,mat,parent=scene){const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,mat,x=0,y=0,z=0,parent=scene){const m=mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
function roadGeometry(){const pos=[],uv=[],indices=[],colors=[],across=28;for(let i=0;i<=track.count;i++){const s=i*track.step;for(let j=0;j<=across;j++){const lane=(j/across-.5)*track.width,p=track.at(s,lane);pos.push(p.x,track.groundHeight(p.x,p.z),p.z);uv.push(j/across*4,s/9);let tint=1;for(const r of track.ramps){const d=track.delta(s,r.s),side=Math.abs(lane-r.lane);if(d>-r.length&&d<0&&side<4.3){tint=.88;if(Math.abs(side-1.03)<.6)tint=.69;}}colors.push(tint,tint,tint);if(i<track.count&&j<across){const a=i*(across+1)+j,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;}
const road=mesh(roadGeometry(),mats.dirt),terrainMeshes=[road];road.castShadow=false;
function landscapeHeight(x,z){return -3+8*Math.sin(x*.014)*Math.cos(z*.009)+3*Math.sin(z*.03+x*.009);}
function buildLandscape(){
  const g=new THREE.PlaneGeometry(1500,1500,150,150);g.rotateX(-Math.PI/2);const p=g.attributes.position,colors=[];const color=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),n=track.nearest(x,z),distance=Math.sqrt(n.d),edge=track.height(n.s,clamp(n.lane,-14,14));let y=landscapeHeight(x,z);if(distance<50)y=lerp(edge-3,y,clamp((distance-14)/36,0,1));p.setY(i,y);color.setHSL(.20+rand()*.035,.19+rand()*.15,.31+rand()*.13);colors.push(color.r,color.g,color.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.attributes.uv.array.forEach((v,i,a)=>a[i]=v*100);g.computeVertexNormals();const landscape=mesh(g,mats.grass);landscape.castShadow=false;terrainMeshes.push(landscape);
  // Continuous earth shoulders seal elevated circuit edges into the landscape.
  for(const side of [-1,1]){const v=[],u=[],ind=[];for(let i=0;i<=track.count;i++){const s=i*track.step;for(let j=0;j<2;j++){const p=track.at(s,side*(14+j*28));v.push(p.x,j?landscapeHeight(p.x,p.z)-.1:track.height(s,side*14)-.06,p.z);u.push(s/12,j*4);}if(i<track.count){const a=i*2;ind.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(side<0?ind:ind.reverse());g.computeVertexNormals();const shoulder=mesh(g,new THREE.MeshStandardMaterial({map:dirtTex,roughness:1,side:THREE.DoubleSide}));shoulder.castShadow=false;terrainMeshes.push(shoulder);}
}
buildLandscape();
function instanced(geometry,material,transforms){const m=new THREE.InstancedMesh(geometry,material,transforms.length),dummy=new THREE.Object3D();transforms.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(t.rx||0,t.ry||0,t.rz||0);dummy.scale.set(t.sx||1,t.sy||1,t.sz||1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(t.color)m.setColorAt(i,new THREE.Color(t.color));});m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function scenery(){
  const posts=[],trunks=[],leaves=[],rocks=[],positions=[],colors=[],uv=[];
  for(const section of track.barrierSections()){
    const color=new THREE.Color(Math.floor(section.s/24)%2?'#cfc3a6':'#ad5837');
    for(const prism of section.prisms)for(const face of prism.faces)for(let j=1;j<face.length-1;j++)for(const k of [face[0],face[j],face[j+1]]){
      const v=prism.vertices[k];positions.push(...v);colors.push(color.r,color.g,color.b);uv.push((v[0]+v[2])/3,v[1]/2);
    }
  }
  const barrierGeometry=new THREE.BufferGeometry();barrierGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));barrierGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));barrierGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));barrierGeometry.computeVertexNormals();
  const barrierMaterial=mats.barrier.clone();barrierMaterial.vertexColors=true;mesh(barrierGeometry,barrierMaterial).name='terrain barriers';
  for(let s=0;s<track.length;s+=18)for(const side of [-1,1]){const p=track.at(s,side*14.5);posts.push({x:p.x,y:track.groundHeight(p.x,p.z)+1.4,z:p.z,ry:p.heading});}
  instanced(new THREE.CylinderGeometry(.075,.075,1.65,5),mats.black,posts);
  for(let i=0;i<720;i++){const x=rand()*1250-625,z=rand()*1250-625,n=track.nearest(x,z);if(n.d<48**2)continue;const y=landscapeHeight(x,z),h=8+rand()*14;trunks.push({x,y:y+h*.35,z,sx:.6,sy:h*.7,sz:.6});for(let j=0;j<3;j++)leaves.push({x,y:y+h*(.45+j*.21),z,sx:h*(.23-j*.045),sy:h*.45,sz:h*(.23-j*.045),ry:rand()*TAU,color:['#415c3e','#526a43','#61774c','#344f3c'][i%4]});}
  instanced(new THREE.CylinderGeometry(.45,.65,1,6),mats.bark,trunks);instanced(new THREE.ConeGeometry(1,1,9),new THREE.MeshStandardMaterial({color:'#c0c8a6',map:foliageTex,roughness:1}),leaves);
  for(let i=0;i<160;i++){const s=rand()*track.length,lane=(rand()>.5?1:-1)*(30+rand()*26),p=track.at(s,lane),scale=1+rand()*3;rocks.push({x:p.x,y:landscapeHeight(p.x,p.z)+scale*.4,z:p.z,sx:scale*1.3,sy:scale,sz:scale,ry:rand()*TAU});}
  instanced(new THREE.DodecahedronGeometry(1,0),mats.rock,rocks);
  for(let i=0;i<30;i++){
    const a=i/30*TAU,r=680+rand()*350,h=140+rand()*220,g=new THREE.ConeGeometry(130+rand()*100,h,24,12);const p=g.attributes.position;for(let j=0;j<p.count;j++){const x=p.getX(j),y=p.getY(j),z=p.getZ(j),fade=clamp((h/2-y)/45,0,1);p.setX(j,x+Math.sin(y*.044+x*.034+z*.02)*12*fade);p.setZ(j,z+Math.cos(y*.052-z*.037+x*.012)*14*fade);}g.computeVertexNormals();const m=mesh(g,new THREE.MeshStandardMaterial({map:rockTex,color:new THREE.Color().setHSL(.19,.1,.42+rand()*.18),roughness:1,flatShading:false}));m.position.set(Math.sin(a)*r,h/2-35,Math.cos(a)*r);m.rotation.y=rand()*TAU;
    const mountainColors=[];for(let j=0;j<p.count;j++){const snowy=p.getY(j)>h*.28+Math.sin(p.getX(j)*.07)*8;const shade=new THREE.Color(snowy?'#ecede4':'#9a9e8d');mountainColors.push(shade.r,shade.g,shade.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(mountainColors,3));m.material.vertexColors=true;
  }
  const water=mesh(new THREE.CircleGeometry(92,64),new THREE.MeshStandardMaterial({color:'#4c8583',metalness:.35,roughness:.2,transparent:true,opacity:.89}));water.rotation.x=-Math.PI/2;water.scale.y=.6;water.position.set(110,1,-70);water.castShadow=false;
  for(let i=0;i<12;i++){const ring=mesh(new THREE.RingGeometry(20+i*5,20.14+i*5,64),new THREE.MeshBasicMaterial({color:'#bed2be',transparent:true,opacity:.16,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.scale.y=.6;ring.position.set(110,1.03,-70);ring.castShadow=false;}
}
scenery();
function labelTexture(text,bg='#1d2c23',fg='#f0eedb',w=1024,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.font=`800 ${h*.53}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h*.53);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function signAt(s,text,color='#eddbb9'){
  const p=track.at(s,-17.5),g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=p.heading;scene.add(g);box(.2,4,.2,mats.metal,0,2,0,g);box(5,1.4,.16,new THREE.MeshStandardMaterial({map:labelTexture(text,'#23342a',color),roughness:.8}),0,3.8,0,g);
}
signAt(track.moguls[0]-24,'SLOW / MOGULS');track.ramps.forEach(r=>signAt(r.s-24,'JUMP  ↗','#fa8956'));track.pits.forEach(p=>signAt(p.s-18,'!  DEEP RUT'));
// Compacted launch lanes, tire grooves and edge flags make each dirt ramp legible at speed.
const flagMaterial=new THREE.MeshStandardMaterial({color:'#fa6837',side:THREE.DoubleSide});
for(const r of track.ramps){
  for(const d of [-r.length+2,-10,0])for(const side of [-1,1]){const p=track.at(r.s+d,r.lane+side*5.3),y=track.groundHeight(p.x,p.z);box(.08,1.5,.08,mats.metal,p.x,y+.75,p.z);const flag=mesh(new THREE.PlaneGeometry(.7,.45),flagMaterial);flag.position.set(p.x,y+1.35,p.z);flag.rotation.y=p.heading;}
}
const startPoint=track.at(0,0),gantry=new THREE.Group();gantry.position.set(startPoint.x,startPoint.y,startPoint.z);gantry.rotation.y=startPoint.heading;scene.add(gantry);
// Sample the actual rendered shoulder beneath each pole, excluding barriers.
const supportRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
for(const side of [-1,1]){
  const lane=side*15.3,p=track.at(0,lane);let bottom=Infinity;
  for(const dx of [-.3,.3])for(const dz of [-.3,.3]){
    supportRay.ray.origin.set(p.x+Math.cos(p.heading)*dx+Math.sin(p.heading)*dz,100,p.z-Math.sin(p.heading)*dx+Math.cos(p.heading)*dz);
    const hit=supportRay.intersectObjects(terrainMeshes,false)[0];bottom=Math.min(bottom,hit?hit.point.y:track.groundHeight(p.x,p.z));
  }
  bottom-=.25;const top=startPoint.y+9;
  box(.6,top-bottom,.6,mats.metal,lane,(top+bottom)/2-startPoint.y,0,gantry);
}
box(31,2,.55,new THREE.MeshStandardMaterial({map:labelTexture('DUSTLINE   /   RALLY','#1d2c23','#f0eedb',2048,128),roughness:.8}),0,8.4,0,gantry);
const checkCanvas=document.createElement('canvas');checkCanvas.width=128;checkCanvas.height=32;const cc=checkCanvas.getContext('2d');for(let i=0;i<16;i++)for(let j=0;j<4;j++){cc.fillStyle=(i+j)%2?'#c9c4ab':'#3a382b';cc.fillRect(i*8,j*8,8,8);}const checkTex=new THREE.CanvasTexture(checkCanvas);checkTex.colorSpace=THREE.SRGBColorSpace;
function finishStripeGeometry(surface){
  const positions=[],uv=[],p=surface.attributes.position,t=surface.attributes.uv,indices=surface.index.array;
  // Clip the existing road triangles at the stripe edges, preserving their
  // exact slopes/diagonals instead of approximating the road with a flat decal.
  for(let i=0;i<indices.length;i+=3){
    let triangle=Array.from(indices.slice(i,i+3),k=>[p.getX(k),p.getY(k),p.getZ(k),t.getX(k)/4,t.getY(k)*9]);
    if(triangle.every(v=>v[4]>1&&v[4]<track.length-1))continue;
    if(triangle[0][4]>track.length/2)triangle=triangle.map(v=>[...v.slice(0,4),v[4]-track.length]);
    for(const [edge,direction]of [[-1,1],[1,-1]]){
      const clipped=[];
      for(let j=0;j<triangle.length;j++){
        const a=triangle[j],b=triangle[(j+1)%triangle.length],insideA=(a[4]-edge)*direction>=0,insideB=(b[4]-edge)*direction>=0;
        if(insideA)clipped.push(a);
        if(insideA!==insideB){const f=(edge-a[4])/(b[4]-a[4]);clipped.push(a.map((v,k)=>lerp(v,b[k],f)));}
      }
      triangle=clipped;
    }
    for(let j=1;j<triangle.length-1;j++)for(const v of [triangle[0],triangle[j],triangle[j+1]]){positions.push(v[0],v[1]+.025,v[2]);uv.push(v[3],(v[4]+1)/2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
const line=mesh(finishStripeGeometry(road.geometry),new THREE.MeshStandardMaterial({map:checkTex,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));line.castShadow=false;

function mergeStaticParts(group,exclude=[]){
  const byMaterial=new Map();
  for(const child of [...group.children])if(child.isMesh&&!exclude.includes(child)){child.updateMatrix();const list=byMaterial.get(child.material)||[];list.push(child);byMaterial.set(child.material,list);}
  for(const [material,parts]of byMaterial)if(parts.length>1){const geometries=parts.map(p=>(p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone()).applyMatrix4(p.matrix));const merged=mergeGeometries(geometries);if(merged){parts.forEach(p=>group.remove(p));mesh(merged,material,group);}geometries.forEach(g=>g.dispose());}
}
// Fitted four-corner panels keep glass, decals and bodywork on the same surfaces.
function carPanel(points,material,parent){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const m=mesh(geo,material,parent);m.material.side=THREE.DoubleSide;return m;}
function carBar(a,b,r,material,parent){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),7),material,parent);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
function buildCar(color,id,ghost=false){
  const g=new THREE.Group(),paint=new THREE.MeshPhysicalMaterial({color,metalness:.32,roughness:.3,clearcoat:.8}),white=new THREE.MeshStandardMaterial({color:'#eeeadd',metalness:.2,roughness:.4});
  // The lower silhouette has real wheel openings rather than a box through the tires.
  const outline=new THREE.Shape();outline.moveTo(-2.15,-.30);outline.lineTo(-2.15,.29);outline.lineTo(-1.5,.43);outline.lineTo(1.1,.46);outline.lineTo(2.15,.30);outline.lineTo(2.15,-.30);outline.lineTo(2.01,-.30);outline.absarc(1.4,-.30,.61,0,Math.PI,false);outline.lineTo(-.83,-.30);outline.absarc(-1.44,-.30,.61,0,Math.PI,false);outline.closePath();
  const bodyGeo=new THREE.ExtrudeGeometry(outline,{depth:1.92,bevelEnabled:true,bevelThickness:.06,bevelSize:.055,bevelSegments:3,steps:1,curveSegments:20});bodyGeo.rotateY(-Math.PI/2);bodyGeo.translate(.96,0,0);mesh(bodyGeo,paint,g);
  box(1.43,.12,3.6,mats.black,0,-.27,0,g);
  box(1.58,.08,1.40,paint,0,1.19,-.16,g);
  // Front slopes back toward the roof; rear slopes forward toward the roof.
  const glass=mats.glass.clone();glass.color.set('#6d8d91');glass.opacity=.58;glass.side=THREE.DoubleSide;
  carPanel([[-.94,.49,1.18],[.94,.49,1.18],[.77,1.15,.53],[-.77,1.15,.53]],glass,g);
  carPanel([[.94,.46,-1.60],[-.94,.46,-1.60],[-.77,1.15,-.85],[.77,1.15,-.85]],glass,g);
  for(const side of [-1,1]){
    const x=side*.955,xt=side*.78;
    carPanel([[x,.47,-1.5],[x,.49,1.11],[xt,1.13,.49],[xt,1.13,-.81]],glass,g);
    carBar([x,.47,-1.59],[xt,1.17,-.85],.055,paint,g);carBar([x,.49,1.2],[xt,1.17,.53],.055,paint,g);
    carBar([x,.48,-.35],[xt,1.16,-.35],.045,mats.black,g);carBar([x,.47,-1.59],[x,.49,1.2],.038,mats.black,g);
    carBar([xt,1.17,-.85],[xt,1.17,.53],.035,paint,g);
    box(.06,.10,1.52,white,side*1.038,-.18,-.04,g);
    box(.22,.15,.31,paint,side*1.14,.61,.89,g);box(.012,.105,.23,mats.metal,side*1.254,.61,.875,g);
    box(.027,.055,.23,mats.black,side*1.045,.34,-.47,g);
    // Number and sponsor occupy their own clear door panel, with stripes below.
    const decal=new THREE.MeshStandardMaterial({map:labelTexture(String(id+7).padStart(2,'0'),'#eee8d4','#172820',256,256),roughness:.7});
    const num=mesh(new THREE.PlaneGeometry(.64,.50),decal,g);num.position.set(side*1.044,.13,-.05);num.rotation.y=side*Math.PI/2;
    const sponsor=mesh(new THREE.PlaneGeometry(.65,.13),new THREE.MeshStandardMaterial({map:labelTexture('DUSTLINE','#182b24','#eee8d4',512,100)}),g);sponsor.position.set(side*1.075,-.19,-.04);sponsor.rotation.y=side*Math.PI/2;
    const name=mesh(new THREE.PlaneGeometry(.55,.10),new THREE.MeshBasicMaterial({map:labelTexture(DRIVERS[id],'#17231f','#efedde',512,90),side:THREE.DoubleSide}),g);name.position.set(side*.91,.69,-.85);name.rotation.y=side*Math.PI/2;
    for(const z of [-1.44,1.4]){const arch=mesh(new THREE.TorusGeometry(.63,.055,6,28,Math.PI),paint,g);arch.rotation.y=Math.PI/2;arch.position.set(side*1.035,-.30,z);const trim=mesh(new THREE.TorusGeometry(.595,.028,5,28,Math.PI),mats.black,g);trim.rotation.y=Math.PI/2;trim.position.set(side*1.05,-.30,z);box(.30,.29,.035,mats.black,side*1.03,-.54,z-.48,g);}
    box(.10,.75,.12,paint,side*.80,.76,-1.70,g);
  }
  carBar([-.77,1.16,.54],[.77,1.16,.54],.035,mats.black,g);carBar([-.94,.49,1.2],[.94,.49,1.2],.035,mats.black,g);
  carBar([-.77,1.16,-.85],[.77,1.16,-.85],.035,paint,g);
  // Low roof scoop leaves a dedicated rear roof number clear.
  box(.46,.10,.34,paint,0,1.28,.27,g);box(.35,.055,.014,mats.black,0,1.27,.45,g);
  const roof=mesh(new THREE.PlaneGeometry(.66,.61),new THREE.MeshStandardMaterial({map:labelTexture(String(id+7).padStart(2,'0'),'#eee8d4','#172820',256,256)}),g);roof.rotation.x=-Math.PI/2;roof.position.set(0,1.236,-.43);
  carBar([.55,1.24,-.63],[.55,1.86,-.76],.009,mats.black,g);
  box(2.22,.10,.44,paint,0,1.15,-1.77,g);for(const side of [-1,1])box(.05,.25,.44,paint,side*1.08,1.19,-1.77,g);
  box(1.97,.16,.17,paint,0,-.17,2.15,g);box(1.90,.13,.16,paint,0,-.18,-2.15,g);
  box(1.12,.23,.025,mats.black,0,.055,2.177,g);box(.80,.10,.025,mats.black,0,.30,2.16,g);
  for(let i=-4;i<=4;i++)box(.012,.20,.029,mats.metal,i*.115,.05,2.193,g);
  const lamp=new THREE.MeshStandardMaterial({color:'#fff2bc',emissive:'#ffe8b5',emissiveIntensity:.5,roughness:.2}),red=new THREE.MeshStandardMaterial({color:'#bb271c',emissive:'#b52719',emissiveIntensity:.3});
  for(const side of [-1,1]){const light=mesh(new THREE.SphereGeometry(.24,16,10),lamp,g);light.scale.set(1,.58,.20);light.position.set(side*.76,.25,2.16);box(.27,.33,.07,red,side*.82,.17,-2.165,g);box(.25,.07,.015,lamp,side*.82,.16,-2.205,g);const fog=mesh(new THREE.CylinderGeometry(.095,.095,.04,12),lamp,g);fog.rotation.x=Math.PI/2;fog.position.set(side*.72,-.16,2.25);}
  const plate=mesh(new THREE.PlaneGeometry(.58,.14),new THREE.MeshStandardMaterial({map:labelTexture('RDX '+(id+7),'#eee8d4','#172820',512,128)}),g);plate.rotation.y=Math.PI;plate.position.set(0,.12,-2.17);
  const hood=mesh(new THREE.PlaneGeometry(.82,.36),new THREE.MeshStandardMaterial({map:labelTexture('DUSTLINE','#eee8d4','#172820',512,200)}),g);hood.rotation.x=-Math.PI/2+.10;hood.position.set(0,.414,1.58);
  for(const side of [-1,1]){carBar([side*.10,.53,1.17],[side*.68,.57,1.07],.012,mats.black,g);const pin=mesh(new THREE.SphereGeometry(.028,8,6),mats.metal,g);pin.position.set(side*.72,.37,1.85);}
  // Two bucket seats, roll cage and instruments are visible through fitted glass.
  for(const x of [-.43,.43]){box(.50,.62,.18,mats.black,x,.58,-.40,g);box(.51,.12,.49,mats.black,x,.29,-.17,g);box(.27,.20,.15,mats.black,x,.94,-.40,g);for(const sx of [-.12,.12])box(.045,.5,.015,white,x+sx,.61,-.30,g);}
  for(const side of [-1,1]){carBar([side*.69,.18,-.8],[side*.69,1.06,-.8],.025,white,g);carBar([side*.69,1.06,-.8],[side*.69,.30,.9],.025,white,g);}
  carBar([-.69,1.06,-.8],[.69,1.06,-.8],.025,white,g);carBar([-.69,.2,-.8],[.69,1.06,-.8],.025,white,g);
  box(1.60,.18,.34,mats.black,0,.55,.66,g);box(.44,.08,.31,mats.black,0,.18,0,g);
  const steering=mesh(new THREE.TorusGeometry(.19,.026,8,24),mats.black,g);steering.position.set(-.4,.67,.48);steering.rotation.x=-.35;
  for(const x of [-.51,-.34]){const dial=mesh(new THREE.CircleGeometry(.06,16),white,g);dial.rotation.y=Math.PI;dial.position.set(x,.65,.478);}
  const wheels=[];for(const x of [-1.02,1.02])for(const z of [-1.44,1.4]){const pivot=new THREE.Group();pivot.position.set(x,-.34,z);g.add(pivot);const tire=mesh(new THREE.CylinderGeometry(.46,.46,.32,24),mats.rubber,pivot);tire.rotation.z=Math.PI/2;const hub=mesh(new THREE.CylinderGeometry(.28,.28,.335,20),mats.black,pivot);hub.rotation.z=Math.PI/2;const side=Math.sign(x);for(let j=0;j<8;j++){const a=j*TAU/8,spoke=box(.025,.06,.235,white,side*.175,Math.sin(a)*.14,Math.cos(a)*.14,pivot);spoke.rotation.x=-a;}const cap=mesh(new THREE.CylinderGeometry(.08,.08,.35,12),mats.metal,pivot);cap.rotation.z=Math.PI/2;wheels.push({pivot,tire,hub,front:z>0});}
  mergeStaticParts(g,[steering]);wheels.forEach(w=>mergeStaticParts(w.pivot,[w.tire,w.hub]));
  if(ghost)g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.23;o.material.depthWrite=false;o.material.color.set('#9af4df');o.castShadow=false;}});
  g.userData={wheels,paint,steering};scene.add(g);return g;
}

const carMeshes=CAR_COLORS.map((color,i)=>buildCar(color,i));
const ghostMesh=buildCar('#a6ffe7',0,true);ghostMesh.visible=false;
const pickupMeshes=[];
function rebuildPickups(){pickupMeshes.forEach(m=>scene.remove(m));pickupMeshes.length=0;for(const p of sim.pickups){const color={gem:'#aaf4d6',nitro:'#ff914b',shield:'#79c8ff',repair:'#a5e070'}[p.kind],g=new THREE.Group(),m=mesh(new THREE.OctahedronGeometry(p.kind==='gem'?1.05:.75),new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.13,emissive:color,emissiveIntensity:.6}),g);const ring=mesh(new THREE.TorusGeometry(1.6,.045,6,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6}),g);ring.rotation.x=Math.PI/2;const at=track.at(p.s,p.lane);g.position.set(at.x,p.y,at.z);g.userData.spin=m;scene.add(g);pickupMeshes.push(g);}}
const dustCount=550,dustPositions=new Float32Array(dustCount*3),dustColors=new Float32Array(dustCount*3),dustParticles=Array.from({length:dustCount},()=>({life:0,x:0,y:-100,z:0,vx:0,vy:0,vz:0}));let dustCursor=0;
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));dustGeo.setAttribute('color',new THREE.BufferAttribute(dustColors,3));const dustCanvas=document.createElement('canvas');dustCanvas.width=dustCanvas.height=64;const dc=dustCanvas.getContext('2d'),grad=dc.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,.38)');grad.addColorStop(1,'rgba(255,255,255,0)');dc.fillStyle=grad;dc.fillRect(0,0,64,64);
const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({size:3,map:new THREE.CanvasTexture(dustCanvas),transparent:true,opacity:.45,depthWrite:false,vertexColors:true}));dust.frustumCulled=false;scene.add(dust);
function emitDust(c){const p=dustParticles[dustCursor++%dustCount];p.life=1.2+rand();p.x=c.x-Math.sin(c.heading)*2+(rand()-.5)*2;p.y=c.y-.4;p.z=c.z-Math.cos(c.heading)*2+(rand()-.5)*2;p.vx=-c.vx*.07+(rand()-.5)*2;p.vz=-c.vz*.07+(rand()-.5)*2;p.vy=.7+rand();}
function updateDust(dt){dustParticles.forEach((p,i)=>{p.life-=dt;if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}dustPositions[i*3]=p.x;dustPositions[i*3+1]=p.life>0?p.y:-100;dustPositions[i*3+2]=p.z;const f=clamp(p.life,0,1);dustColors[i*3]=.65*f;dustColors[i*3+1]=.49*f;dustColors[i*3+2]=.29*f;});dustGeo.attributes.position.needsUpdate=true;dustGeo.attributes.color.needsUpdate=true;}

class RallyAudio {
  constructor(){this.enabled=false;this.ctx=null;this.engine=new Audio('https://assets.codepen.io/5126815/engine.wav');this.music=new Audio('https://assets.codepen.io/5126815/music.mp3');this.engine.loop=this.music.loop=true;this.engine.preservesPitch=false;this.engine.volume=0;this.music.volume=.12;this.failed=false;this.engine.addEventListener('error',()=>{this.failed=true;});}
  async toggle(){this.enabled=!this.enabled;if(this.enabled){try{this.ctx??=new(window.AudioContext||window.webkitAudioContext)();await this.ctx.resume();if(!this.osc){this.osc=this.ctx.createOscillator();this.gain=this.ctx.createGain();this.osc.type='sawtooth';this.gain.gain.value=0;this.osc.connect(this.gain).connect(this.ctx.destination);this.osc.start();const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let j=0;j<data.length;j++)data[j]=Math.random()*2-1;this.noise=this.ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;this.skid=this.ctx.createGain();this.skid.gain.value=0;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1200;this.noise.connect(filter).connect(this.skid).connect(this.ctx.destination);this.noise.start();}await Promise.allSettled([this.engine.play(),this.music.play()]);}catch{toast('Audio unavailable in this browser');}}else{this.engine.pause();this.music.pause();if(this.gain)this.gain.gain.value=0;if(this.skid)this.skid.gain.value=0;}$('sound').innerHTML=`♫ <span>${this.enabled?'ON':'OFF'}</span>`;}
  update(c){if(!this.enabled)return;const active=phase==='racing',speed=Math.hypot(c.vx,c.vz);this.engine.volume=active?.12+c.input.throttle*.08:.035;this.engine.playbackRate=clamp(.6+speed*.028,.5,2.3);if(this.gain){this.gain.gain.setTargetAtTime(active&&this.failed?.022:0,this.ctx.currentTime,.1);this.osc.frequency.setTargetAtTime(35+speed*2,this.ctx.currentTime,.1);}if(this.skid)this.skid.gain.setTargetAtTime(active&&c.grounded?Math.min(.045,speed*.00025+c.drift*.002):0,this.ctx.currentTime,.1);this.music.volume=phase==='paused'?0:.09;}
  fx(kind){if(!this.enabled||!this.ctx)return;const ctx=this.ctx,o=ctx.createOscillator(),g=ctx.createGain();o.connect(g).connect(ctx.destination);const start={pickup:660,achievement:880,count:440,crash:75,land:48}[kind]||330;o.type=kind==='crash'||kind==='land'?'triangle':'sine';o.frequency.setValueAtTime(start,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='pickup'?1100:Math.max(25,start*.4),ctx.currentTime+.22);g.gain.setValueAtTime(kind==='crash'?.16:.06,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.28);o.start();o.stop(ctx.currentTime+.3);}
}
const sound=new RallyAudio();
const keys=new Set(),touch=new Set();
function clearInput(){keys.clear();touch.clear();document.querySelectorAll('[data-input]').forEach(b=>b.classList.remove('active'));}
function playerInput(){return {throttle:keys.has('KeyW')||keys.has('ArrowUp')||touch.has('throttle')?1:0,brake:keys.has('KeyS')||keys.has('ArrowDown')||touch.has('brake')?1:0,steer:(keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right')?1:0),drift:keys.has('Space')||touch.has('drift'),boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.has('boost')};}
// Looking along +Z, a driver's left is +X in world space.
addEventListener('keydown',e=>{if(e.target.matches('input,select')&&e.code!=='Escape')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyC')switchCamera();if(e.code==='KeyR'&&phase==='racing')sim.recover(sim.cars[0]);if(e.code==='Escape'||e.code==='KeyP')togglePause();if(e.code==='KeyM')sound.toggle();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{clearInput();if(phase==='racing'||phase==='countdown')togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(phase==='racing'||phase==='countdown')togglePause();}});
document.querySelectorAll('[data-input]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.input);b.classList.add('active');});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{touch.delete(b.dataset.input);b.classList.remove('active');});});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{settings.mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('difficulty').disabled=settings.mode==='trial';});
document.querySelectorAll('[data-laps]').forEach(b=>b.onclick=()=>{settings.laps=Number(b.dataset.laps);document.querySelectorAll('[data-laps]').forEach(x=>x.classList.toggle('selected',x===b));});
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{settings.color=Number(b.dataset.color);carMeshes[0].userData.paint.color.set(CAR_COLORS[settings.color]);document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('selected',x===b));});
$('difficulty').onchange=e=>settings.difficulty=e.target.value;$('sound').onclick=()=>sound.toggle();$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen unavailable here. Open the game in its own tab.');}};
$('camera').onclick=()=>switchCamera();$('replay-camera').onclick=()=>switchCamera();$('reset').onclick=()=>{if(phase==='racing')sim.recover(sim.cars[0]);};$('menu-button').onclick=()=>togglePause();document.querySelector('.brand').onclick=e=>{e.preventDefault();if(phase==='racing'||phase==='countdown')togglePause();};
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');toastTimer=3.4;}
function timeFormat(t){if(!Number.isFinite(t))return '—';const ms=Math.floor(t*1000);return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
function setVisible(id,yes){$(id).classList.toggle('hidden',!yes);}
function menuVisible(yes){for(const id of ['menu','track-card','menu-footer'])setVisible(id,yes);document.body.classList.toggle('playing',!yes);setVisible('menu-button',!yes);}
function resetSimulation(){carMeshes[0].userData.paint.color.set(CAR_COLORS[settings.color]);sim=new RallySimulation(track,settings);carMeshes.forEach((m,i)=>m.visible=i<sim.cars.length);rebuildPickups();}
function startRace(){document.body.classList.remove('replaying','result-open');resetSimulation();phase='countdown';countdown=3.3;accumulator=0;recording=[];recordTimer=0;clearInput();menuVisible(false);setVisible('hud',true);setVisible('modal',false);setVisible('replay-bar',false);setVisible('countdown',true);cameraMode=0;cameraLabel();orbit.enabled=false;const savedBest=storage.get('best:'+bestKey());cachedBestTime=savedBest?.time??null;ghostData=$('ghost-toggle').checked?savedBest:null;if(!ghostData?.frames?.length)ghostData=null;ghostMesh.visible=!!ghostData;recordFrame();updateHud();updateCarMeshes();updateCamera(1,true);}
$('start').onclick=startRace;
let pausedFrom='racing';
function modal(eyebrow,title,body,actions){$('modal-eyebrow').textContent=eyebrow;$('modal-title').textContent=title;$('modal-body').innerHTML=body;$('modal-actions').replaceChildren();actions.forEach(([text,fn,primary])=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;if(primary)b.className='primary';$('modal-actions').appendChild(b);});setVisible('modal',true);}
function togglePause(){if(phase==='paused'){phase=pausedFrom;setVisible('modal',false);return;}if(!['racing','countdown'].includes(phase))return;pausedFrom=phase;phase='paused';clearInput();modal('TAKE A BREATHER','PAUSED.',`<p>WASD / arrows to drive · Space to drift · Shift to boost<br>C switches cameras · R recovers your car<br>Overview: drag to orbit, scroll or pinch to zoom.</p><p>Mint gems above jumps give four seconds of speed. Orange refills boost, blue shields impacts, and green repairs your car.</p>`,[['RESUME ↗',togglePause,true],['RESTART SESSION',startRace],['BACK TO PADDOCK',backToMenu]]);}
function backToMenu(){if(phase==='finishing')saveReplay();document.body.classList.remove('replaying','result-open');if(phase==='replay'&&replayMenuSettings){Object.assign(settings,replayMenuSettings);replayMenuSettings=null;}phase='menu';menuVisible(true);for(const id of ['hud','modal','countdown','replay-bar'])setVisible(id,false);ghostMesh.visible=false;orbit.enabled=false;resetSimulation();clearInput();$('watch-menu').disabled=!lastReplay;}
function cameraLabel(){$('camera').innerHTML=`◉ <span>${['CHASE','DRIVER','OVERVIEW','FINISH'][cameraMode]}</span><kbd>C</kbd>`;}
function switchCamera(){if(phase==='menu')return;cameraMode=(cameraMode+1)%(sim.cars[0].finished?4:3);orbit.enabled=cameraMode===2;if(orbit.enabled){const c=sim.cars[0];camera.position.set(c.x+40,c.y+65,c.z-40);orbit.target.set(c.x,c.y,c.z);orbitAnchor.set(c.x,c.y,c.z);orbit.enablePan=false;camera.up.set(0,1,0);camera.fov=60;camera.updateProjectionMatrix();orbit.update();}cameraLabel();}
function recordFrame(){const c=sim.cars;recording.push([+sim.time.toFixed(3),...c.flatMap(c=>[c.x,c.y,c.z,c.heading,c.pitch,c.roll,Math.hypot(c.vx,c.vz),c.lap,c.progress,c.qx,c.qy,c.qz,c.qw,...c.wheelState.map(w=>w.suspensionLength),...c.wheelState.map(w=>w.rotation),c.wheelState[1].steering].map(v=>+v.toFixed(4)))]);}
function saveReplay(){recordFrame();lastReplay={version:TRACK_VERSION,options:{...settings},duration:sim.time,playerFinishTime:sim.cars[0].finishTime,results:sim.cars.map(c=>({finishTime:c.finishTime,lapTimes:[...c.lapTimes],achievements:[...c.achievements],driftDistance:c.driftDistance,totalAir:c.totalAir})),frames:[...recording]};persistReplay(lastReplay).then(saved=>{if(!saved)toast('Replay kept for this session; browser storage is full.');});}
function showFinishPanel(replaying=false){
  const c=sim.cars[0],result=replaying?lastReplay.results?.[0]:c,finishTime=result?.finishTime??lastReplay?.playerFinishTime??sim.time,rank=sim.standings().findIndex(c=>c.id===0)+1;
  const waiting=sim.cars.filter(c=>!c.finished).length;
  document.body.classList.add('result-open');cameraMode=3;cameraLabel();orbit.enabled=false;
  modal(replaying?'RACE REPLAY':'CHEQUERED FLAG',settings.mode==='trial'?'TIME SET.':rank===1?'VICTORY.':`P${rank}. FINISHED.`,
    `<div class="result-row"><span>Your time</span><strong>${timeFormat(finishTime)}</strong></div>${(result?.lapTimes||[]).map((t,i)=>`<div class="result-row"><span>Lap ${i+1}</span><span>${timeFormat(t)}</span></div>`).join('')}<p id="finish-status">${waiting?`${waiting} rival${waiting===1?'':'s'} still racing — watch the finish.`:'All cars have finished.'}</p><p>${(result?.achievements||[]).join(' · ')}</p>`,
    replaying?[['CAMERA',switchCamera],['BACK TO PADDOCK',backToMenu]]:[['CAMERA / WATCH THE FIELD',switchCamera],['WATCH REPLAY',()=>{if(phase==='finishing')saveReplay();watchReplay();}],['RACE AGAIN ↗',()=>{if(phase==='finishing')saveReplay();startRace();},true],['BACK TO PADDOCK',backToMenu]]);
}
function finishRace(){
  const c=sim.cars[0];if(!c.finished)return;
  const already=phase==='finishing'||phase==='finished';phase=sim.finished?'finished':'finishing';saveReplay();
  if(!already){const old=storage.get('best:'+bestKey()),pb=!old||c.finishTime<old.time;
    if(pb){cachedBestTime=c.finishTime;storage.set('best:'+bestKey(),{time:c.finishTime,frames:recording.filter(f=>f[0]<=c.finishTime+.01).map(f=>f.slice(0,1+FRAME_STRIDE)),version:TRACK_VERSION});}
    const awards=storage.get('achievements',[]);storage.set('achievements',[...new Set([...awards,...c.achievements])]);
  }
  showFinishPanel();const replayButton=[...$('modal-actions').children].find(b=>b.textContent==='WATCH REPLAY');if(replayButton){replayButton.disabled=!sim.finished;if(!sim.finished)replayButton.textContent='REPLAY / WAITING FOR THE FIELD';}
}
function watchReplay(){if(!lastReplay)return;document.body.classList.remove('result-open');document.body.classList.add('replaying');replayMenuSettings={...settings};Object.assign(settings,lastReplay.options);cachedBestTime=storage.get('best:'+bestKey())?.time??null;carMeshes[0].userData.paint.color.set(CAR_COLORS[settings.color]);resetSimulation();phase='replay';replayTime=0;replayRate=1;replayPaused=false;$('replay-pause').textContent='Ⅱ';$('replay-pause').setAttribute('aria-label','Pause replay');$('replay-speed').textContent='1×';cameraMode=0;cameraLabel();orbit.enabled=false;menuVisible(false);setVisible('modal',false);setVisible('hud',true);setVisible('countdown',false);setVisible('replay-bar',true);ghostMesh.visible=false;}
$('replay-pause').onclick=()=>{replayPaused=!replayPaused;$('replay-pause').textContent=replayPaused?'▶':'Ⅱ';$('replay-pause').setAttribute('aria-label',replayPaused?'Play replay':'Pause replay');};
$('watch-menu').onclick=watchReplay;$('exit-replay').onclick=backToMenu;$('replay-speed').onclick=()=>{replayRate=replayRate===1?2:replayRate===2?.5:1;$('replay-speed').textContent=`${replayRate}×`;};$('replay-scrub').oninput=e=>replayTime=Number(e.target.value)/1000*lastReplay.duration;
function framePair(frames,t){let lo=0,hi=frames.length-1;while(lo<hi-1){const mid=(lo+hi)>>1;if(frames[mid][0]<=t)lo=mid;else hi=mid;}const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)];return {a,b,f:clamp((t-a[0])/Math.max(.001,b[0]-a[0]),0,1)};}
const replayQuaternionA=new THREE.Quaternion(),replayQuaternionB=new THREE.Quaternion();
function transformFrame(object,a,b,f,offset){
  object.position.set(lerp(a[offset],b[offset],f),lerp(a[offset+1],b[offset+1],f),lerp(a[offset+2],b[offset+2],f));
  replayQuaternionA.set(a[offset+9],a[offset+10],a[offset+11],a[offset+12]).normalize();replayQuaternionB.set(b[offset+9],b[offset+10],b[offset+11],b[offset+12]).normalize();
  object.quaternion.copy(replayQuaternionA).slerp(replayQuaternionB,f);
  object.userData.wheels.forEach((w,j)=>{w.pivot.position.y=.1-lerp(a[offset+13+j],b[offset+13+j],f);w.pivot.rotation.set(lerp(a[offset+17+j],b[offset+17+j],f),w.front?lerp(a[offset+21],b[offset+21],f):0,0,'YXZ');});
}
function renderReplay(dt){replayTime=Math.min(lastReplay.duration,replayTime+(replayPaused?0:dt*replayRate));const {a,b,f}=framePair(lastReplay.frames,replayTime);sim.time=replayTime;sim.cars.forEach((c,i)=>{const o=1+i*FRAME_STRIDE;transformFrame(carMeshes[i],a,b,f,o);c.x=carMeshes[i].position.x;c.y=carMeshes[i].position.y;c.z=carMeshes[i].position.z;c.heading=a[o+3]+angle(b[o+3]-a[o+3])*f;c.vx=Math.sin(c.heading)*lerp(a[o+6],b[o+6],f);c.vz=Math.cos(c.heading)*lerp(a[o+6],b[o+6],f);c.lap=a[o+7];c.finished=c.lap>=settings.laps;if(c.finished)c.finishTime=lastReplay.results?.[i]?.finishTime??replayTime;if(!c.finished)c.finishTime=null;c.progress=lerp(a[o+8],b[o+8],f);c.s=track.nearest(c.x,c.z,c.s).s;});$('replay-scrub').value=replayTime/lastReplay.duration*1000;const show=sim.cars[0].finished;if(show&&!document.body.classList.contains('result-open'))showFinishPanel(true);if(!show){document.body.classList.remove('result-open');setVisible('modal',false);if(cameraMode===3)cameraMode=0;}updateFinishStatus();}
function updateCarMeshes(){for(const c of sim.cars){const m=carMeshes[c.id];m.position.set(c.x,c.y,c.z);m.quaternion.set(c.qx,c.qy,c.qz,c.qw);for(const [j,w]of m.userData.wheels.entries()){const state=c.wheelState[j];w.pivot.position.y=.1-state.suspensionLength;w.pivot.rotation.set(state.rotation,state.steering,0,'YXZ');}m.userData.steering.rotation.z=-c.steer*.7;}}
const lookTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),orbitAnchor=new THREE.Vector3();
function updateCamera(dt,snap=false){
  const c=sim.cars[0];
  if(phase==='menu'){const p=track.at(-8,-3.5);desiredCamera.set(p.x+17+Math.sin(renderTime*.055)*1.5,p.y+6.3,p.z-17);camera.position.lerp(desiredCamera,snap?1:1-Math.exp(-dt*2));camera.lookAt(p.x-4,p.y-.4,p.z+11);camera.fov=53;camera.updateProjectionMatrix();return;}
  if(cameraMode===3){const p=track.at(-32,30),focus=track.at(-5,0);camera.up.set(0,1,0);desiredCamera.set(p.x,p.y+20,p.z);camera.position.lerp(desiredCamera,snap?1:1-Math.exp(-dt*4));camera.lookAt(focus.x,focus.y+1,focus.z);camera.fov=65;camera.updateProjectionMatrix();return;}
  if(cameraMode===2){lookTarget.set(c.x,c.y,c.z);desiredCamera.copy(lookTarget).sub(orbitAnchor);camera.position.add(desiredCamera);orbit.target.add(desiredCamera);orbitAnchor.copy(lookTarget);orbit.update();return;}
  const fx=Math.sin(c.heading),fz=Math.cos(c.heading),speed=Math.hypot(c.vx,c.vz);
  if(cameraMode===1){const m=carMeshes[0];desiredCamera.set(-.39,1.05,.15).applyMatrix4(m.matrixWorld);camera.position.copy(desiredCamera);lookTarget.set(-.39,.55,24).applyMatrix4(m.matrixWorld);camera.up.set(0,1,0).applyQuaternion(m.quaternion);camera.lookAt(lookTarget);camera.fov=80;}
  else{camera.up.set(0,1,0);desiredCamera.set(c.x-fx*(10+speed*.075),c.y+5.3+speed*.025,c.z-fz*(10+speed*.075));const ground=track.surface(desiredCamera.x,desiredCamera.z,c.s).y;desiredCamera.y=Math.max(desiredCamera.y,ground+2.2);camera.position.lerp(desiredCamera,snap?1:1-Math.exp(-dt*5));lookTarget.set(c.x+fx*9,c.y+1.3,c.z+fz*9);camera.lookAt(lookTarget);camera.fov=lerp(camera.fov,c.boostTime>0||c.input.boost?70:60,1-Math.exp(-dt*3));}
  camera.updateProjectionMatrix();
}
function mapDraw(canvas,active=false){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const scale=Math.min((w-35)/600,(h-22)/560),px=x=>w/2+(x-30)*scale,pz=z=>h/2+z*scale;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();track.points.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.closePath();ctx.strokeStyle=active?'#172a21':'#87978130';ctx.lineWidth=active?9:12;ctx.stroke();ctx.strokeStyle=active?'#c3cdb3':'#bdc8ac';ctx.lineWidth=active?3:3.5;ctx.stroke();for(const r of track.ramps){const p=track.at(r.s);ctx.fillStyle='#fb8650';ctx.beginPath();ctx.arc(px(p.x),pz(p.z),2.5,0,TAU);ctx.fill();}const start=track.at(0);ctx.fillStyle='#f6ead1';ctx.fillRect(px(start.x)-3,pz(start.z)-3,6,6);if(active)for(const c of [...sim.cars].reverse()){ctx.fillStyle=c.id?CAR_COLORS[c.id]:CAR_COLORS[settings.color];ctx.beginPath();ctx.arc(px(c.x),pz(c.z),c.id?3:4.5,0,TAU);ctx.fill();if(!c.id){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}}}
mapDraw($('preview-map'));$('track-length').textContent=(track.length/1000).toFixed(2);
function updateFinishStatus(){const el=$('finish-status');if(el){const n=sim.cars.filter(c=>!c.finished).length;el.textContent=n?`${n} rival${n===1?'':'s'} still racing — watch the finish.`:'All cars have finished.';}}
function updateHud(){updateFinishStatus();const c=sim.cars[0],speed=Math.hypot(c.vx,c.vz)*3.6,standings=sim.standings(),pos=standings.findIndex(c=>c.id===0)+1;
  $('position').innerHTML=settings.mode==='trial'?`TT<span>/ SOLO</span>`:`${pos}<span>/ 6</span>`;$('lap').innerHTML=`${Math.min(settings.laps,c.lap+1)}<span>/ ${settings.laps}</span>`;$('time').textContent=timeFormat(c.finished?c.finishTime:sim.time);$('speed').textContent=String(Math.round(speed)).padStart(3,'0');$('gear').textContent=speed<2?'N':String(Math.min(6,Math.floor(speed/32)+1));$('rpm').style.width=`${clamp(speed/185*100,0,100)}%`;$('nitro').style.width=`${c.boost}%`;$('nitro-percent').textContent=`${Math.round(c.boost)}%`;$('sector').textContent=track.sector(c.s);$('power-status').textContent=c.roofTime>0?'AUTO RECOVERY…':c.boostTime>0?`GEM BOOST / ${c.boostTime.toFixed(1)}s`:c.shield>0?`SHIELD / ${c.shield.toFixed(0)}s`:c.input.drift&&speed>15?'DRIFT / KEEP IT SIDEWAYS':c.damage>20?`DAMAGE ${Math.round(c.damage)}% / FIND REPAIR`:'4WD • GRAVEL SPEC';
  $('leaderboard').innerHTML=settings.mode==='race'?standings.map((r,i)=>`<div class="standing ${r.id===0?'you':''}"><b>${i+1}</b><i style="background:${CAR_COLORS[r.id===0?settings.color:r.id]}"></i>${DRIVERS[r.id]}<span>${r.id===0?'YOU':r.finished?'FIN':`${Math.round((r.progress-c.progress)/10)*10}m`}</span></div>`).join(''):'';$('best-time').textContent=`BEST ${cachedBestTime!==null?timeFormat(cachedBestTime):'—'}`;mapDraw($('minimap'),true);
}
function handleEvents(){for(const e of sim.events){if(e.id!==0)continue;if(e.type==='pickup'){sound.fx('pickup');toast({gem:'GEM COLLECTED / 4 SECONDS OF OVERDRIVE',nitro:'BOOST REFILLED +55%',shield:'SHIELD ACTIVE / 9 SECONDS',repair:'REPAIRED / BACK TO FULL POWER'}[e.kind]);}if(e.type==='achievement'){toast(`ACHIEVEMENT / ${e.name}`);sound.fx('achievement');}if(e.type==='recover')toast('BACK ON YOUR WHEELS');if(e.type==='land')sound.fx('land');if(e.type==='crash')sound.fx('crash');if(e.type==='lap'&&!sim.finished)toast(`LAP ${e.lap} / ${timeFormat(sim.cars[0].lapTimes.at(-1))}`);}}
function animate(timestamp){requestAnimationFrame(animate);const dt=Math.min((timestamp-lastTime)/1000||0,.05);lastTime=timestamp;renderTime+=dt;
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)setVisible('toast',false);}
  if(phase==='countdown'){const before=Math.ceil(countdown);countdown-=dt;if(Math.ceil(countdown)!==before)sound.fx('count');$('countdown').textContent=countdown>.3?Math.ceil(countdown-.3):'GO';if(countdown<=0){phase='racing';setVisible('countdown',false);}}
  if(phase==='racing'||phase==='finishing'){accumulator+=dt;const input=playerInput();while(accumulator>=DT){sim.step({0:input});handleEvents();accumulator-=DT;recordTimer+=DT;if(recordTimer>=.1){recordFrame();recordTimer-=.1;}if(sim.cars[0].finished&&phase==='racing')finishRace();if(sim.finished){finishRace();break;}}updateCarMeshes();for(const c of sim.cars)if(c.grounded&&Math.hypot(c.vx,c.vz)>5)for(let i=0;i<(c.input.drift?3:1);i++)emitDust(c);if(ghostData){const {a,b,f}=framePair(ghostData.frames,sim.time);transformFrame(ghostMesh,a,b,f,1);ghostMesh.visible=sim.time<=ghostData.time;}}
  else if(phase==='replay')renderReplay(dt);else if(phase==='menu'||phase==='countdown')updateCarMeshes();
  pickupMeshes.forEach((m,i)=>{m.visible=phase!=='replay'&&sim.pickups[i].cooldown<=0;m.userData.spin.rotation.y=renderTime*1.3;m.userData.spin.position.y=Math.sin(renderTime*2+i)*.2;});
  updateDust(dt);scene.updateMatrixWorld();updateCamera(dt);const c=sim.cars[0];sun.position.set(c.x-110,c.y+180,c.z-80);sun.target.position.set(c.x,c.y,c.z);sound.update(c);hudTimer+=dt;if(hudTimer>.1&&phase!=='menu'){hudTimer=0;updateHud();}renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(phase==='racing'||phase==='countdown')togglePause();toast('Graphics context lost. Reload to restart the engine.');});
resetSimulation();updateCarMeshes();updateCamera(1,true);$('start').disabled=false;$('start-label').textContent='HIT THE DIRT';
requestAnimationFrame(animate);
// Local validation hook is opt-in and absent from normal sessions.
if(new URLSearchParams(location.search).has('test')){
  window.RallyDebug={get sim(){return sim;},get phase(){return phase;},get cameraMode(){return cameraMode;},get lastReplay(){return lastReplay;},get ghostReady(){return !!ghostData;},get ghostVisible(){return ghostMesh.visible;},track,startRace,finishRace,watchReplay,backToMenu,settings,inspectCar(side=1){phase='inspection';menuVisible(false);setVisible('hud',false);setVisible('modal',false);document.body.classList.remove('result-open');cameraMode=2;orbit.enabled=true;orbit.enablePan=false;const c=sim.cars[0],m=carMeshes[0];m.updateMatrixWorld();camera.position.set(5,2.6,side*6).applyMatrix4(m.matrixWorld);orbit.target.set(c.x,c.y+.4,c.z);orbitAnchor.set(c.x,c.y,c.z);camera.up.set(0,1,0);camera.fov=42;camera.updateProjectionMatrix();orbit.update();},inspectRamp(){phase='inspection';menuVisible(false);setVisible('hud',false);setVisible('modal',false);setVisible('replay-bar',false);document.body.classList.remove('result-open');const r=track.ramps[0],eye=track.at(r.s-10,r.lane+19),focus=track.at(r.s-7,r.lane),c=sim.cars[0];cameraMode=2;orbit.enabled=true;orbit.enablePan=false;camera.position.set(eye.x,eye.y+8,eye.z);orbit.target.set(focus.x,focus.y+1,focus.z);orbitAnchor.set(c.x,c.y,c.z);camera.up.set(0,1,0);camera.fov=60;camera.updateProjectionMatrix();orbit.update();},step(n=1,ai=false){for(let i=0;i<n&&!sim.finished;i++){sim.step({0:ai?sim.ai(sim.cars[0]):playerInput()});if(i%12===0)recordFrame();}updateCarMeshes();updateHud();},setPhase(p){phase=p;},renderer};
  window.RallyDebug.inspectTerrain=(s=0,side=1,along=-24,elevation=7,lane=24)=>{
    phase='inspection';menuVisible(false);setVisible('hud',false);setVisible('modal',false);setVisible('replay-bar',false);document.body.classList.remove('result-open');
    const eye=track.at(s+along,side*lane),focus=track.at(s,s===0?0:side*13),c=sim.cars[0];
    cameraMode=2;orbit.enabled=true;orbit.enablePan=false;camera.position.set(eye.x,focus.y+elevation,eye.z);orbit.target.set(focus.x,focus.y+.6,focus.z);orbitAnchor.set(c.x,c.y,c.z);camera.up.set(0,1,0);camera.fov=60;camera.updateProjectionMatrix();orbit.update();
    sun.position.set(focus.x-110,focus.y+180,focus.z-80);sun.target.position.set(focus.x,focus.y,focus.z);
  };
  import('./tests/browser-qa.js');
}
