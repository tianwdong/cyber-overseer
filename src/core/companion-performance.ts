import type {CharacterId} from './characters';
import {ambientGesture,clamp,durationOf,keys,foremanPose,performances,type Performance,type Pose} from './performance';
const labels:Record<Exclude<CharacterId,'foreman'>,Partial<Record<Performance,string>>>={
  medic:{idle:'值班观察',walk:'移动就位',thinking:'诊断中',working:'检查心电',retrying:'等待内部重连',alert:'发现异常',tap:'首次 · 状态诊断',whip:'二次 · 电极充能',heavy:'三次 · 辅助启动',compact:'整理记录',observe:'复查运行状态',recovered:'确认恢复',waiting:'提交诊断单',exhausted:'等待人工处理'},
  mechanic:{idle:'巡检待命',walk:'赶往工位',thinking:'考虑修复方案',working:'检修中',retrying:'暂缓动手',alert:'察觉故障',tap:'首次 · 探爪轻触',whip:'二次 · 扒动线缆',heavy:'三次 · 伏身检修',compact:'整理记忆线缆',observe:'检查修复结果',recovered:'验收后收工',waiting:'抬头等待',exhausted:'伏下待命'},
  ranger:{idle:'悬停巡查',walk:'推进就位',thinking:'核对航向',working:'查看航线',retrying:'等待信号',alert:'雷达发现故障',tap:'首次 · 信标探测',whip:'二次 · 发射脉冲',heavy:'三次 · 助推启动',compact:'整理导航记录',observe:'核验信号',recovered:'解除警戒',waiting:'悬停等待指令',exhausted:'降落待命'},
};
export const performanceLabel=(id:CharacterId,mode:Performance)=>id==='foreman'?performances.find(p=>p.id===mode)!.label:labels[id][mode]!;
export function characterPose(id:CharacterId,mode:Performance,age:number,time:number,gait=0):Pose{
  if(id==='foreman')return foremanPose(mode,age,time,gait);
  const t=time/1000,u=clamp(age/durationOf(mode)),s=Math.sin(t*2);
  const p:Pose={lean:Math.sin(t*1.4)*.025,bob:s*.8,head:Math.sin(t*.9)*.025,leftX:-29,leftY:16,rightX:29,rightY:16,gaze:0,lid:0,power:0,impact:0};
  const beat=keys(u,[[0,0],[.25,1],[.36,1],[.43,-.5],[.51,-.5],[.75,.12],[1,0]]);
  const charge=keys(u,[[0,0],[.24,.3],[.38,.5],[.46,1],[.55,.85],[.82,0],[1,0]]);
  if(mode==='walk'){p.lean=id==='ranger'?.18:.09;p.bob=id==='mechanic'?-Math.abs(Math.sin(gait))*4:-Math.abs(Math.sin(gait))*1.2;p.head=-p.lean*.6;p.leftY=16+Math.sin(gait)*4;p.rightY=16-Math.sin(gait)*4;}
  if(mode==='thinking'){p.head=id==='medic'?-.18:.14;p.rightX=17;p.rightY=-23;p.gaze=-2;p.leftX=-23;}
  if(mode==='working'){const gesture=ambientGesture(time,id==='medic'?4000:8000);p.head=.07+gesture*.03;p.gaze=2;p.leftX=-14;p.leftY=5;p.rightX=19+Math.sin(t*2)*2*gesture;p.rightY=4+Math.cos(t*2)*2*gesture;}
  if(mode==='retrying'){const lower=keys(u,[[0,0],[.3,1],[.7,1],[1,0]]);p.leftX=-16;p.rightX=16;p.leftY=p.rightY=12+lower*6;p.head=-.07;p.lid=.1;}
  if(mode==='alert'){const jump=keys(u,[[0,0],[.1,1],[.22,0],[1,0]]);p.bob-=jump*3;p.head=-.12;p.gaze=3;}
  if(mode==='tap'){
    const pat=keys(u,[[0,0],[.2,.6],[.3,.6],[.34,1],[.43,.6],[.5,1],[.62,.6],[.87,0],[1,0]]);
    p.rightX=29+pat*19;p.rightY=16-pat*21;p.head=.07;p.gaze=3;p.lean=pat*.06;p.power=pat;
    p.impact=Math.max(0,1-Math.abs(u-.34)/.045,1-Math.abs(u-.5)/.045);
  }
  if(mode==='whip'||mode==='heavy'){
    const heavy=mode==='heavy';p.power=charge;p.impact=Math.max(0,1-Math.abs(u-.47)/.045);p.gaze=3;
    if(id==='mechanic'){p.lean=-beat*(heavy?.25:.14);p.bob+=Math.max(0,beat)*(heavy?4:2);p.rightX=29-beat*18;p.rightY=16-keys(u,[[0,0],[.33,1],[.46,.2],[.6,.3],[1,0]])*47;p.leftX=heavy?12-beat*8:-29;p.leftY=heavy?p.rightY+11:16;}
    if(id==='medic'){p.leftX=-29-charge*(heavy?11:4);p.rightX=29+charge*(heavy?11:4);p.leftY=p.rightY=16-charge*28;p.lean=-beat*.04;p.bob+=beat*2;}
    if(id==='ranger'){p.lean=-beat*(heavy?.2:.09);p.bob-=charge*(heavy?11:4);p.rightX=29+charge*12;p.rightY=16-charge*19;p.leftX=-29-charge*5;}
  }
  if(mode==='compact'){p.leftX=-16;p.leftY=11;p.rightX=22+Math.cos(t*4)*4;p.rightY=10+Math.sin(t*4)*4;p.head=.08;p.gaze=2;}
  if(mode==='observe'){p.lean=.13;p.head=.1;p.rightX=26;p.rightY=-12;p.gaze=4;}
  if(mode==='recovered'){const hop=keys(u,[[0,0],[.14,1],[.3,0],[.45,.65],[.6,0],[1,0]]);p.bob-=hop*(id==='mechanic'?3:2);p.head=Math.sin(u*Math.PI*4)*.07*(1-u);p.leftY=p.rightY=16-hop*12;p.lid=.3;p.power=hop;}
  if(mode==='waiting'||mode==='exhausted'){p.leftX=-15;p.rightX=15;p.leftY=p.rightY=12;p.head=mode==='exhausted'?.14:-.12;p.lid=mode==='exhausted'?.45:0;p.bob+=mode==='exhausted'?3:0;}
  return p;
}
