const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function edgePeek(age:number,near:number){
 const t=Math.max(0,age),attention=Math.max(0,Math.min(1,near));
 // Brace, hesitate, lean out, watch, then ease back. No perpetual in/out loop.
 const out=smooth((t-260)/720),settle=smooth((t-2400)/650);
 const reach=out*(1-settle*.26),tilt=smooth((t-1150)/400)*(1-smooth((t-2100)/500));
 return {headX:reach*7+attention*3,bodyX:out*2,tilt:tilt*.075+attention*.025,headY:-Math.sin(Math.min(1,t/1300)*Math.PI)*1.2};
}
