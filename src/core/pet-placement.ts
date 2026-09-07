export type DockEdge = 'left' | 'right';
export function petPlacement(x:number,y:number,width:number,height:number,edge?:DockEdge) {
  const dock = edge ?? (x<=48?'left':x>=width-48?'right':undefined);
  return {x:dock==='left'?22:dock==='right'?width-22:Math.max(80,Math.min(width-80,x)),y:Math.max(110,Math.min(height-85,y)),dock};
}
