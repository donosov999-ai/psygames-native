/* psygames-spatial-core-sixteen-levels-d · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
import type {Board,Command} from './core.mjs';
export interface SixteenLevelSpec {level:number;width:number;distance?:number;displacement?:number;guide:boolean}
export interface SixteenLevelTask {level:number;seed:number;spec:SixteenLevelSpec;initial:Board;solution:Command[];minimumMoves:number|null;lowerBound?:number;guide:Command|null}
export const SIXTEEN_LEVELS:SixteenLevelSpec[];
export function sixteenDisplacement(board:Board):{total:number;lowerBound:number};
export function sixteenLevel(level:number,seed:number):SixteenLevelTask;
