import {test} from 'node:test';
import assert from 'node:assert/strict';
import {petPlacement} from '../src/core/pet-placement';
test('edge drops keep a reachable head while ordinary drops remain freely placed',()=>{
 assert.deepEqual(petPlacement(10,300,1440,900),{x:22,y:300,dock:'left'});
 assert.deepEqual(petPlacement(1430,300,1440,900),{x:1418,y:300,dock:'right'});
 assert.deepEqual(petPlacement(500,300,1440,900),{x:500,y:300,dock:undefined});
});
test('persisted docking follows changed display width and keeps corners reachable',()=>{
 assert.deepEqual(petPlacement(1418,-30,1920,1080,'right'),{x:1898,y:110,dock:'right'});
 assert.equal(petPlacement(20,4000,1440,900).y,815);
});
