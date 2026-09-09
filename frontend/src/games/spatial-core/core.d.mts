/* psygames-spatial-core-core-d · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
export interface Cell { id: number; turns: number; mask?: number }
export interface Board { width: number; height: number; cells: Cell[] }
export type Command = {kind:'tile';index:number;amount?:number} | {kind:'block';row:number;col:number;size:number;amount?:number;orient?:boolean} | {kind:'row'|'column';index:number;amount?:number};
export interface Session {initial:Board;present:Board;past:Command[];future:Command[]}
export function board(width:number,height?:number):Board;
export function apply(b:Board,c:Command):Board;
export function inverse(c:Command):Command;
export function replay(b:Board,c:Command[]):Board;
export function solved(b:Board):boolean;
export function session(b:Board):Session;
export function commit(s:Session,c:Command):Session;
export function undo(s:Session):Session;
export function redo(s:Session):Session;
export function scramble(seed:number,depth?:number):{initial:Board;solution:Command[];scramble:Command[]};
export function rng(seed:number):()=>number;
