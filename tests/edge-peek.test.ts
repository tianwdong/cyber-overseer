import {test} from 'node:test';
import assert from 'node:assert/strict';
import {edgePeek} from '../src/core/edge-peek';
test('edge motion pauses before reaching, then settles without repeated pop-outs',()=>{
 assert.equal(edgePeek(200,0).headX,0);
 assert(edgePeek(1000,0).headX>edgePeek(500,0).headX);
 assert(edgePeek(4000,0).headX<edgePeek(1500,0).headX);
 assert.deepEqual(edgePeek(12000,0),edgePeek(24000,0));
 assert(edgePeek(4000,1).headX>edgePeek(4000,0).headX);
});
