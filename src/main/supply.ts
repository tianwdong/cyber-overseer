import {priceUsage,type PriceBook,type UsageSample} from '../core/pricing';
import {spawn} from 'node:child_process';
import { paths, runPython, findCodexBinary } from './platform';
import {join} from 'node:path';
import {decodeSupply,type AccountSupply,type TaskUsage} from '../core/supply';
// Native read-only RPC; Codex owns authentication. Never start a task or consume a reset.
export async function readAccountSupply():Promise<AccountSupply>{
 const binary=await findCodexBinary();
 return new Promise((resolve,reject)=>{
  const child=spawn(binary!,['app-server'],{stdio:['pipe','pipe','ignore'],windowsHide:true});let buffer='',done=false;
  const finish=(error?:Error,value?:AccountSupply)=>{if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill();const kill=setTimeout(()=>child.kill('SIGKILL'),1500);kill.unref();child.once('exit',()=>clearTimeout(kill));error?reject(error):resolve(value!);};
  const timer=setTimeout(()=>finish(Error('Usage read timed out')),15000);
  const send=(v:unknown)=>child.stdin.write(JSON.stringify(v)+'\n');
  child.stdin.on('error',()=>finish(Error('Codex service closed')));child.on('error',()=>finish(Error('Codex service unavailable')));child.on('exit',()=>{if(!done)finish(Error('Codex service closed'));});
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>2_000_000)return finish(Error('Invalid usage response'));let k;while((k=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,k);buffer=buffer.slice(k+1);let m:any;try{m=JSON.parse(line);}catch{continue;}
   if(m.id===1){if(m.error)return finish(Error('Codex initialization failed'));send({method:'initialized'});send({id:2,method:'account/rateLimits/read',params:null});}
   if(m.id===2){if(m.error)return finish(Error('Usage unavailable'));finish(undefined,decodeSupply(m.result));}
  }});
  send({id:1,method:'initialize',params:{clientInfo:{name:'cyber-overseer',version:'0.1.0'}}});
 });
}
// Stream usage metadata only; delta cumulative snapshots under their recorded model.
const script=`
import sqlite3,pathlib,json,sys
root=pathlib.Path(sys.argv[2])
c=sqlite3.connect((root/'state_5.sqlite').as_uri()+'?mode=ro',uri=True,timeout=2)
row=c.execute('select rollout_path from threads where id=?',(sys.argv[1],)).fetchone();c.close()
if not row: raise RuntimeError('Task unavailable')
p=pathlib.Path(row[0]).resolve()
if not any(p.is_relative_to((root/d).resolve()) for d in ['sessions','archived_sessions']): raise RuntimeError('Invalid path')
model=None;usage=None;previous=None;samples=[];uncertain=False
with p.open('rb') as f:
 first=json.loads(f.readline())
 if first.get('payload',{}).get('id')!=sys.argv[1]: raise RuntimeError('Identity mismatch')
 f.seek(0)
 for line in f:
  try:e=json.loads(line)
  except ValueError:continue
  q=e.get('payload') or {}
  if e.get('type')=='turn_context':model=q.get('model',model)
  if e.get('type')=='event_msg' and q.get('type')=='token_count':
   info=q.get('info') or {}
   total=info.get('total_token_usage')
   if total is not None:
    if previous is not None and total==previous:continue
    delta={k:total.get(k,0)-(previous or {}).get(k,0) for k in ['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens']}
    if any(v<0 for v in delta.values()):
     delta=info.get('last_token_usage')
     if not delta:uncertain=True;delta={}
    samples.append({'model':model or 'unknown','input':max(0,delta.get('input_tokens',0)-delta.get('cached_input_tokens',0)-delta.get('cache_write_input_tokens',0)),'cached':max(0,delta.get('cached_input_tokens',0)),'cacheWrite':max(0,delta.get('cache_write_input_tokens',0)),'output':max(0,delta.get('output_tokens',0)),'contextTokens':(info.get('last_token_usage') or {}).get('input_tokens',delta.get('input_tokens',0))})
    previous=total;usage=total
print(json.dumps({'model':model,'usage':usage,'samples':samples,'uncertain':uncertain}))
`;
const usageSamples=new Map<string,{samples:UsageSample[];uncertain:boolean}>();
export function repriceUsage(task:TaskUsage,book:PriceBook,error=false):TaskUsage {
 const data=usageSamples.get(task.id);const cost=data&&!data.uncertain?priceUsage(data.samples,book):{usd:null,unpriced:[]};
 return {...task,estimatedUSD:cost.usd,priceUpdatedAt:book.updatedAt,priceError:error,unpriced:cost.unpriced};
}
export async function readUsage(id:string):Promise<TaskUsage>{
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid task');
 const {stdout}=await runPython(['-c',script,id,paths.codexHome],{timeout:15000,maxBuffer:16*1024*1024});const r=JSON.parse(stdout),u=r.usage;
 const n=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
 usageSamples.set(id,{samples:r.samples,uncertain:r.uncertain});if(usageSamples.size>20)usageSamples.delete(usageSamples.keys().next().value!);
 // Reasoning is already included in output_tokens for the installed Codex schema.
 return {id,model:r.model??null,tokens:n(u?.total_tokens),cached:n(u?.cached_input_tokens),fetchedAt:Date.now(),estimatedUSD:null};
}
