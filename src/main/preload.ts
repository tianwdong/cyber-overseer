import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('overseer', {
  state: () => ipcRenderer.invoke('state'),
  command: (name: string, value?: string) => ipcRenderer.invoke('command', name, value),
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('state', (_e, state) => callback(state)); },
  onMove: (callback: (move: unknown) => void) => { ipcRenderer.on('move-pet', (_e, move) => callback(move)); },
  onInbox: (callback:(id:string)=>void) => {ipcRenderer.on('open-inbox',(_e,id)=>callback(id));},
  onTask: (callback:()=>void) => {ipcRenderer.on('open-task',callback);},
  onSettings: (callback:()=>void) => {ipcRenderer.on('open-settings',callback);},
  petDrag: (phase:string,x:number,y:number) => ipcRenderer.invoke('pet-drag',phase,x,y),
  petPointer: (over: boolean) => ipcRenderer.send('pet-pointer', over),
  petAction: (action: string,value?:string) => ipcRenderer.invoke('pet-action', action,value),
});
