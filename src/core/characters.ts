import type {Performance} from './performance';
import type {RetryProgress} from './settings';
import type {Language} from './settings';
import type { LiveState } from './live-state';
export const characters = [
  {id:'foreman',name:'暴躁工头',tag:'鞭到，工开。',color:'#f1ae69',number:'01',speed:1,
    idle:'眨眼巡场，卷线器轻轻晃动',move:'工靴交替落地，背包随步伐摆动',recover:'敲击、挥鞭、加力，随恢复次数递进',compact:'转动手柄，把上下文收进卷筒',
    lines:{idle:'我看着呢，接着干。',walk:'哪个工位又停了？',continue:'啪！接着干。',compact:'收拾好工具，再开工。',recovered:'这才像话。'}},
  {id:'medic',name:'急救机器人',tag:'这活还能救。',color:'#82ded4',number:'02',speed:1.35,
    idle:'监护屏持续扫描，诊断探头待命',move:'四轮底盘平稳行进，探头收拢',recover:'状态诊断、电极充能、辅助启动',compact:'回收探头，整理诊断记录',
    lines:{idle:'生命体征：仍有活可干。',walk:'让一让，任务急救。',continue:'充电！恢复心跳！',compact:'清理缓存，准备复苏。',recovered:'心跳恢复，继续观察。'}},
  {id:'mechanic',name:'磁力维修猫',tag:'敲两下，能好。',color:'#c2aff4',number:'03',speed:.9,
    idle:'观察工位，尾巴自然摆动',move:'四足交替落地，尾巴平衡重心',recover:'探爪轻触、扒动线缆、伏身检修',compact:'整理散乱线缆，卷起收好',
    lines:{idle:'工具齐了，就差你开工。',walk:'喵，故障点在哪？',continue:'咔哒。修好了，跑！',compact:'记忆齿轮，重新对齐。',recovered:'喵，验收通过。'}},
  {id:'ranger',name:'喷气巡警',tag:'停工现场，已抵达。',color:'#96c8ff',number:'04',speed:1.6,
    idle:'悬停巡查，信号天线轻微摆动',move:'双涵道风扇倾转，机身侧倾推进',recover:'信标探测、发射脉冲、助推启动',compact:'收回扫描器，归整导航记录',
    lines:{idle:'巡逻中，随时出动。',walk:'锁定停工现场。',continue:'收到，启动复工脉冲。',compact:'收束上下文，准备跃迁。',recovered:'目标恢复，解除警戒。'}},
] as const;
export type CharacterId=typeof characters[number]['id'];
export type CharacterAction='watch'|'whip'|'compact'|'recovered'|'preview';
export const isCharacterId=(value:unknown):value is CharacterId=>characters.some(c=>c.id===value);
export const getCharacter=(id:CharacterId)=>characters.find(c=>c.id===id)!;
export interface PetMove {dock?:import("./pet-placement").DockEdge;placementInstant?:boolean;supply?:import("./supply").SupplyState;x:number;y:number;side:string;label:string;key:string;character:CharacterId;action:CharacterAction;sequence:number;preview?:boolean;live?:LiveState;language?:Language;performance?:Performance;attempt?:number;retry?:RetryProgress;observing?:boolean;duration?:number}
