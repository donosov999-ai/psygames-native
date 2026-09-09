/* psygames-spatial-core-frame · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/** Opt-in frame shared only by spatial warmup steps. Heights include padding. */
export function spatialFrame(height:number){
  return {stats:44,actions:56,toolbar:height<560?170:height<720?226:296};
}
