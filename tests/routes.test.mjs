import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/lib/routes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {sampleRoute}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const dataset=JSON.parse(readFileSync(new URL('../public/data/network.json',import.meta.url),'utf8'));
test('eastbound and westbound dateline crossings split into matching edge endpoints',()=>{
 for(const path of [[[170,20],[190,40]],[[-170,20],[-190,40]]]){
  const pieces=sampleRoute(path);assert.equal(pieces.length,2);
  const a=pieces[0].at(-1),b=pieces[1][0];
  assert.equal(Math.abs(a[0]),180);assert.equal(a[0],-b[0]);assert.equal(a[1],b[1]);
 }
});
test('route samples are dense enough to hug the globe and never bridge the flat atlas',()=>{
 for(const route of dataset.connections){
  const pieces=sampleRoute(route.coordinates);
  assert.ok(pieces.length>0);
  for(const piece of pieces){
   assert.ok(piece.length>=2);
   piece.forEach(([lon,lat])=>{assert.ok(Math.abs(lon)<=180);assert.ok(Math.abs(lat)<=90);});
   for(let i=1;i<piece.length;i++)assert.ok(Math.hypot(piece[i][0]-piece[i-1][0],piece[i][1]-piece[i-1][1])<=1.00001);
  }
 }
});
