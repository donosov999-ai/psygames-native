/* psygames-game-spatial-lab · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
// Local game route: existing overlay policies apply. Not added to the catalog.
import React,{useRef} from 'react';
import {useRouter} from 'expo-router';
import SpatialLab from '@/src/components/SpatialLab';
import {useGamePreset} from '@/src/hooks/useGamePreset';
import {useCalmHush} from '@/src/hooks/useCalmHush';
import {useWarmup} from '@/src/contexts/WarmupContext';
import {gameNow} from '@/src/services/gamePause';
export default function SpatialLabRoute(){
  const router=useRouter(),params=useGamePreset(),warmup=useWarmup(),started=useRef(gameNow());
  /*
   * Вечер и ночь: звуки игры молчат, как во всех остальных. Тумблер человека при
   * этом не перезаписывается — за это отвечает сам хук.
   *
   * ⚠️ Флаг берётся ИЗ `useGamePreset()` разбором, а не подставляется: гейт
   * `calm-hush-everywhere` сторожит именно происхождение аргумента — подставленная
   * там ложь прошла бы проверку «хук позван» и не глушила бы ничего, молча.
   */
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const mode=params.str('mode')==='net'?'net':'twiddle';
  const level=Math.max(1,Math.min(50,params.num('level',1)));
  const seed=Math.max(0,Math.min(0xffffffff,params.num('seed',42)));
  return <SpatialLab onBack={()=>router.back()} preset={params.isPreset?{mode,level,seed}:undefined}
    onComplete={async result=>{
      const step=warmup.currentStep,index=warmup.currentIdx;
      if(!params.isPreset||!warmup.active||step?.game_route!=='/games/spatial-lab'||step.mode!==result.mode)return;
      await warmup.recordResult({game_type:step.game_id,score:0,time_seconds:(gameNow()-started.current)/1000,errors:0,details:{level:result.level,moves:result.moves,localSpatialLab:true}});
      warmup.advanceToNext(index);
    }}/>
}
