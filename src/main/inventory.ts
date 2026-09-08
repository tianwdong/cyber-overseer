import {readTaskTitles} from './task-titles';
import { paths, runPython } from './platform';
import { join } from 'node:path';
import type { Task } from '../core/model';
import { reduceRollout, type TurnState } from '../core/events';
// Read-only SQLite inventory; recovery below reads only lifecycle metadata from rollouts.
const query = `
import sqlite3, pathlib, json, sys
p=pathlib.Path(sys.argv[1])
if not p.is_file(): raise RuntimeError('Codex task index not found')
c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True,timeout=2)
c.execute('pragma query_only=on')
cols={r[1] for r in c.execute('pragma table_info(threads)')}
if not {'id','title','cwd','updated_at','archived','source'} <= cols: raise RuntimeError('Unsupported task index schema')
rows=c.execute("select id,title,cwd,updated_at from threads where archived=0 and source in ('vscode','cli','app') order by updated_at desc").fetchall()
print(json.dumps([{'id':r[0], 'title':r[1] or 'Untitled', 'cwd':r[2], 'updatedAt':r[3]*1000, 'status':'unknown'} for r in rows]))
c.close()
`;
export async function readTasks(codexHome=paths.codexHome): Promise<Task[]> {
  const { stdout } = await runPython(['-c', query, join(codexHome, 'state_5.sqlite')], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) throw new Error('Invalid task index');
  const titles=await readTaskTitles(codexHome);
  return rows.map((task:Task)=>({...task,title:titles.get(task.id)??task.title}));
}

export async function readTaskState(id: string, codexHome=paths.codexHome): Promise<TurnState> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid task id');
  const script = `
import sqlite3, pathlib, json, sys
root=pathlib.Path(sys.argv[2])
c=sqlite3.connect((root/'state_5.sqlite').as_uri()+'?mode=ro',uri=True,timeout=2)
row=c.execute('select rollout_path from threads where id=? and archived=0',(sys.argv[1],)).fetchone()
if not row: raise RuntimeError('Task unavailable')
p=pathlib.Path(row[0]).resolve()
# Compare directory identity too: Windows extended paths can name the same directory.
allowed=[(root/d).resolve() for d in ['sessions','archived_sessions']]
if not any(parent==base or (base.is_dir() and parent.samefile(base)) for parent in p.parents for base in allowed): raise RuntimeError('Unexpected rollout path')
with p.open('rb') as f:
 first=json.loads(f.readline())
 if first.get('type')!='session_meta' or first.get('payload',{}).get('id')!=sys.argv[1]: raise RuntimeError('Task identity mismatch')
 start=max(0,p.stat().st_size-512*1024)
 f.seek(start)
 if start: f.readline()
 lines=f.read(512*1024).splitlines()
 result=[]
 for line in lines:
  try:
   e=json.loads(line)
   if e.get('type')=='event_msg' and e.get('payload',{}).get('type') in ['task_started','task_complete','turn_aborted','item_started','item_completed']:
    q=e['payload'];out={k:q[k] for k in ['type','turn_id','error','reason'] if k in q}
    if q.get('type')=='task_complete' and isinstance(q.get('last_agent_message'),str): out['last_agent_message']=q['last_agent_message'][:1600]
    if q.get('type') in ['item_started','item_completed']:
     out['item']={'type':q.get('item',{}).get('type')}
    result.append(json.dumps({'type':'event_msg','timestamp':e.get('timestamp'),'payload':out}))
  except (ValueError,TypeError): pass
 print(json.dumps(result))
c.close()
`;
  try {
    const { stdout } = await runPython(['-c', script, id, codexHome], { timeout: process.platform==='win32'?15000:5000, maxBuffer: 512 * 1024 });
    return reduceRollout(JSON.parse(stdout));
  } catch(error) {
    // execFile.message includes the entire embedded script. Show only the actual diagnostic.
    const e=error as {stderr?:string;killed?:boolean;code?:string};
    const detail=e.stderr?.trim().split(/\r?\n/).at(-1)?.slice(0,500);
    throw new Error(detail|| (e.killed?'Task log read timed out':`Task log read failed (${e.code??'invalid response'})`));
  }
}
