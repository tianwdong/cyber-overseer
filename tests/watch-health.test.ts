import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchHealth} from '../src/core/watch-health';
import type {OverseerState} from '../src/core/model';
const state=():OverseerState=>({character:'foreman',mode:'live',tasks:[],selectedId:null,location:{kind:'unlocated',reason:'hidden'},phase:'idle',message:'',snapshotAgeMs:null,watchingIds:['a'],health:{connectionSince:{a:1000},taskErrors:{a:{dispatch:1000}},dispatchAt:500}});
test('health grants reconnect time; old successful dispatch does not hide a current failure',()=>{const s=state();assert.deepEqual(watchHealth(s,30999),[]);assert.deepEqual(watchHealth(s,31000).map(i=>i.kind),['connection','dispatch']);});
test('quiet running tasks are healthy; paused tasks no longer alert',()=>{const s=state();s.liveStates={a:{threadId:'a',connection:'live',work:'running',activity:'none',label:'Working',updatedAt:1}};s.health!.taskErrors={};assert.deepEqual(watchHealth(s,999999),[]);s.liveStates={};s.watchingIds=[];assert.deepEqual(watchHealth(s,999999),[]);});
test('storage and discovery failures are distinct; discovery does not flood on each refresh',()=>{const s=state();s.watchingIds=[];s.inventoryError='unavailable';s.health={journalError:true,discoveryFailedAt:1000};assert.deepEqual(watchHealth(s,2000).map(i=>i.kind),['storage']);assert.deepEqual(watchHealth(s,31000).map(i=>i.kind),['discovery','storage']);assert.equal(watchHealth(s,32000)[0].since,1000);});

test('global pause suppresses obsolete discovery warnings',()=>{const s=state();s.autoAll=false;s.watchingIds=[];s.inventoryError='old failure';s.health={discoveryFailedAt:1};assert.deepEqual(watchHealth(s,999999),[]);});
