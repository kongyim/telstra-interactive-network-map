import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 for(const scenario of ['desktop','mobile','quick-access','reduced-motion']){
  const page=await browser.newPage({viewport:scenario==='mobile'?{width:390,height:844}:{width:1440,height:900},reducedMotion:scenario==='reduced-motion'?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3000');
  await page.waitForFunction(()=>document.querySelector('.map-canvas')?.getAttribute('data-status')==='ready');
  await page.locator('canvas[data-renderer="three"]').evaluate(el=>el.dataset.entryIdentity='same-globe');
  await page.evaluate(()=>{
   window.entryFrames=[];
   const sample=()=>{
    const shell=document.querySelector('.app-shell');const canvas=document.querySelector('.map-canvas');const r=canvas.getBoundingClientRect();
    window.entryFrames.push({phase:shell.dataset.entry,center:r.y+r.height/2,height:r.height,width:r.width,status:canvas.dataset.status});
    if(shell.dataset.entry!=='complete')requestAnimationFrame(sample);
   };
   requestAnimationFrame(sample);
  });
  if(scenario==='quick-access')await page.getByRole('combobox',{name:'Quick access',exact:true}).selectOption('Japan');
  else await page.getByRole('button',{name:'ENTER',exact:true}).click();
  if(scenario==='desktop'){
   await page.waitForTimeout(200);
   await page.screenshot({path:'/tmp/telstra-enter-midway.png'});
  }
  await page.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('data-entry')==='complete'&&window.entryFrames.at(-1)?.phase==='complete');
  const frames=await page.evaluate(()=>window.entryFrames);
  const first=frames[0],last=frames.at(-1);
  assert.ok(first.center>last.center+200,`${scenario}: globe must travel upwards`);
  if(scenario!=='reduced-motion'){
   const intermediate=frames.filter(f=>f.phase==='entering'&&f.center<first.center-5&&f.center>last.center+5);
   assert.ok(intermediate.length>=3,`${scenario}: animation must have intermediate positions`);
   for(let i=1;i<frames.length;i++)assert.ok(frames[i].center<=frames[i-1].center+2,`${scenario}: globe should move steadily toward the centre`);
  }else assert.equal(frames.filter(f=>f.phase==='entering').length,0);
  assert.equal(await page.locator('canvas[data-renderer="three"]').getAttribute('data-entry-identity'),'same-globe');
  assert.ok(frames.every(f=>f.status==='ready'),'No loading or renderer replacement during entry');
  assert.equal(await page.getByRole('button',{name:'ENTER',exact:true}).count(),0);
  assert.equal(await page.locator('nav[aria-label="Map tools"]').getAttribute('inert'),null);
  if(scenario==='quick-access')assert.equal(await page.getByRole('combobox',{name:'Filter by country'}).inputValue(),'Japan');
  if(scenario==='mobile'){
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:'/tmp/telstra-enter-mobile.png'});
  }
  assert.deepEqual(errors,[]);
  console.log(`${scenario}: continuous entry, stable canvas, final controls and framing passed (${frames.length} frames).`);
  await page.close();
 }
}finally{await browser.close();}
