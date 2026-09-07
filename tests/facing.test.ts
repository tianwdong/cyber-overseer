import test from 'node:test';
import assert from 'node:assert/strict';
import {desiredHeading,turnFacing} from '../src/core/facing';
test('travel direction wins over either dock side; only arrival faces the window',()=>{
  for(const dock of ['left','right']){assert.equal(desiredHeading(80,80,dock,'left'),'right');assert.equal(desiredHeading(-80,80,dock,'right'),'left');}
  assert.equal(desiredHeading(0,0,'right','right'),'left');assert.equal(desiredHeading(0,0,'left','left'),'right');
  assert.equal(desiredHeading(.1,40,'left','left'),'left');
});
test('a reversal stops travel until the cat faces its new direction',()=>{
  let angle=0,frames=0;
  do{const next=turnFacing(angle,'left',1/60);assert(next.angle>=angle);assert(Math.abs(next.scale)<=1);angle=next.angle;frames++;if(!next.turning){assert.equal(next.scale,-1);break;}assert(frames<20);}while(true);
  assert(frames>=10);
  const reversing=turnFacing(Math.PI/2,'right',1/60);assert(reversing.angle<Math.PI/2);assert(reversing.turning);
});
