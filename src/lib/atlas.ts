import {atlasWidth,atlasHeight,network,project,visibleLocations,type Layers} from './network';
let baseImage:Promise<HTMLImageElement>|undefined;
export function loadWorld(){return baseImage??=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{baseImage=undefined;reject(new Error('Unable to load the world map.'));};image.src='assets/world.jpg';});}
export function drawAtlas(image:HTMLImageElement,layers:Layers,country:string,selected:string|null){
 const canvas=document.createElement('canvas');canvas.width=atlasWidth;canvas.height=atlasHeight;
 const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,atlasWidth,atlasHeight);
 const allowed=(from:string,to:string)=>!country||network.locations.some(l=>(l.id===from||l.id===to)&&l.country===country);
 const path=(coordinates:number[][],color:string,width:number,dashed=false)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed?[5,4]:[]);for(const shift of [-atlasWidth,0,atlasWidth]){ctx.beginPath();coordinates.forEach(([lon,lat],i)=>{const p=project(lon,lat);if(i===0)ctx.moveTo(p.x+shift,p.y);else ctx.lineTo(p.x+shift,p.y);});ctx.stroke();}ctx.setLineDash([]);};
 if(layers.infrastructure){ctx.fillStyle='#7069ba25';[[115,10,29,57],[143,-19,22,34]].forEach(([lon,lat,rx,ry])=>{const p=project(lon,lat);ctx.beginPath();ctx.ellipse(p.x,p.y,rx/360*atlasWidth,ry/180*atlasHeight,0,0,Math.PI*2);ctx.fill();});}
 if(layers.network)network.connections.filter(l=>allowed(l.from,l.to)).forEach(l=>path(l.coordinates,l.color,1.3,l.planned));
 if(layers.media)network.media.filter(l=>allowed(l.from,l.to)).forEach(l=>{const a=network.locations.find(n=>n.id===l.from)!,b=network.locations.find(n=>n.id===l.to)!;let end=b.longitude;while(end-a.longitude>180)end-=360;while(end-a.longitude< -180)end+=360;path([[a.longitude,a.latitude],[end,b.latitude]],'#ef882b',2);});
 const pin=(x:number,y:number,color:string,triangle=false)=>{ctx.fillStyle=color;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.7;ctx.beginPath();if(triangle){ctx.moveTo(x-5,y-13);ctx.lineTo(x+5,y-13);ctx.lineTo(x,y);}else{ctx.moveTo(x,y);ctx.bezierCurveTo(x-16,y-16,x-7,y-24,x,y-24);ctx.bezierCurveTo(x+7,y-24,x+16,y-16,x,y);}ctx.closePath();ctx.fill();ctx.stroke();if(!triangle){ctx.fillStyle='white';ctx.beginPath();ctx.arc(x,y-16,3,0,Math.PI*2);ctx.fill();}};
 visibleLocations(layers,country).forEach((l,i)=>{const {x,y}=project(l.longitude,l.latitude);
 if(layers.pops){for(let j=0;j<7;j++){const dx=Math.sin(i*7+j*3)*18,dy=Math.cos(i*3+j*5)*14;ctx.fillStyle=j===0?'#db248b':'#70d5b3';ctx.fillRect(x+dx-2,y+dy-2,4,4);}}
 if(layers.network||layers.media){ctx.fillStyle='#ffffffaa';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle=layers.media?'#f78b24':'#087db5';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();}
 if(layers.infrastructure&&l.dataCentre)pin(x,y,'#287ad5');
 if((layers.infrastructure||layers.network)&&l.teleport)pin(x+5,y-3,'#e32a91');
 if(layers.other&&l.office)pin(x,y,'#443482',true);
 if(layers.media&&l.broadcast)pin(x,y,'#18b887',true);
 if(l.id===selected){ctx.strokeStyle='#ec168c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.stroke();}
 });return canvas;
}
