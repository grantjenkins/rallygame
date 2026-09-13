const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8').split('// REPLAY_STORAGE_BEGIN')[1].split('// REPLAY_STORAGE_END')[0];
const {encodeReplayForStorage,decodeReplayFromStorage}=new Function(source+';return {encodeReplayForStorage,decodeReplayFromStorage};')();
test('compressed replay round-trip preserves full car quaternions and suspension frames',async()=>{
  const replay={version:'cannon-test',duration:400,options:{mode:'race',laps:3},frames:Array.from({length:4000},(_,i)=>[i/10,...Array.from({length:132},(_,j)=>+(Math.sin(i*.07+j)*30).toFixed(4))])};
  const encoded=await encodeReplayForStorage(replay);assert.equal(encoded.encoding,'gzip-base64');assert.ok(JSON.stringify(encoded).length<JSON.stringify(replay).length*.75);assert.deepEqual(await decodeReplayFromStorage(encoded),replay);
});
test('legacy uncompressed replays load, and corrupt compressed data is rejected',async()=>{
  const plain={frames:[[0,1],[1,2]]};assert.deepEqual(await decodeReplayFromStorage(plain),plain);assert.equal(await decodeReplayFromStorage({encoding:'gzip-base64',data:'invalid'}),null);
});
