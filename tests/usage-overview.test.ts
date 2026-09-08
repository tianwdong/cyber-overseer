import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runPython} from '../src/main/platform';
import {aggregateUsage,usageStart,type MeterScan} from '../src/core/usage-overview';
import type {PriceBook} from '../src/core/pricing';
const book:PriceBook={version:1,currency:'USD',unit:'per_million_tokens',updatedAt:'2026-09-07',models:{known:{input:1,cached:0.1,output:2,source:'https://example.com'}}};
test('daily usage uses event dates, input includes cache once and unknown pricing stays unknown',()=>{
 const now=new Date(2026,8,7,12).getTime(),at=new Date(2026,8,6,23).getTime();
 const scan:MeterScan={samples:[{at,threadId:'a',project:'/a/same',model:'known',input:80,cached:20,cacheWrite:0,output:40,contextTokens:100},{at:now,threadId:'b',project:'/b/same',model:'new',input:10,cached:0,cacheWrite:0,output:5,contextTokens:10}],files:2,scanned:2,pending:0,errors:0,excludedForks:0,fetchedAt:now};
 const result=aggregateUsage(scan,book,now);assert.equal(result.today.tokens,15);assert.equal(result.today.cost,null);assert.deepEqual(result.today.unpriced,['new']);assert.equal(result.days[5].tokens,140);assert.equal(result.days[5].input,100);assert.equal(result.projects.length,2);assert.equal(result.days.length,7);
 const repriced=aggregateUsage(scan,{...book,models:{...book.models,new:book.models.known}},now);assert.notEqual(repriced.today.cost,null);
});
test('mixed usage shows the priced subtotal and keeps unpriced calls, tokens and tasks in every group',()=>{
 const now=new Date(2026,8,7,12).getTime(),known={at:now,threadId:'a',project:'/p',model:'known',input:1000000,cached:0,cacheWrite:0,output:0,contextTokens:1000000};
 const scan:MeterScan={samples:[known,{...known,input:500000},{...known,threadId:'b',model:'codex-auto-review',input:10,cached:20,cacheWrite:30,output:40}],files:2,scanned:2,pending:0,errors:0,excludedForks:0,fetchedAt:now};
 const result=aggregateUsage(scan,book,now),expected={tokens:1500100,input:1500060,cached:20,output:40,cost:1.5,unpriced:['codex-auto-review'],unpricedCalls:1,unpricedTokens:100,calls:3,tasks:2};
 assert.deepEqual(result.today,expected);
 for(const period of Object.values(result.periods)){assert.deepEqual(period.totals,expected);assert.deepEqual(period.projects,[{path:'/p',...expected}]);assert.deepEqual(period.days.at(-1),{day:'2026-09-07',...expected});}
 const detail=result.details['2026-09-07'];assert.equal(detail.models.find(m=>m.model==='known')!.cost,1.5);assert.equal(detail.models.find(m=>m.model==='codex-auto-review')!.cost,null);assert.equal(detail.threads.find(t=>t.threadId==='b')!.unpricedTokens,100);assert.equal(result.monthProjection,null);
});
test('all-unpriced usage stays unknown while empty periods and known zero costs remain zero',()=>{
 const now=new Date(2026,8,7,12).getTime(),event={at:now,threadId:'a',project:'/p',model:'codex-auto-review',input:10,cached:0,cacheWrite:0,output:0,contextTokens:10};
 const scan:MeterScan={samples:[event],files:1,scanned:1,pending:0,errors:0,excludedForks:0,fetchedAt:now};
 const unknown=aggregateUsage(scan,book,now);assert.equal(unknown.today.cost,null);assert.equal(unknown.today.unpricedCalls,1);assert.equal(unknown.today.unpricedTokens,10);assert.equal(unknown.monthProjection,null);
 const empty=aggregateUsage({...scan,samples:[]},book,now);assert.equal(empty.today.cost,0);assert.equal(empty.today.unpricedCalls,0);assert.equal(empty.today.unpricedTokens,0);
 const freeBook={...book,models:{known:{...book.models.known,input:0,cached:0,output:0}}};
 const zero=aggregateUsage({...scan,samples:[{...event,model:'known'}]},freeBook,now);assert.equal(zero.today.cost,0);assert.equal(zero.today.unpricedCalls,0);assert.equal(zero.monthProjection,0);
 const partialZero=aggregateUsage({...scan,samples:[event,{...event,model:'known'}]},freeBook,now);assert.equal(partialZero.today.cost,0);assert.equal(partialZero.today.unpricedCalls,1);assert.equal(partialZero.monthProjection,null);
});
test('a partially priced model contributes its known events to usage totals',()=>{
 const now=new Date(2026,8,7,12).getTime(),event={at:now,threadId:'a',project:'/p',model:'known',input:1000000,cached:0,cacheWrite:0,output:0,contextTokens:1000000};
 const result=aggregateUsage({samples:[event,{...event,cacheWrite:100}],files:1,scanned:1,pending:0,errors:0,excludedForks:0,fetchedAt:now},book,now);
 assert.equal(result.today.cost,1);assert.equal(result.today.calls,2);assert.equal(result.today.tokens,2000100);assert.equal(result.today.unpricedCalls,1);assert.equal(result.today.unpricedTokens,1000100);assert.deepEqual(result.today.unpriced,['known']);assert.equal(result.periods.today.models[0].cost,1);assert.equal(result.monthProjection,null);
});
test('scanner caches deltas, handles last-only, truncation, partial lines, forks and model switches',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'overseer-meter-'));try{
 const sessions=join(dir,'sessions');await mkdir(sessions);const file=join(sessions,'one.jsonl'),fork=join(sessions,'fork.jsonl'),cache=join(dir,'meter.json'),at=new Date().toISOString();
 const meta=(id:string,extra={})=>JSON.stringify({type:'session_meta',payload:{id,...extra}})+'\n';
 const context=(model:string)=>JSON.stringify({type:'turn_context',payload:{model}})+'\n';
 const event=(input:number,output:number,total=true,time=at)=>JSON.stringify({type:'event_msg',timestamp:time,payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,output_tokens:output,reasoning_output_tokens:output/2},...(total?{total_token_usage:{input_tokens:input,output_tokens:output}}:{})}}})+'\n';
 await writeFile(file,meta('one')+context('known')+event(100,50)+event(100,50));await writeFile(fork,meta('fork',{forked_from_id:'one'})+event(100,50));
 await runPython(['-c',"import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]);c.execute('create table threads(id text, rollout_path text,cwd text,updated_at integer)');c.executemany('insert into threads values(?,?,?,?)', [('one',sys.argv[2],'/a',int(time.time())),('fork',sys.argv[3],'/b',int(time.time()))]);c.commit()",join(dir,'state_5.sqlite'),file,fork],{timeout:10000,maxBuffer:2000000});
 const scan=async()=>JSON.parse((await runPython([join(process.cwd(),'scripts/usage-scan.py'),dir,cache,String(usageStart())],{timeout:10000,maxBuffer:2000000})).stdout) as MeterScan;
 let r=await scan();assert.equal(r.samples.length,1);assert.equal(r.samples[0].output,50);assert.equal(r.excludedForks,1);assert.equal((await scan()).scanned,0);
 await appendFile(file,context('new')+event(120,60));r=await scan();assert.equal(r.samples.length,2);assert.equal(r.samples[1].input,20);assert.equal(r.samples[1].model,'new');
 await writeFile(file,meta('one')+context('known')+event(500,200,false)+event(100,50,false));r=await scan();assert.equal(r.samples.length,2);assert.equal(r.samples.reduce((s,e)=>s+e.input+e.output,0),850);
 const partial=event(20,10,false,new Date(Date.now()+1).toISOString());await appendFile(file,partial.slice(0,-1));r=await scan();assert.equal(r.samples.length,2);assert.ok(r.pending);await appendFile(file,'\n');r=await scan();assert.equal(r.samples.length,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('periods count active tasks once and separate today, month and rolling days',()=>{
 const now=new Date(2026,8,7,12).getTime();const event=(at:number,threadId='a')=>({at,threadId,project:'/p',model:'known',input:1000000,cached:0,cacheWrite:0,output:0,contextTokens:1000000});
 const scan:MeterScan={samples:[event(now),event(now-1000),event(new Date(2026,8,1,12).getTime(),'b'),event(new Date(2026,7,31,12).getTime(),'c'),event(new Date(2026,7,1).getTime())],files:3,scanned:3,pending:0,errors:0,excludedForks:0,fetchedAt:now};
 const u=aggregateUsage(scan,book,now);assert.equal(u.periods.today.totals.calls,2);assert.equal(u.periods.today.totals.tasks,1);assert.equal(u.periods.month.totals.cost,3);assert.equal(u.periods['30d'].totals.cost,4);assert.equal(u.periods['7d'].totals.calls,3);assert.equal(u.periods['30d'].days.length,30);assert.equal(u.activeDays,3);assert.ok(Math.abs(u.monthProjection!-3/6.5*30)<1e-9);
});
test('day drilldown preserves task identity and model totals without mixing adjacent dates',()=>{
 const now=new Date(2026,8,7,12).getTime();const events=[{at:now,threadId:'a',project:'/p',model:'known',input:100,cached:0,cacheWrite:0,output:0,contextTokens:100},{at:now,threadId:'a',project:'/p',model:'new',input:50,cached:0,cacheWrite:0,output:0,contextTokens:50},{at:now-86400000,threadId:'b',project:'/p',model:'known',input:20,cached:0,cacheWrite:0,output:0,contextTokens:20}];
 const result=aggregateUsage({samples:events,files:2,scanned:2,pending:0,errors:0,excludedForks:0,fetchedAt:now},book,now);const day=result.details['2026-09-07'];assert.equal(day.models.length,2);assert.equal(day.threads.length,1);assert.equal(day.threads[0].threadId,'a');assert.equal(day.threads[0].tokens,150);assert.equal(day.threads[0].cost,.0001);assert.equal(day.threads[0].unpricedCalls,1);assert.equal(day.threads[0].unpricedTokens,50);assert.equal(result.details['2026-09-06'].threads[0].threadId,'b');assert.equal(result.details['2026-09-05'].threads.length,0);
});
