const fs=require('node:fs');
const path=require('node:path');
const CANNON=require('cannon-es');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8').split('// SIMULATION_CORE_BEGIN')[1].split('// SIMULATION_CORE_END')[0];
// Run the same engine code used by the browser, injecting the identical pinned engine.
module.exports=new Function('CANNON',source+';return {CANNON,DirtTrack,RallySimulation,DT,TRACK_VERSION};')(CANNON);
