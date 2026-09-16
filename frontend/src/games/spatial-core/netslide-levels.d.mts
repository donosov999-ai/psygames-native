/* psygames-spatial-core-netslide-levels-d · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
import type {Board,Command} from './core.mjs';
export interface NetslideLevelSpec {level:number;width:number;shifts:number;guide:boolean}
export interface NetslideLevelTask {level:number;seed:number;spec:NetslideLevelSpec;initial:Board;target:Board;solution:Command[];shifts:number;guide:Command|null}
export const NETSLIDE_LEVELS:NetslideLevelSpec[];
export function sourceAt(board:Board):number;
export function netslideWon(board:Board):boolean;
export function netslideLevel(level:number,seed:number):NetslideLevelTask;
