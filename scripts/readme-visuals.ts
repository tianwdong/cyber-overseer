import {drawCharacter} from '../src/renderer/characters';
import {realisticReady} from '../src/renderer/realistic';
const canvas=document.createElement('canvas');document.body.append(canvas);const ctx=canvas.getContext('2d')!;
const box=(x:number,y:number,w:number,h:number,color:string,r=16)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
const label=(s:string,x:number,y:number,size=20,color='#dce5e1')=>{ctx.font=`${size}px -apple-system,BlinkMacSystemFont,sans-serif`;ctx.fillStyle=color;ctx.fillText(s,x,y);};
(window as any).ready=()=>['foreman','medic','mechanic','ranger'].every(id=>realisticReady(id as any));
(window as any).crew=()=>{
 canvas.width=1280;canvas.height=300;box(0,0,1280,300,'#111719',0);
 for(const [i,id] of (['foreman','medic','mechanic','ranger'] as const).entries()){
  box(i*320+8,8,304,284,'#1a2326');ctx.save();ctx.translate(i*320+160,145);ctx.scale(1.65,1.65);
  drawCharacter(ctx,id,1400,false,'watch',10000,'left',undefined,{mode:'idle',age:1400,gait:0});ctx.restore();
  const name=['FOREMAN','MEDIC','REPAIR CAT','PATROL DRONE'][i];ctx.textAlign='center';label(name,i*320+160,267,16,'#e6b57b');ctx.textAlign='left';
 }return canvas.toDataURL();
};
(window as any).demo=(time:number,language:string)=>{
 const zh=language==='zh';canvas.width=800;canvas.height=420;box(0,0,800,420,'#111719',0);
 label('CYBER OVERSEER',30,36,17,'#e6b57b');label(zh?'模拟恢复演示':'SIMULATED RECOVERY',530,36,13,'#aab8be');
 box(30,65,550,265,'#1c2529');label(zh?'任务：完成项目页面':'Task: finish the project page',55,105,20);
 const stage=time<2600?0:time<5200?1:time<8200?2:3;
 const title=zh?['响应中断','发送 continue','等待复工确认','任务已恢复执行']:['Stream interrupted','Sending continue','Waiting for confirmation','Task is running again'];
 box(55,135,500,53,stage===3?'#233e34':'#3b3028');label(title[stage],73,170,22,stage===3?'#a6d4b1':'#e6b57b');
 label(stage===0?'stream disconnected before completion':stage===1?'> continue':stage===2?'…':'> working',55,226,17,'#b8c5cc');
 for(let i=0;i<3;i++)box(55,247+i*19,(stage===3?280+(Math.sin(time/600+i)+1)*40:220-i*45),5,'#43524f',2);
 const mode=stage===0?'alert':stage===1?'tap':stage===2?'observe':'recovered';const start=[0,2600,5200,8200][stage];
 ctx.save();ctx.translate(675,230);ctx.scale(1.85,1.85);drawCharacter(ctx,'foreman',time,false,'watch',10000,'left',undefined,{mode,age:time-start,gait:0});ctx.restore();
 const steps=zh?['检测故障','定向继续','确认复工']:['Detect failure','Resume task','Confirm recovery'];
 for(let i=0;i<3;i++){box(30+i*252,353,236,39,i===(stage===0?0:stage<3?1:2)?'#57452f':'#1c2529',8);label(steps[i],47+i*252,379,16);}
 return canvas.toDataURL();
};
