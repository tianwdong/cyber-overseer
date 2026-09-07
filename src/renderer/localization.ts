import {tr} from '../core/i18n';
import type {Language} from '../core/settings';
// Capture authored static text once, before tasks and server messages are rendered.
const nodes:Array<{node:Text;text:string}>=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){const node=walker.currentNode as Text;if(/[\u4e00-\u9fff]/.test(node.data))nodes.push({node,text:node.data});}
export function translateStatic(language:Language){
  document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=language==='zh'?'Cyber Overseer · 赛博督工':'Cyber Overseer';
  for(const {node,text} of nodes)if(node.isConnected)node.data=text.replace(text.trim(),tr(text.trim(),language));
  document.getElementById('close-settings')?.setAttribute('aria-label',tr('关闭设置',language));
  document.getElementById('close-characters')?.setAttribute('aria-label',tr('关闭角色工坊',language));
}
