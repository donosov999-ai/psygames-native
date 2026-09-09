/* psygames-mental-rotation-levels · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Axis} from './types';

export interface RotationLevelSpec {
  level:number; cubes:number; path:Axis[]; optionCount:number;
  foil:'mixed'|'one-cube'; change:string;
}

// Each row changes an actual task constraint. Human difficulty at transitions
// between cube counts still needs calibration; no claim of a psychometric scale.
const patterns:{path:Axis[];optionCount:number;foil:'mixed'|'one-cube';text:string}[]=[
  {path:['z'],optionCount:3,foil:'mixed',text:'90°/180° вокруг Z, три варианта'},
  {path:['z','z'],optionCount:3,foil:'mixed',text:'180°/270° вокруг Z, три варианта'},
  {path:['x','y'],optionCount:3,foil:'mixed',text:'X90° → Y90°/180°, три варианта'},
  {path:['x','y','y'],optionCount:4,foil:'mixed',text:'X90° → Y180°/270°, четыре варианта'},
  {path:['x','y','y'],optionCount:4,foil:'one-cube',text:'X90° → Y180°/270°; подделки отличаются перестановкой одного кубика'},
];
export const ROTATION_LEVELS:readonly RotationLevelSpec[]=Array.from({length:50},(_,i)=>{
  const p=patterns[i%5],cubes=4+Math.floor(i/5);
  return {level:i+1,cubes,path:[...p.path],optionCount:p.optionCount,foil:p.foil,change:`${cubes} кубиков: ${p.text}.`};
});
export function rotationLevelSpec(level:number):RotationLevelSpec {
  if(!Number.isFinite(level))throw new RangeError('rotation level');
  return ROTATION_LEVELS[Math.max(0,Math.min(49,Math.floor(level)-1))];
}
