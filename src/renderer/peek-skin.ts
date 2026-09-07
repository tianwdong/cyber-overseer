import type {edgePeek} from '../core/edge-peek';
// A continuous textured surface: the neck follows the head while the lower paw/arm stays planted.
export function drawPeekSkin(ctx:CanvasRenderingContext2D,image:HTMLImageElement,r:{x:number;y:number;w:number;h:number},x:number,y:number,w:number,h:number,pose:ReturnType<typeof edgePeek>){
 const point=(u:number,v:number)=>{
  const head=Math.max(0,Math.min(1,(.72-v)/.4));const weight=head*head*(3-2*head),upper=Math.max(0,1-v/.8);
  const px=(u-.58)*w,py=(v-.34)*h,a=pose.tilt*weight;
  return [x+u*w+pose.headX*weight+pose.bodyX*upper+px*(Math.cos(a)-1)-py*Math.sin(a),y+v*h+pose.headY*weight+px*Math.sin(a)+py*(Math.cos(a)-1)];
 };
 const triangle=(a:number[],b:number[],c:number[],A:number[],B:number[],C:number[])=>{
  const det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
  const sx=((B[0]-A[0])*(c[1]-a[1])-(C[0]-A[0])*(b[1]-a[1]))/det,sy=((B[1]-A[1])*(c[1]-a[1])-(C[1]-A[1])*(b[1]-a[1]))/det;
  const kx=((C[0]-A[0])*(b[0]-a[0])-(B[0]-A[0])*(c[0]-a[0]))/det,ky=((C[1]-A[1])*(b[0]-a[0])-(B[1]-A[1])*(c[0]-a[0]))/det;
  ctx.save();ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.lineTo(C[0],C[1]);ctx.closePath();ctx.clip();ctx.transform(sx,sy,kx,ky,A[0]-sx*a[0]-kx*a[1],A[1]-sy*a[0]-ky*a[1]);ctx.drawImage(image,r.x,r.y,r.w,r.h,0,0,w,h);ctx.restore();
 };
 const n=6;
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const u=i/n,v=j/n,U=(i+1)/n,V=(j+1)/n,a=[u*w,v*h],b=[U*w,v*h],c=[U*w,V*h],d=[u*w,V*h],A=point(u,v),B=point(U,v),C=point(U,V),D=point(u,V);
  triangle(a,b,c,A,B,C);triangle(a,c,d,A,C,D);
 }
}
