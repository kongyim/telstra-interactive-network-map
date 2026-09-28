import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/motion.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {morphVertex,spinDecay,easeOut,nearestAngle,FLAT_WIDTH,FLAT_HEIGHT}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('morph endpoints are an equirectangular plane and a unit sphere',()=>{
 for(let u=0;u<=1;u+=.125)for(let v=0;v<=1;v+=.125){
  const flat=morphVertex(u,v,0),sphere=morphVertex(u,v,1);
  assert.ok(Math.abs(flat[0]-(u-.5)*FLAT_WIDTH)<1e-12);
  assert.ok(Math.abs(flat[1]-(v-.5)*FLAT_HEIGHT)<1e-12);assert.ok(Math.abs(flat[2])<1e-12);
  assert.ok(Math.abs(Math.hypot(...sphere)-1)<1e-10);
 }
 assert.ok(Math.abs(morphVertex(.5,.5,1)[2]-1)<1e-10);
});
test('mesh deformation is finite and continuous for intermediate and reversed progress',()=>{
 for(const [u,v] of [[0,0],[.3,.7],[1,1],[.5,.5]]){
  for(let step=1;step<=100;step++){
   const current=morphVertex(u,v,step/100),previous=morphVertex(u,v,(step-1)/100);
   assert.ok(current.every(Number.isFinite));
   assert.ok(Math.hypot(...current.map((value,i)=>value-previous[i]))<.2);
  }
 }
});
test('release damping is refresh-rate independent and angle wrapping avoids dateline jumps',()=>{
 assert.ok(Math.abs(spinDecay(15)**4-spinDecay(60))<1e-12);
 assert.ok(spinDecay(1000)<.04);
 assert.ok(Math.abs(nearestAngle(-Math.PI+.01,Math.PI-.01)-(Math.PI+.01))<1e-12);
 assert.equal(easeOut(0),0);assert.equal(easeOut(1),1);assert.equal(easeOut(.5),.75);
});
