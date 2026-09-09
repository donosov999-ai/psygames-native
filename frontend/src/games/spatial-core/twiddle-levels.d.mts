/* psygames-spatial-core-twiddle-levels-d · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Board,Command} from './core.mjs';
export interface TwiddleLevelSpec {level:number;width:number;distance?:number;displacement?:number;guide:boolean;liveColour:boolean;change:string}
export interface TwiddleLevelTask {level:number;seed:number;spec:TwiddleLevelSpec;initial:Board;solution:Command[];minimumMoves:number|null;lowerBound?:number;guide:Command|null}
export const TWIDDLE_LEVELS:TwiddleLevelSpec[];
export function twiddleLevel(level:number,seed:number):TwiddleLevelTask;
export function twiddleDisplacement(board:Board):number;
