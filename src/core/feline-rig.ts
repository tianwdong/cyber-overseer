import {deformFeline,type FelineMotion} from './feline-motion';
import {pawStep,settlePaw} from './feline-gait';
export type Point=readonly [number,number];
export interface Leg {root:Point;joint:Point;ankle:Point;art:readonly [number,number,number,number];bands:readonly (readonly [number,number,number])[]}
function limb(art:readonly [number,number,number,number],root:Point,joint:Point,ankle:Point):Leg{
  const point=(p:Point):Point=>[art[0]+p[0]*art[2],art[1]+p[1]*art[3]];
  return {art,root:point(root),joint:point(joint),ankle:point(ankle),bands:[[art[1],art[0],art[0]+art[2]],[art[1]+art[3],art[0],art[0]+art[2]]]};
}
export const legs:readonly Leg[]=[
  limb([.369,.50,.13,.50],[.43,.16],[.24,.74],[.47,.945]),
  limb([.469,.575,.13,.405],[.47,.15],[.27,.735],[.52,.95]),
  limb([.737,.50,.105,.50],[.36,.114],[.39,.5],[.76,.94]),
  limb([.783,.545,.105,.43],[.54,.12],[.28,.45],[.73,.935]),
];
export const skinPoint=(p:Point):[number,number]=>[(p[0]-.5)*136,p[1]*92-45];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function solveJoint(root:Point,tip:Point,upper:number,lower:number):[number,number]{
  const dx=tip[0]-root[0],dy=tip[1]-root[1],length=Math.hypot(dx,dy),d=Math.min(upper+lower-.0001,Math.max(Math.abs(upper-lower)+.0001,length));
  const along=(upper*upper-lower*lower+d*d)/(2*d),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return [root[0]+dx/length*along-dy/length*height,root[1]+dy/length*along+dx/length*height];
}
export function legPose(index:number,m:FelineMotion){
  const leg=legs[index],restRoot=skinPoint(leg.root),restJoint=skinPoint(leg.joint),restAnkle=skinPoint(leg.ankle);
  const root=deformFeline(...leg.root,m),step=m.settleAge===undefined?pawStep(m.phase,index):settlePaw(m.phase,index,m.settleAge),strength=m.settleAge===undefined?m.stride:1;
  const ankle:[number,number]=[restAnkle[0]+step.x*strength+(index===2?m.paw*7:0),restAnkle[1]+step.y*strength-(index===2?m.paw*5:0)];
  const upper=distance(restRoot,restJoint),lower=distance(restJoint,restAnkle);
  if(m.lift){const k=m.lift;ankle[0]+=(root[0]+(index<2?-3:2)-ankle[0])*k;ankle[1]+=(root[1]+(upper+lower)*.95-ankle[1])*k;}
  // Keep the paw planted; a tiny shoulder/hip shift supplies reach rather than stretching bones.
  const reach=distance(root,ankle),limit=upper+lower-.05;
  if(reach>limit){const excess=reach-limit;root[0]+=(ankle[0]-root[0])/reach*excess;root[1]+=(ankle[1]-root[1])/reach*excess;}
  const joint=solveJoint(root,ankle,upper,lower);
  return {root,joint,ankle,restRoot,restJoint,restAnkle,upper,lower};
}
function rigid(p:Point,from:Point,to:Point,angle:number):[number,number]{const x=p[0]-from[0],y=p[1]-from[1],c=Math.cos(angle),s=Math.sin(angle);return [to[0]+x*c-y*s,to[1]+x*s+y*c];}
export type Segment='torso'|'upper'|'lower'|'paw';
export function deformLeg(u:number,v:number,index:number,m:FelineMotion,pose=legPose(index,m),segment:Segment='paw'):[number,number]{
  const p=skinPoint([u,v]);
  const angle=(a:Point,b:Point)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
  if(segment==='upper')return rigid(p,pose.restRoot,pose.root,angle(pose.root,pose.joint)-angle(pose.restRoot,pose.restJoint));
  if(segment==='lower')return rigid(p,pose.restJoint,pose.joint,angle(pose.joint,pose.ankle)-angle(pose.restJoint,pose.restAnkle));
  return [p[0]+pose.ankle[0]-pose.restAnkle[0],p[1]+pose.ankle[1]-pose.restAnkle[1]];
}
function interpolate(points:readonly Point[],x:number){for(let i=1;i<points.length;i++)if(x<=points[i][0]){const a=points[i-1],b=points[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return points.at(-1)![1];}
const belly:readonly Point[]=[[0,.65],[.29,.65],[.32,.64],[.42,.7],[.56,.7],[.68,.7],[.705,.7],[.77,.7],[.82,.67],[.9,.6],[.94,.55],[1,.55]];
export interface SkinMesh{part:number;segment:Segment;uv:number[];indices:number[]}
export function felineMeshes():SkinMesh[]{
  // Separate index buffers make a triangle between different legs impossible.
  const pieces=[1,3,0,2,-1].flatMap(part=>(part===-1?['torso']:['upper','lower','paw']).map(segment=>({part,segment:segment as Segment})));
  return pieces.map(({part,segment})=>{
    const uv:number[]=[],indices:number[]=[],columns=part===-1?60:12,rows=part===-1?24:32;
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      if(part===-1){const u=x/columns;uv.push(u,y/rows*interpolate(belly,u));}
      else{const leg=legs[part],bands=leg.bands,start=segment==='upper'?bands[0][0]:segment==='lower'?leg.joint[1]-.018:leg.ankle[1]-.014,end=segment==='upper'?leg.joint[1]+.018:segment==='lower'?leg.ankle[1]+.014:bands.at(-1)![0],v=start+y/rows*(end-start),left=interpolate(bands.map(p=>[p[0],p[1]]),v),right=interpolate(bands.map(p=>[p[0],p[2]]),v);uv.push(left+x/columns*(right-left),v);}
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d);}
    return {part,segment,uv,indices};
  });
}
