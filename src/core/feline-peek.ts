import {keys} from './performance';
export interface FelinePeek {headTilt:number;headReach:number;earTwitch:number}
export function felinePeek(age:number,near:number):FelinePeek {
 const u=Math.max(0,age)%12000/12000,attention=Math.max(0,Math.min(1,near));
 const reach=keys(u,[[0,0],[.09,.55],[.18,1],[.32,1],[.46,.65],[.62,.15],[1,.15]]);
 const tilt=keys(u,[[0,-.06],[.14,-.06],[.24,.12],[.36,.12],[.5,-.03],[1,-.03]]);
 const earPhase=(u-.29)/.065;
 return {headReach:reach*6+attention*(3+Math.sin(age/150)*.45),headTilt:tilt+attention*.06,earTwitch:earPhase>0&&earPhase<1?Math.sin(earPhase*Math.PI*2)*Math.sin(earPhase*Math.PI):0};
}
