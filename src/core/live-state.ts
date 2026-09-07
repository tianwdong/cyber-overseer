import type { TurnState } from './events';
export type WorkState='unknown'|'idle'|'running'|'waiting'|'review'|'failed'|'retrying';
export type Activity='none'|'thinking'|'replying'|'command'|'files'|'tool'|'search'|'compacting';
export interface LiveState {
  threadId:string; connection:'connecting'|'live'|'disconnected'; work:WorkState; activity:Activity;
  label:string; revision?:number; turnId?:string; updatedAt:number;
}
export const activityLabels:Record<Activity,string>={none:'工作中',thinking:'正在思考',replying:'正在回复',command:'执行命令',files:'修改文件',tool:'调用工具',search:'搜索网页',compacting:'压缩上下文'};
const workLabels:Record<WorkState,string>={unknown:'连接任务状态',idle:'空闲待命',running:'工作中',waiting:'等待你处理',review:'完成，等你查看',failed:'任务故障',retrying:'Codex 正在重试'};
export function latestTurn(c:any):any {
  if(c?.turnHistory?.kind==='canonical'){
    const h=c.turnHistory.history,entry=h?.islands?.at(-1)?.entries?.at(-1);
    return entry?h.entitiesByKey?.[entry.value]:undefined;
  }
  return c?.turns?.at(-1);
}
export function summarizeConversation(c:any,revision:number,now=Date.now()):LiveState {
  const turn=latestTurn(c),items:any[]=Array.isArray(turn?.items)?turn.items:[],requests:any[]=Array.isArray(c.requests)?c.requests:[];
  const flags=c.threadRuntimeStatus?.activeFlags??[];
  const waiting=flags.includes('waitingOnApproval')||flags.includes('waitingOnUserInput')||requests.length>0||items.some(i=>i.type==='planImplementation'&&!i.isCompleted);
  const running=c.resumeState==='needs_resume'?c.threadRuntimeStatus?.type==='active':c.resumeState==='resuming'||turn?.status==='inProgress';
  const failed=c.resumeState==='needs_resume'?c.threadRuntimeStatus?.type==='systemError':turn?.status==='failed';
  const last=items.at(-1);
  let work:WorkState=waiting?'waiting':failed?'failed':running?(last?.type==='error'&&last.willRetry===true?'retrying':'running'):c.hasUnreadTurn?'review':'idle';
  if(!turn&&!c.threadRuntimeStatus)work='unknown';
  const active=[...items].reverse().find(i=>['commandExecution','fileChange','mcpToolCall','dynamicToolCall','collabAgentToolCall'].includes(i.type)&&i.status==='inProgress');
  const item=active??last;
  let activity:Activity='none';
  if(work==='running'){
    const types:Record<string,Activity>={reasoning:'thinking',agentMessage:'replying',commandExecution:'command',fileChange:'files',mcpToolCall:'tool',dynamicToolCall:'tool',collabAgentToolCall:'tool',webSearch:'search',contextCompaction:'compacting'};
    activity=types[item?.type]??'none';
    if(['command','files','tool'].includes(activity)&&item.status!=='inProgress')activity='none';
  }
  return {threadId:c.id,connection:'live',work,activity,label:work==='running'?activityLabels[activity]:workLabels[work],revision,turnId:turn?.turnId,updatedAt:now};
}
// The live feed can veto recovery; only durable failure evidence can initiate it.
export function permitsRecovery(live:LiveState|undefined,current:TurnState):boolean {
  if(!live||live.connection==='disconnected')return true;
  if(live.connection==='connecting')return false;
  if(live.turnId!==current.turnId)return false;
  return live.work==='failed'||(current.status==='completed'&&current.isCompaction===true&&['idle','review'].includes(live.work));
}
interface Patch {op:'add'|'remove'|'replace';path:(string|number)[];value?:any}
// Immer's JSON patch dialect uses array paths. Copy only changed ancestors.
function applyPatch(root:any,p:Patch):any {
  if(!p||!['add','remove','replace'].includes(p.op)||!Array.isArray(p.path)||p.path.some(k=>!['string','number'].includes(typeof k)||['__proto__','constructor','prototype'].includes(String(k))))throw Error('Invalid patch');
  if(!p.path.length){if(p.op==='remove')throw Error('Invalid root removal');return p.value;}
  const update=(node:any,depth:number):any=>{
    if(!node||typeof node!=='object')throw Error('Missing patch parent');
    const key=p.path[depth],array=Array.isArray(node);
    if(array&&(!Number.isInteger(key)||Number(key)<0||Number(key)>node.length))throw Error('Invalid array index');
    const exists=Object.hasOwn(node,key),last=depth===p.path.length-1;
    if((!last||p.op!=='add')&&!exists)throw Error('Missing patch target');
    const copy=array?node.slice():{...node};
    if(!last)copy[key]=update(node[key],depth+1);
    else if(array&&p.op==='add')copy.splice(Number(key),0,p.value);
    else if(array&&p.op==='remove')copy.splice(Number(key),1);
    else if(p.op==='remove')delete copy[key];
    else copy[key]=p.value;
    return copy;
  };
  return update(root,0);
}
export class ConversationFeed {
  private conversation:any;
  revision?:number;
  constructor(readonly threadId:string){}
  reset(){this.conversation=undefined;this.revision=undefined;}
  accept(change:any):LiveState|undefined {
    if(!Number.isSafeInteger(change?.revision)||change.revision<0)throw Error('Invalid stream revision');
    if(this.revision!==undefined&&change.revision<=this.revision)return;
    let next;
    if(change.type==='snapshot')next=change.conversationState;
    else if(change.type==='patches'&&this.conversation&&change.baseRevision===this.revision&&Array.isArray(change.patches))next=change.patches.reduce(applyPatch,this.conversation);
    else throw Error('State stream gap');
    if(next?.id!==this.threadId)throw Error('Mismatched task identity');
    const summary=summarizeConversation(next,change.revision);
    this.conversation=next;this.revision=change.revision;
    return summary;
  }
}
