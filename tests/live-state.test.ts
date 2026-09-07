import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConversationFeed,summarizeConversation,permitsRecovery} from '../src/core/live-state';
const conversation=(status='inProgress',items:any[]=[])=>({id:'task-A',resumeState:'resumed',requests:[],turnHistory:{kind:'canonical',history:{entitiesByKey:{latest:{turnId:'turn-A',status,items}},islands:[{entries:[{value:'latest'}]}]}}});
test('canonical task stream drives working, waiting, retrying and unread completion',()=>{
  const c=conversation('inProgress',[{type:'commandExecution',status:'inProgress'}]);
  assert.equal(summarizeConversation(c,1).activity,'command');
  c.requests.push({method:'item/tool/requestUserInput'} as never);assert.equal(summarizeConversation(c,2).work,'waiting');
  c.requests=[];c.turnHistory.history.entitiesByKey.latest.items=[{type:'error',willRetry:true}];assert.equal(summarizeConversation(c,3).work,'retrying');
  c.turnHistory.history.entitiesByKey.latest.status='completed';assert.equal(summarizeConversation({...c,hasUnreadTurn:true},4).work,'review');
  assert.equal(summarizeConversation(c,5).work,'idle');
});
test('finished tools do not pretend to be executing; compaction has its own activity',()=>{
  assert.equal(summarizeConversation(conversation('inProgress',[{type:'commandExecution',status:'completed'}]),1).activity,'none');
  assert.equal(summarizeConversation(conversation('inProgress',[{type:'contextCompaction'}]),1).activity,'compacting');
  assert.equal(summarizeConversation(conversation('interrupted'),1).work,'idle');
});
test('snapshots and array patches preserve revision and full task identity',()=>{
  const feed=new ConversationFeed('task-A');feed.accept({type:'snapshot',revision:10,conversationState:conversation()});
  const path=['turnHistory','history','entitiesByKey','latest','items'];
  const s=feed.accept({type:'patches',baseRevision:10,revision:11,patches:[{op:'add',path:[...path,0],value:{type:'fileChange',status:'inProgress'}}]});
  assert.equal(s?.activity,'files');assert.equal(feed.revision,11);
  assert.equal(feed.accept({type:'snapshot',revision:10,conversationState:conversation('failed')}),undefined);
  assert.throws(()=>feed.accept({type:'patches',baseRevision:9,revision:12,patches:[]}));
  assert.throws(()=>feed.accept({type:'snapshot',revision:12,conversationState:{id:'task-B'}}));
  assert.equal(feed.revision,11);
  const recovered=feed.accept({type:'patches',baseRevision:11,revision:12,patches:[{op:'remove',path:[...path,0]}]});assert.equal(recovered?.activity,'none');
});
test('invalid patches cannot partially mutate state or pollute prototypes',()=>{
  const feed=new ConversationFeed('task-A');feed.accept({type:'snapshot',revision:0,conversationState:conversation()});
  for(const path of [['__proto__','polluted'],['constructor','prototype','polluted'],['missing','x']])assert.throws(()=>feed.accept({type:'patches',baseRevision:0,revision:1,patches:[{op:'replace',path:['resumeState'],value:'resuming'},{op:'add',path,value:true}]}));
  assert.equal(feed.revision,0);assert.equal(({} as any).polluted,undefined);
});
test('live running, approval, internal retry and newer turns veto durable stale failures',()=>{
  const failed={status:'failed' as const,turnId:'turn-A'},live=summarizeConversation(conversation(),1);
  for(const work of ['running','waiting','retrying','review','idle','unknown'] as const)assert.equal(permitsRecovery({...live,work},failed),false);
  assert.equal(permitsRecovery({...live,work:'failed'},failed),true);
  assert.equal(permitsRecovery({...live,work:'failed',turnId:'new'},failed),false);
  assert.equal(permitsRecovery({...live,connection:'disconnected'},failed),true);
  assert.equal(permitsRecovery({...live,connection:'connecting'},failed),false);
});
