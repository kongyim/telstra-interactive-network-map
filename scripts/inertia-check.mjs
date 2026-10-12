import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 await page.goto('http://localhost:3000');
 await page.waitForSelector('.map-canvas[data-status="ready"]');
 await page.getByRole('button',{name:'ENTER',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.entry==='complete');
 const canvas=page.locator('.map-canvas');
 await canvas.evaluate(el=>el.addEventListener('pointerup',()=>{el.dataset.releasePose=el.dataset.mode==='globe'?el.dataset.rotation:el.dataset.pan;}));
 for(const mode of ['globe','map']){
  if(mode==='map'){
   await page.getByRole('button',{name:'Switch to 2D map'}).click();
   await page.waitForSelector('.map-canvas[data-morph="0.00000"][data-transition="idle"]');
  }
  for(const direction of ['horizontal','vertical'])for(let repeat=0;repeat<2;repeat++){
   await page.getByRole('button',{name:'Reset map view'}).click();
   if(mode==='map')await page.getByRole('slider').fill('2');
   await page.mouse.move(800,420);await page.mouse.down();
   await page.mouse.move(direction==='horizontal'?870:800,direction==='vertical'?490:420,{steps:3});
   await page.mouse.up();await page.waitForTimeout(200);
   const values=await canvas.evaluate(el=>[el.dataset.releasePose,el.dataset.mode==='globe'?el.dataset.rotation:el.dataset.pan]);
   assert.notEqual(values[0],values[1],`${mode} ${direction} flick ${repeat+1} should coast`);
   console.log(`${mode} ${direction} flick ${repeat+1}: coasted`);
  }
  for(const gesture of (mode==='globe'?['edge','reversal']:['reversal'])) {
   await page.getByRole('button',{name:'Reset map view'}).click();
   await page.mouse.move(800,420);await page.mouse.down();
   if(gesture==='edge')await page.mouse.move(1400,420);
   else {await page.mouse.move(870,420);await page.mouse.move(800,420);}
   await page.mouse.up();await page.waitForTimeout(200);
   const values=await canvas.evaluate(el=>[el.dataset.releasePose,el.dataset.mode==='globe'?el.dataset.rotation:el.dataset.pan]);
   assert.notEqual(values[0],values[1],`${mode} ${gesture} must retain momentum`);
   console.log(`${mode} ${gesture}: coasted`);
  }
  await page.getByRole('button',{name:'Reset map view'}).click();
  await page.mouse.move(800,420);await page.mouse.down();await page.mouse.move(850,420,{steps:3});
  await page.waitForTimeout(450);await page.mouse.up();await page.waitForTimeout(200);
  const values=await canvas.evaluate(el=>[el.dataset.releasePose,el.dataset.mode==='globe'?el.dataset.rotation:el.dataset.pan]);
  assert.equal(values[0],values[1],`${mode} held release should stop`);
  console.log(`${mode} held release: stopped`);
 }
}finally{await browser.close();}
