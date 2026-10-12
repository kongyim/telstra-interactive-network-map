import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/drag-velocity.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {DragVelocity}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('stationary final events do not erase flick velocity',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(10,5,16);drag.add(10,5,32);drag.add(0,0,33);
 const [x,y]=drag.release(34);assert.ok(x>500);assert.equal(y,x/2);
});
test('holding still before release stops momentum',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(10,0,16);drag.add(0,0,400);
 assert.deepEqual(drag.release(401),[0,0]);
});
test('recent direction replaces old movement and reset cancels velocity',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(10,0,16);drag.add(-10,0,150);
 assert.ok(drag.release(151)[0]<0);drag.reset(152);assert.deepEqual(drag.release(153),[0,0]);
});
test('a single quick move after holding down still produces momentum',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(20,0,2000);
 assert.ok(drag.release(2001)[0]>300);
});

test('a delayed release fades instead of dropping a flick abruptly',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(20,10,16);
 const immediate=drag.release(20)[0],delayed=drag.release(180)[0];
 assert.ok(delayed>0&&delayed<immediate);
 assert.deepEqual(drag.release(400),[0,0]);
});

test('a quick reversal launches in the final direction instead of cancelling out',()=>{
 const drag=new DragVelocity();drag.reset(0);drag.add(20,0,16);drag.add(-20,0,32);
 assert.ok(drag.release(34)[0]<-500);
});
