/* psygames-spatial-core-sixteen-solver-d · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
import type {Command} from './core.mjs';
export const SIXTEEN_3_MOVES:readonly Command[];
export function slideKey(key:string,moveIndex:number):string;
export function sixteenDistances(options?:{maxDepth?:number;nodeBudget?:number}):{entries:Map<string,{distance:number;parent:string|null;move:number|null}>;exhausted:boolean;maxDepth:number;solution(key:string):Command[]|null};
