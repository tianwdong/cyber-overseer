import type { Task } from './model';
export type TurnState = Pick<Task, 'status' | 'error' | 'turnId' | 'endedAt' | 'errorCode' | 'isCompaction' | 'resultExcerpt'>;
export function reduceRollout(lines: string[]): TurnState {
  let state: TurnState = { status: 'unknown' };
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== 'event_msg') continue;
    const p = e.payload;
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'task_started') state = { status: 'running', turnId: p.turn_id };
    else if (p.type === 'task_complete') {
      if (state.turnId && p.turn_id !== state.turnId) continue;
      state = { status: p.error ? 'failed' : 'completed', turnId: p.turn_id, endedAt: Date.parse(e.timestamp) || undefined, isCompaction:state.isCompaction,
        resultExcerpt:typeof p.last_agent_message==='string'?p.last_agent_message.slice(0,1600):undefined,
        errorCode: typeof p.error?.codex_error_info === 'string' ? p.error.codex_error_info : undefined,
        error: typeof p.error?.message === 'string' ? p.error.message : undefined };
    } else if(['item_started','item_completed'].includes(p.type) && p.turn_id){
      if(!state.turnId)state={status:'running',turnId:p.turn_id};
      if(p.turn_id===state.turnId&&['ContextCompaction','contextCompaction','context_compaction'].includes(p.item?.type))state={...state,isCompaction:true};
    } else if (p.type === 'turn_aborted') {
      if (state.turnId && p.turn_id && p.turn_id !== state.turnId) continue;
      state = { status: 'waiting', turnId: p.turn_id ?? state.turnId };
    }
  }
  return state;
}

export const isModelAtCapacity=(message:string):boolean=>/\bselected model is at capacity\b/i.test(message);

export function recoveryAction(task: TurnState): 'continue' | 'compact' | null {
  if (task.status !== 'failed' || !task.turnId) return null;
  const message=task.error ?? '';
  if (/unauthoriz|authentication|billing|quota|usage limit|budget|permission|rate limit/i.test(message)) return null;
  if (task.isCompaction || ['contextWindowExceeded','context_window_exceeded'].includes(task.errorCode??'') || /context window|context.{0,12}(too long|exceed)|maximum context|(?:compact(?:ion|ing)?.{0,50}(?:fail|error)|(?:fail|error).{0,50}compact)|压缩.{0,12}(失败|异常)/i.test(message)) return 'compact';
  if (/stream disconnected before completion|error decoding response body|network error|error sending request|connection (reset|refused|closed)|timed? out|timeout|server overloaded|internal server error|http.{0,12}50[234]/i.test(message)||isModelAtCapacity(message)) return 'continue';
  return null;
}
