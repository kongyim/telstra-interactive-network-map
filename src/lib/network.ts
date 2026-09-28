import dataset from '../../public/data/network.json';
export const network=dataset;
export type Location=typeof dataset.locations[number];
export type Layers={network:boolean;pops:boolean;infrastructure:boolean;other:boolean;media:boolean};
export type ViewMode='globe'|'map';
export const initialLayers:Layers={network:true,pops:false,infrastructure:false,other:false,media:false};
export const atlasWidth=4096;
export const atlasHeight=2048;
export const project=(longitude:number,latitude:number)=>({x:(longitude+180)/360*atlasWidth,y:(90-latitude)/180*atlasHeight});
export function visibleLocations(layers:Layers,country:string){return network.locations.filter(l=>(!country||l.country===country)&&(layers.network||layers.pops||(layers.infrastructure&&(l.dataCentre||l.teleport))||(layers.other&&l.office)||(layers.media&&network.media.some(m=>m.from===l.id||m.to===l.id))));}
