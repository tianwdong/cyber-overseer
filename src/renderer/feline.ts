import {drawEquipment} from './supply-equipment';
import {felineMeshes,deformLeg,legPose,legs} from '../core/feline-rig';
import {deformFeline,felineMotion,type FelineMotion} from '../core/feline-motion';
import type {ForemanMotion} from './foreman';
const surface=document.createElement('canvas');surface.width=468;surface.height=348;
const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
const image=new Image(),limbImage=new Image();let ready=false;
const meshes=felineMeshes().map(mesh=>({...mesh,uvBuffer:null as WebGLBuffer|null,indexBuffer:null as WebGLBuffer|null,texture:null as WebGLTexture|null}));
let uvLocation=0,toneLocation:WebGLUniformLocation|null=null;
const histories=new WeakMap<CanvasRenderingContext2D,{time:number;pose:FelineMotion;walking:boolean;settleAt?:number}>();
let positions:WebGLBuffer|null=null;
if(gl){
  const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)??'Cat shader failed');return s;};
  const program=gl.createProgram()!;
  gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 texcoord;varying vec2 uv;void main(){uv=texcoord;gl_Position=vec4(position,0.,1.);}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D skin;uniform float tone;void main(){vec4 c=texture2D(skin,uv);gl_FragColor=vec4(c.rgb*c.a*tone,c.a);}'));
  gl.linkProgram(program);gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  positions=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,positions);const location=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
  for(const mesh of meshes){mesh.indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.indices),gl.STATIC_DRAW);}
  const upload=(image:HTMLImageElement)=>{const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);return texture;};
  const bounds=(image:HTMLImageElement,region:number[])=>{
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    if(pixels[3]!==0)throw Error('Cat skin requires actual alpha');
    let left=c.width,right=0,top=c.height,bottom=0;
    for(let y=Math.floor(region[1]*c.height);y<region[3]*c.height;y++)for(let x=Math.floor(region[0]*c.width);x<region[2]*c.width;x++)if(pixels[(y*c.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    return [left/c.width,top/c.height,(right-left)/c.width,(bottom-top)/c.height];
  };
  const load=()=>{
    if(!image.complete||!image.naturalWidth||!limbImage.complete||!limbImage.naturalWidth)return;
    const bodyBox=bounds(image,[0,0,1,1]),boxes=[[0,0,.5,.468],[.5,0,1,.468],[0,.468,.5,1],[.5,.468,1,1]].map(r=>bounds(limbImage,r));
    const bodyTexture=upload(image),legTexture=upload(limbImage);
    uvLocation=gl.getAttribLocation(program,'texcoord');gl.enableVertexAttribArray(uvLocation);toneLocation=gl.getUniformLocation(program,'tone');
    for(const mesh of meshes){const box=mesh.part<0?bodyBox:boxes[[2,3,0,1][mesh.part]],art=mesh.part<0?[0,0,1,1]:legs[mesh.part].art;
      const coords=mesh.uv.map((v,i)=>{const axis=i%2;return box[axis]+(v-art[axis])/art[axis+2]*box[axis+2];});
      mesh.uvBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coords),gl.STATIC_DRAW);mesh.texture=mesh.part<0?bodyTexture:legTexture;
    }ready=true;
  };
  image.onload=load;limbImage.onload=load;image.onerror=limbImage.onerror=()=>console.error('Unable to load cat textures');
  image.src='assets/characters/cat-continuous.png';limbImage.src='assets/characters/cat-limbs.png';
}
export const felineReady=()=>ready;
export function drawFeline(ctx:CanvasRenderingContext2D,time:number,side:string,m:ForemanMotion):boolean{
  if(!gl||!ready)return false;
  const target=felineMotion(m.mode,m.age,time,m.gait??time/150),history=histories.get(ctx);
  let pose={...target};
  if(history&&!m.scrubbing&&time>=history.time&&time-history.time<500){
    const blend=1-Math.exp(-(time-history.time)/150);
    for(const key of ['stride','paw','crouch','head'] as const)pose[key]=history.pose[key]+(target[key]-history.pose[key])*blend;
  }
  const walking=m.mode==='walk';
  const settleAt=!m.scrubbing&&!walking?(history?.walking?time:history?.settleAt):undefined;
  if(settleAt!==undefined&&time-settleAt<600)pose.settleAge=time-settleAt;
  histories.set(ctx,{time,pose:{...pose},walking,settleAt});
  if(m.supply?.cue&&!walking)pose.head+=m.supply.attention*.4;
  // A turn plants the body briefly; never squash an animal into a paper-thin strip.
  const turn=m.facingScale===undefined?0:1-Math.abs(m.facingScale);pose.crouch+=turn*.22;pose.head+=turn*.12;
  pose.peek=m.peek;
  pose.lift=m.lift??0;pose.stride*=1-pose.lift;
  gl.viewport(0,0,surface.width,surface.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  for(const mesh of meshes){
    const points=new Float32Array(mesh.uv.length),joints=mesh.part===-1?undefined:legPose(mesh.part,pose);
    for(let i=0;i<mesh.uv.length;i+=2){const [x,y]=mesh.part===-1?deformFeline(mesh.uv[i],mesh.uv[i+1],pose):deformLeg(mesh.uv[i],mesh.uv[i+1],mesh.part,pose,joints,mesh.segment);points[i]=x/78;points[i+1]=-(y+5)/58;}
    gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,points,gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.uvBuffer);gl.vertexAttribPointer(uvLocation,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.bindTexture(gl.TEXTURE_2D,mesh.texture);gl.uniform1f(toneLocation,mesh.part<0?1:mesh.part===1||mesh.part===3?.72:.84);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);
  }
  ctx.save();ctx.globalAlpha=1-(m.lift??0);ctx.fillStyle='#00000030';ctx.beginPath();ctx.ellipse(9,47,37,2.6,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.scale(m.facingScale===undefined?(side==='right'?-1:1):(m.facingScale<0?-1:1),1);ctx.drawImage(surface,-78,-63,156,116);if(m.supply){const [cx,cy]=deformFeline(.79,.32,pose);ctx.save();ctx.translate(cx,cy);drawEquipment(ctx,'mechanic',m.supply);ctx.restore();}ctx.restore();return true;
}
