import {test} from 'node:test';import assert from 'node:assert/strict';
import {recoverySummary} from '../src/core/recovery-summary';import type {DutyEntry} from '../src/main/duty-journal';
const entry=(id:string,threadId:string,episodeId:string,kind:DutyEntry['kind'],at:number):DutyEntry=>({id,threadId,kind,at,context:{episodeId,failedTurnId:episodeId,reason:'network'}});
test('recovery summary separates requests from confirmations and scopes episodes to full task IDs',()=>{
 const sent=entry('1','a','turn','continue',1);const rows=[sent,sent,entry('2','a','turn','checking',2),entry('3','a','turn','recovered',3),entry('4','a','turn2','continue',4),entry('5','a','turn2','exhausted',5),entry('6','b','turn','continue',6),entry('7','b','turn','completed',7),entry('8','c','waiting','waiting',8),{id:'old',threadId:'a',kind:'recovered' as const,at:0}];
 const result=recoverySummary(rows);assert.equal(result.incidents,3);assert.equal(result.requests,3);assert.equal(result.recovered,1);assert.equal(result.unconfirmed,1);assert.deepEqual(result.repeated,[['a',2]]);assert.equal(result.unattributed,1);
});
