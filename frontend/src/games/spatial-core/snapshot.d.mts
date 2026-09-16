/* psygames-spatial-core-snapshot-d · VER 2 · 17.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Session} from './core.mjs';
import type {NetLevelTask} from './net-levels.mjs';
import type {TwiddleLevelTask} from './twiddle-levels.mjs';
import type {SixteenLevelTask} from './sixteen-levels.mjs';
import type {NetslideLevelTask} from './netslide-levels.mjs';
export type SpatialMode='twiddle'|'net'|'sixteen'|'netslide';
type Unlocked={locked:number[];highlighted:number[]};
export type SpatialTask=NetLevelTask|(TwiddleLevelTask&Unlocked)|(SixteenLevelTask&Unlocked)|(NetslideLevelTask&Unlocked);
export interface SpatialDeal {task:SpatialTask|null;state:Session;selection:number}
export interface SnapshotInput {mode:SpatialMode;seed:number;level:number;selection:number;state:Session;completed:Record<SpatialMode,number[]>}
export const SPATIAL_MODES:SpatialMode[];
export function shifts(mode:SpatialMode):boolean;
export function createDeal(mode:SpatialMode,seed:number,level?:number):SpatialDeal;
export function encodeSnapshot(input:SnapshotInput):string;
export function decodeSnapshot(raw:string|null):null|(SnapshotInput&SpatialDeal);
