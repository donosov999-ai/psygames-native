/* psygames-spatial-core-net-d · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Board,Cell,Command} from './core.mjs';
export function maskAt(c:Cell):number;
export function network(b:Board):{leaks:number;connected:Set<number>;won:boolean};
export function netPuzzle(seed:number,options?:{width?:number;cycles?:number}):{initial:Board;target:Board;solution:Command[]};
