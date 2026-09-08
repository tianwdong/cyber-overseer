import type { PetMove } from '../core/characters';
import type { OverseerState } from '../core/model';
export {};
declare global {
  interface Window {
    overseer: {
      state(): Promise<OverseerState>;
      command(name: string, value?: string): Promise<OverseerState>;
      onTask(callback:()=>void):void;
      onInbox(callback:(id:string)=>void):void;
      onSettings(callback:()=>void):void;
      petDrag(phase:'start'|'end'|'cancel',x:number,y:number):Promise<{x:number;y:number;dock?:import("../core/pet-placement").DockEdge}>;
      petPointer(over:boolean):void;
      petAction(action:'settings'|'menu'|'pricing'|'task'|'result'|'open-codex'|'performance-done',value?:string):Promise<void>;
      onState(callback: (state: OverseerState) => void): void;
      onMove(callback: (move: PetMove) => void): void;
    };
  }
}
