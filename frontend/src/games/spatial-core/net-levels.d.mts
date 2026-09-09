/* psygames-spatial-core-net-levels-d · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Board,Command} from './core.mjs';
export interface NetLevelSpec {
  level:number; width:number; repair:string; highlight:boolean; lockCorrect:boolean;
  liveColour:boolean; change:string; affected?:number; cycles?:number; junctions?:number;
}
export interface NetLevelTask {
  level:number; seed:number; spec:NetLevelSpec; initial:Board; target:Board;
  solution:Command[]; locked:number[]; highlighted:number[]; metrics:Record<string,number>;
}
export const NET_LEVELS:NetLevelSpec[];
export function netLevel(level:number,seed:number):NetLevelTask;
