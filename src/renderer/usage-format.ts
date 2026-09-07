export function usageMoney(value:number|null,en:boolean){
 if(value===null)return en?'Unpriced':'未完整计价';
 if(value>0&&value<0.01)return '<$0.01';
 return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
}
export function usageShare(value:number){
 const v=Math.min(100,Math.max(0,value));
 if(v>0&&v<0.1)return '<0.1%';
 if(v>99.9&&v<100)return '>99.9%';
 return `${v.toFixed(1)}%`;
}
export function usageCalls(count:number,en:boolean){return `${count.toLocaleString(en?'en-US':'zh-CN')} ${en?(count===1?'call':'calls'):'次调用'}`;}
