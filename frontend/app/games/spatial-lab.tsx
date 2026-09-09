/* psygames-game-spatial-lab · VER 2 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/**
 * Маршрут лаборатории: экран Codex (`SpatialLab`) + стандарт каркаса поверх него.
 *
 * 09.09.2026, решение Дениса: «Поворот чисел» и «Сеть труб» входят в развилку «Ментальная
 * ротация» вместе с ротацией фигур. Чтобы игра жила в каталоге, гейт `game-standard` требует
 * четырёх вещей — они здесь, а не внутри экрана Codex (его механика не тронута):
 *   · прогресс, переживающий сессию — `usePersistentLevel` на каждое из двух упражнений;
 *   · тропинка уровней — `LevelProgressMap` в шапке экрана (слот `header`);
 *   · общий экран итога — `LevelCleared`, «дальше» запрашивает следующий уровень у экрана;
 *   · уровень в сессии — `saveSession` с `details.level`.
 *
 * ЛЕСТНИЦА ОДНОСТОРОННЯЯ: головоломка без проигрыша — понижать нечего (гейт passed-coverage).
 * Звёзды — 3 за собранный уровень; шкала по числу ходов против оптимума — задача раздела.
 */
import React,{useRef,useState} from 'react';
import {useRouter} from 'expo-router';
import SpatialLab from '@/src/components/SpatialLab';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import {useGamePreset} from '@/src/hooks/useGamePreset';
import {useCalmHush} from '@/src/hooks/useCalmHush';
import {usePersistentLevel} from '@/src/hooks/usePersistentLevel';
import {useWarmup} from '@/src/contexts/WarmupContext';
import {useTheme} from '@/src/contexts/ThemeContext';
import {useLanguage} from '@/src/contexts/LanguageContext';
import {gameNow} from '@/src/services/gamePause';
import {saveSession} from '@/src/services/api';

const GRADIENT = ['#38bdf8', '#6366f1'];
type Mode = 'net' | 'twiddle';

type Result = {mode:Mode;level:number;moves:number};

/**
 * Стандарт каркаса поверх экрана Codex — отдельным хуком, чтобы сам маршрут остался тонким
 * (пробы читают экран за делегированием: первый `return <SpatialLab …>` в теле маршрута).
 */
function useSpatialLabStandard(mode:Mode,isPreset:boolean){
  const warmup=useWarmup(),started=useRef(gameNow());
  const { colors } = useTheme();
  const { language } = useLanguage();
  // Две лестницы — по упражнению (две карточки одной развилки); оба хука зовутся всегда.
  const lvlNet = usePersistentLevel('spatial_lab_net');
  const lvlTwiddle = usePersistentLevel('spatial_lab_twiddle');
  const lvlFor = (m:Mode) => (m==='net'?lvlNet:lvlTwiddle);
  const lvl = lvlFor(mode);
  const gameId = (m:Mode) => (m==='net'?'spatial_lab_net':'spatial_lab_twiddle');
  const [cleared,setCleared]=useState<Result|null>(null);
  const api=useRef<{request:(level:number)=>void}|null>(null);
  const askLevel=(l:number)=>api.current?.request(l);
  const onDone=async(result:Result)=>{
    if(isPreset){
      const step=warmup.currentStep,index=warmup.currentIdx;
      if(!warmup.active||step?.game_route!=='/games/spatial-lab'||step.mode!==result.mode)return;
      await warmup.recordResult({game_type:step.game_id,score:0,time_seconds:(gameNow()-started.current)/1000,errors:0,details:{level:result.level,moves:result.moves,localSpatialLab:true}});
      warmup.advanceToNext(index);
      return;
    }
    if(result.level<=0)return;   // свободная игра — не уровень: лестницу и сессию не трогаем
    const doneLevel=result.level;
    lvlFor(result.mode).reach(doneLevel+1);   // ЛЕСТНИЦА ОДНОСТОРОННЯЯ — см. шапку файла
    const finalTime=(gameNow()-started.current)/1000;
    started.current=gameNow();
    try{
      await saveSession({
        passed: true,   // сессия пишется только собранным уровнем
        game_type: 'spatial_lab',
        score: Math.max(0, 1000 - result.moves * 5),
        time_seconds: finalTime,
        difficulty: doneLevel<=15?'easy':doneLevel<=35?'medium':'hard',
        mode: result.mode,
        errors: 0,
        details: { level: doneLevel, moves: result.moves, exercise: result.mode },
      });
    }catch{ /* офлайн — очередь api дошлёт */ }
    setCleared(result);
  };
  const header = isPreset ? undefined :
    <LevelProgressMap gameId={gameId(mode)} currentLevel={lvl.level} bestLevel={lvl.best} maxLevel={50}
      onPickLevel={(l:number)=>{lvl.pick(l);askLevel(l);}} colors={colors} language={language} />;
  const overlay = cleared ?
    <LevelCleared variant="overlay" gameId={gameId(cleared.mode)} level={cleared.level} stars={3} passed
      gradient={GRADIENT} language={language} colors={colors}
      onContinue={()=>{const next=Math.min(50,cleared.level+1);setCleared(null);askLevel(next);}}
      onStop={()=>setCleared(null)} /> : undefined;
  return { header, overlay, onDone, onReady:(a:{request:(level:number)=>void})=>{api.current=a;} };
}

export default function SpatialLabRoute(){
  const router=useRouter(),params=useGamePreset();
  // Вечер и ночь — звуки молчат, как везде; флаг ИЗ useGamePreset (гейт calm-hush-everywhere сторожит происхождение).
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const mode:Mode=params.str('mode')==='net'?'net':'twiddle';
  const level=Math.max(1,Math.min(50,params.num('level',1)));
  const seed=Math.max(0,Math.min(0xffffffff,params.num('seed',42)));
  const std=useSpatialLabStandard(mode,params.isPreset);
  return <SpatialLab onBack={()=>router.back()} preset={params.isPreset?{mode,level,seed}:undefined} initialMode={mode}
    onReady={std.onReady} onComplete={std.onDone} header={std.header} overlay={std.overlay} />;
}
