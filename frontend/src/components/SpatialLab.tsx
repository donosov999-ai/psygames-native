/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
/* psygames-spatial-lab-screen · VER 3 · 17.09.2026 · psygames-spatial-claude-mac */
/** Local-only exercise adapter. Per-profile local saves; no server rewards. */
/*
 * 🔴 VER 2 — НАСТРОЙКИ ОТДЕЛЬНО ОТ ПАРТИИ, ПОВОРОТ ДВОЙНЫМ НАЖАТИЕМ (17.09.2026, задача f3fae4e2).
 * Отчёт 1bd5e1ce (2.54.17, «Сеть труб»): «экран настроек слился с экраном игры, что привело
 * к недоразумению». Под полем стояли «Свободная игра · В уровнях пройдено · Проще · Начать
 * уровни» и вкладки упражнений — выбор игры внутри самой игры. Теперь у экрана две фазы, как у
 * остальных игр: НАСТРОЙКА (упражнение, уровень, «Начать», «Свободная игра», «Продолжить игру»)
 * и ПАРТИЯ (поле, ход, счёт). Пункт паузы «Настройки» ведёт в настройку, партия при этом не
 * пропадает («Продолжить игру»); «Выйти из упражнения» уходит с экрана, как у всех игр. Шаг зарядки (`preset`) идёт сразу в партию, как было.
 * Отчёт 60913453: «по двойному нажатию вращение, чтобы шло тоже» — двойное нажатие по той же
 * трубе или клетке поворачивает по часовой (у упражнений сдвига направления нет — там нет).
 *
 * 🔴 VER 3 — ДОСКА ВПИСЫВАЕТСЯ В ПОЛЕ КАРКАСА (17.09.2026, отчёт e5bfc2f0, задача 42dbd9bf).
 * См. «СТОРОНА ДОСКИ» у расчёта `side`.
 */
import React, {useState, useEffect, useRef,useCallback} from 'react';
import {победаКОтправке} from './spatialLabWin';
import {levelNote} from './spatialLabLevelNote';
import {View, Text, Pressable, StyleSheet, Animated, Easing, DeviceEventEmitter, ScrollView } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import GradientSurface from './GradientSurface';
// 🔴 НЕ `useWindowDimensions`: на первом кадре он отдаёт 0, и поле считается от
// нулевой высоты. Защита живёт в `useScreenSize` — общая для всех игр.
import {useScreenSize} from '@/src/hooks/useScreenWidth';
import Svg, {Path, Circle} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useProfile} from '@/src/contexts/ProfileContext';
import GameShell from './GameShell';
import {useGameFieldHeight} from './GameFieldHeight';
import {FAB_SIZE} from '@/src/services/fabPosition';
import {HELP_OPEN_EVENT, HELP_CORNER_SPACE} from './GameHelpOverlay';
import {GameAuxAction, GameAuxBar} from './GameAuxAction';
import {useTheme} from '@/src/contexts/ThemeContext';
import {session, commit, undo, redo, scramble, solved, replay} from '../games/spatial-core/core.mjs';
import {isGameHeld, gameNow} from '@/src/services/gamePause';
import {netPuzzle, network, maskAt} from '../games/spatial-core/net.mjs';
import {sourceAt} from '../games/spatial-core/netslide-levels.mjs';
import type {Cell} from '../games/spatial-core/core.mjs';
import {createDeal,decodeSnapshot,encodeSnapshot,shifts,SPATIAL_MODES} from '../games/spatial-core/snapshot.mjs';
import type {SpatialMode,SpatialTask} from '../games/spatial-core/snapshot.mjs';
import {spatialFrame} from '../games/spatial-core/frame';

import {useLanguage} from '@/src/contexts/LanguageContext';
type Mode = SpatialMode;
type LevelTask = SpatialTask;
/** Имя упражнения — заголовок экрана и подпись вкладки, одним ключом словаря. */
const ИМЯ:Record<Mode,string>={twiddle:'spatialTwiddle',net:'spatialNet',sixteen:'spatialSixteen',netslide:'spatialNetslide'};
const пустоПройдено=():Record<Mode,number[]>=>({twiddle:[],net:[],sixteen:[],netslide:[]});
/**
 * 🔴 УПРАЖНЕНИЯ СДВИГА — «СДВИГ ЧИСЕЛ» И «СЕТЬ СО СДВИГОМ» (17.09.2026, задача afb6ab5b).
 * Механика та же, что у «Шестнадцати» и «Труб со сдвигом» Тэтхэма, но на ядре лаборатории:
 * команда `{kind:'row'|'column'}` в `core.mjs` была написана и не использовалась.
 * Ход устроен как у соседей по экрану: нажатие клетки ВЫБИРАЕТ (её строку и столбец),
 * ходят кнопки под полем. Четыре стрелки: ← → двигают строку, ↑ ↓ — столбец, по кругу.
 * Знак — как в ядре: строка +1 едет вправо, столбец +1 — вниз.
 */
const СТРЕЛКИ=[['row',-1,'spatialLabShiftRowLeft','←'],['row',1,'spatialLabShiftRowRight','→'],['column',-1,'spatialLabShiftColUp','↑'],['column',1,'spatialLabShiftColDown','↓']] as const;
const deal = (mode:Mode,seed:number) => session((mode==='net'?netPuzzle(seed):scramble(seed)).initial);
/** Цвета шапки экрана настройки — те же, что у маршрута (`app/games/spatial-lab.tsx`, GRADIENT). */
const ГРАДИЕНТ=['#38bdf8','#6366f1'] as const;
/** Два нажатия по той же клетке не дальше этого — поворот по часовой (отчёт 60913453). */
export const ДВОЙНОЕ_НАЖАТИЕ_МС=350;
/**
 * Двойное нажатие: `(ключ) => true`, если это нажатие — второе по тому же ключу не позже порога.
 * Отдельным хуком, а не функцией в теле экрана: запись в ref из функции, которую зовёт разметка,
 * React Compiler не смог сохранить мемоизацию экрана (замер линтом 17.09.2026).
 */
function useDoubleTap(){
  const прошлое=useRef<{key:number;t:number}|null>(null);
  return useCallback((key:number)=>{
    const сейчас=gameNow(),было=прошлое.current;
    if(было&&было.key===key&&сейчас-было.t<=ДВОЙНОЕ_НАЖАТИЕ_МС){прошлое.current=null;return true;}
    прошлое.current={key,t:сейчас};
    return false;
  },[]);
}
// Serialize writes across mounts; read waits for previous queued writes too.
let saveQueue:Promise<void>=Promise.resolve();

/** Exact NESW geometry, independent of the decorative raster style sheet. */
export function SpatialPipe({cell,active,source}:{cell:Cell;active:boolean;source:boolean}) {
  const mask=maskAt(cell);
  const points=['50 0','100 50','50 100','0 50'];
  // Continuous elbows, not two open strokes covered by a flat centre disc.
  const elbow:Record<number,string>={
    3:'M50 0 L50 30 Q50 50 70 50 L100 50',
    6:'M100 50 L70 50 Q50 50 50 70 L50 100',
    12:'M50 100 L50 70 Q50 50 30 50 L0 50',
    9:'M0 50 L30 50 Q50 50 50 30 L50 0',
    5:'M50 0 L50 100',10:'M0 50 L100 50',
  };
  const d=elbow[mask]??points.flatMap((p,i)=>mask&(1<<i)?[`M50 50 L${p}`]:[]).join(' ');
  const dark=active?'#286b60':'#58617e',body=active?'#75cdb5':'#a7b2d2',light=active?'#d2fff0':'#e7ecff';
  const collars=['M36 7 H64','M93 36 V64','M36 93 H64','M7 36 V64'];
  return <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
    <Path d={d} stroke={dark} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <Path d={d} stroke={body} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <Path d={d} stroke={light} strokeWidth={7} strokeOpacity={0.65} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    {collars.map((c,i)=>mask&(1<<i)?<React.Fragment key={i}>
      <Path d={c} stroke={dark} strokeWidth={9} strokeLinecap="round"/>
      <Path d={c} stroke={body} strokeWidth={5} strokeLinecap="round"/>
      <Path d={c} stroke={light} strokeWidth={1.5} strokeLinecap="round"/>
    </React.Fragment>:null)}
    {source?<Circle cx={50} cy={50} r={16} fill="#ffdb7d" stroke="#936222" strokeWidth={3}/>:null}
  </Svg>;
}

/**
 * `overlay` и `onReady` — слоты для маршрута app/games/spatial-lab.tsx (09.09.2026): окно «уровень собран»
 * рисуется поверх поля, а маршрут получает `request(level)` и зовёт его сам — с экрана итога («дальше»).
 * Механика поля Codex не тронута: это тот же `request()`, что у кнопок «Проще/Сложнее».
 */

/** Передаёт высоту поля каркаса экрану, который стоит над каркасом (см. `высотаПоля`). Имя латиницей — правило хуков линта. */
function FieldHeightUp({onChange}:{onChange:(высота:number)=>void}){
  const высота=useGameFieldHeight();
  useEffect(()=>{onChange(высота);},[высота,onChange]);
  return null;
}

/** Окно ниже этой высоты — «тесное»: у 390×844 и выше раскладка прежняя. */
export const ТЕСНОЕ_ОКНО=760;

export default function SpatialLab({onBack,preset,initialMode,onComplete,overlay,onReady}:{onBack:()=>void;preset?:{mode:Mode;level:number;seed:number};initialMode?:Mode;onComplete?:(result:{mode:Mode;level:number;moves:number})=>void;overlay?:React.ReactNode;onReady?:(api:{request:(level:number)=>void;toConfig:()=>void})=>void}) {
  const {t,language}=useLanguage();   // названия упражнений — из общего словаря (12 языков), не литералами
  const {colors}=useTheme();
  const {h:viewportHeight}=useScreenSize();
  const {profile,ready:profileReady}=useProfile();
  const saveKey=`psygames_spatial_lab_v1_${profile.id}`;
  const hydrationKey=saveKey+(preset?`-preset-${preset.mode}-${preset.level}-${preset.seed}`:'');
  const [readyFor,setReadyFor]=useState<string|null>(null);
  const [saveAllowed,setSaveAllowed]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [completed,setCompleted]=useState<Record<Mode,number[]>>(пустоПройдено);
  // SSR and first client frame must agree; measuring the field also handles
  // split windows and safe-area padding without stale hydration styles.
  const [available,setAvailable]=useState(248);
  /** Высота содержимого поля БЕЗ доски, по ключу раскладки (см. «СТОРОНА ДОСКИ»). */
  const [замерПоля,setЗамерПоля]=useState<{key:string;h:number}|null>(null);
  /**
   * Высота поля каркаса. Каркас отдаёт её только ВНУТРЬ поля (контекст), а этот экран стоит над
   * каркасом — поэтому узел `FieldHeightUp` внутри поля передаёт её сюда. Хук здесь, наверху,
   * получал бы 0 всегда: так и было на первом замере (сторона осталась 316 на 375×667).
   */
  const [высотаПоля,setВысотаПоля]=useState(0);
  const [mode,setMode]=useState<Mode>('twiddle');
  const [seed,setSeed]=useState(42);
  const [state,setState]=useState(()=>deal('twiddle',42));
  const [selection,setSelection]=useState(0);
  const [task,setTask]=useState<LevelTask|null>(null);
  const [pending,setPending]=useState<Mode|'new'|number|null>(null);
  /** Фаза экрана: настройка или партия. Шаг зарядки — сразу партия. */
  const [phase,setPhase]=useState<'config'|'playing'>(preset?'playing':'config');
  /** Уровень, выбранный на экране настройки (null — ещё не выбран: берётся следующий непройденный). */
  const [chosenLevel,setChosenLevel]=useState<number|null>(null);
  /** Двойное нажатие по клетке — поворот по часовой. */
  const двойноеНажатие=useDoubleTap();
  const [replayIndex,setReplayIndex]=useState<number|null>(null);
  const [turning,setTurning]=useState<number|null>(null);
  /** Линия, которая едет в анимации сдвига; `turning` при этом хранит направление (±1). */
  const [sliding,setSliding]=useState<{kind:'row'|'column';index:number}|null>(null);
  const [angle]=useState(()=>new Animated.Value(0));
  const turnLock=useRef(false);
  /** Имя уже отправленной наверх победы, «режим:уровень». Пусто — ещё ни одной. */
  const completionSent=useRef('');
  const presetMode=preset?.mode,presetSeed=preset?.seed,presetLevel=preset?.level;
  const start=useCallback((target:Mode,nextSeed:number,level=0)=>{
    completionSent.current='';
    const next=createDeal(target,nextSeed,level);
    angle.stopAnimation();turnLock.current=false;setTurning(null);setSliding(null);setReplayIndex(null);
    setTask(next.task);setMode(target);setSeed(nextSeed);setState(next.state);
    setSelection(next.selection);setPending(null);
  },[angle]);
  const animateTurn=useCallback((amount:number,onComplete:()=>void)=>{
    turnLock.current=true;angle.setValue(0);setTurning(amount);
    /*
     * 🔴 ВРАЩЕНИЕ ЗДЕСЬ НЕ СПРАШИВАЕТ СИСТЕМНУЮ НАСТРОЙКУ «МЕНЬШЕ ДВИЖЕНИЯ» (09.09.2026).
     * 09.09 я подчинил её этому переключателю ради гейта reduced-motion — и на устройстве с
     * включённой настройкой фигура перестала поворачиваться вовсе. Здесь поворот — это САМО
     * УПРАЖНЕНИЕ и объяснение ошибки, а не украшение: без него экран показывает ту же картинку,
     * из-за которой человек ошибся. Настройка гасит декор, а не содержание.
     */
    Animated.timing(angle,{toValue:amount*90,duration:320,easing:Easing.inOut(Easing.cubic),useNativeDriver:false}).start(({finished})=>{
      if(finished)onComplete();
      turnLock.current=false;setTurning(null);setSliding(null);
    });
  },[angle]);
  useEffect(()=>{
    if(!profileReady)return;
    let cancelled=false;
    // Both local saves and preset hydration cross the same queued boundary.
    saveQueue.then(()=>presetMode?null:AsyncStorage.getItem(saveKey)).then(raw=>{
      if(cancelled)return;
      setSaveError('');
      if(presetMode){
        start(presetMode,presetSeed!,presetLevel!);setCompleted(пустоПройдено());
        setSaveAllowed(false);setReadyFor(hydrationKey);return;
      }
      const restored=decodeSnapshot(raw);
      if(restored&&initialMode&&restored.mode!==initialMode){
        // Карточка развилки открыла ДРУГОЕ упражнение, чем лежит в сохранении (09.09.2026):
        // намерение человека важнее слота — пройденные уровни оставляем, поле начинаем в нужном режиме.
        angle.stopAnimation();turnLock.current=false;setTurning(null);setSliding(null);setReplayIndex(null);setPending(null);
        setCompleted(restored.completed);start(initialMode,42);
      }else if(restored){
        angle.stopAnimation();turnLock.current=false;setTurning(null);setSliding(null);setReplayIndex(null);setPending(null);
        setMode(restored.mode);setSeed(restored.seed);setTask(restored.task);setState(restored.state);setSelection(restored.selection);setCompleted(restored.completed);
      }else{
        start(initialMode??'twiddle',42);setCompleted(пустоПройдено());
        if(raw!==null)setSaveError('spatialLabSaveOldUnreadable');
      }
      setSaveAllowed(raw===null||restored!==null);setReadyFor(hydrationKey);
    }).catch(()=>{if(!cancelled){start(initialMode??'twiddle',42);setCompleted(пустоПройдено());setSaveError('spatialLabSaveUnavailable');setReadyFor(hydrationKey);}});
    return()=>{cancelled=true;};
  },[profileReady,hydrationKey,presetMode,presetSeed,presetLevel,saveKey,angle,start,initialMode]);
  useEffect(()=>{
    if(preset||!saveAllowed||readyFor!==hydrationKey||!profileReady)return;
    const raw=encodeSnapshot({mode,seed,level:task?.level??0,selection,state,completed});
    let current=true;
    saveQueue=saveQueue.then(()=>AsyncStorage.setItem(saveKey,raw)).catch(()=>{if(current)setSaveError('spatialLabSaveFailed');});
    return()=>{current=false;};
  },[state,mode,seed,task,selection,completed,readyFor,saveKey,saveAllowed,profileReady,hydrationKey,preset]);
  useEffect(()=>()=>{angle.stopAnimation();},[angle]);
  useEffect(()=>{
    if(replayIndex===null)return;
    const timer=setInterval(()=>{
      if(isGameHeld())return;
      clearInterval(timer);
      if(replayIndex>=state.past.length){setReplayIndex(null);return;}
      const cmd=state.past[replayIndex];
      // строка index → её первая клетка; столбец и плитка — сама клетка index
      setSelection(cmd.kind==='block'?cmd.row*state.present.width+cmd.col:cmd.kind==='row'?cmd.index*state.present.width:cmd.index);
      if(cmd.kind==='row'||cmd.kind==='column')setSliding({kind:cmd.kind,index:cmd.index});
      animateTurn(cmd.amount??1,()=>setReplayIndex(i=>i===null?null:i+1));
    },150);
    return ()=>{clearInterval(timer);angle.stopAnimation();};
  },[replayIndex,state.past,state.present.width,angle,animateTurn]);
  const busy=replayIndex!==null||turning!==null;
  const view=replayIndex!==null?replay(state.initial,state.past.slice(0,replayIndex)):state.present;
  const n=state.present.width;
  const сдвиг=shifts(mode);
  // «Сеть со сдвигом»: источник — плитка 0, и он ездит вместе со строкой
  const info=mode==='net'?network(view):mode==='netslide'?network(view,sourceAt(view)):null;
  // у упражнений сдвига подсветки «на месте» не отключают: в спецификации ступени такого флага нет
  const liveColour=!task||!('liveColour' in task.spec)||task.spec.liveColour!==false;
  const locked=(i:number)=>task?.locked.includes(i)??false;
  const won=info?info.won:solved(state.present);
  /*
   * 🔴 О ПОБЕДЕ НАДО СООБЩИТЬ НАВЕРХ В ЛЮБОЙ ПАРТИИ, А НЕ ТОЛЬКО В ЗАРЯДКЕ.
   *
   * ОТЧЁТ 63e3ef0d (11.09.2026, iOS 2.53.6), дословно: «Решил задачу на следующий
   * уровень не переходит». Задача 577d79b2.
   *
   * ЧТО БЫЛО. Эта проверка вызывала `onComplete` ТОЛЬКО при `preset`, то есть только
   * когда экран открыт шагом зарядки. В обычной партии ветка молча возвращалась.
   * А окно «уровень собран» с кнопкой «дальше» рисует МАРШРУТ (`app/games/spatial-lab.tsx`),
   * и рисует он его как раз по `onComplete` — то есть в обычной игре оно не появлялось
   * никогда. Уровень при этом засчитывался: строка «Пройдено N/50» росла (строка ниже
   * добавляет его в `completed`), лестница — нет, сессия — нет, перехода — нет.
   * Снаружи это выглядит ровно как «решил, а дальше некуда».
   *
   * ⚠️ ОДНОКРАТНОСТЬ ТЕПЕРЬ ПО УРОВНЮ, А НЕ ОДНИМ ФЛАГОМ НА ВСЮ ЖИЗНЬ ЭКРАНА.
   * В зарядке уровень ровно один, и логического флага хватало. В обычной партии за
   * одно монтирование человек проходит уровень за уровнем, и флаг `true` заглушил бы
   * все победы, кроме первой. Поэтому храним ИМЯ уже отправленной победы («режим:уровень»):
   * повторные отрисовки того же выигранного состояния молчат, а следующий уровень
   * отправляется.
   *
   * ⚠️ Свободная игра сюда не попадает: у неё `task` пуст, и проверка выходит строкой выше.
   */
  useEffect(()=>{
    if(readyFor!==hydrationKey)return;
    const отметка=победаКОтправке({готово:won,уровень:task?task.level:null,режим:mode,занято:busy,ужеОтправлено:completionSent.current});
    if(!отметка)return;
    completionSent.current=отметка;
    onComplete?.({mode,level:task!.level,moves:state.past.length});
  },[won,task,mode,busy,readyFor,hydrationKey,preset,onComplete,state.past.length]);
  // Derived from this render's committed board; guarded against repeat renders.
  if(!preset&&readyFor===hydrationKey&&won&&task&&!busy&&!completed[mode].includes(task.level)){
    setCompleted({...completed,[mode]:[...completed[mode],task.level].sort((a,b)=>a-b)});
  }
  /**
   * 🔴 СТОРОНА ДОСКИ — ОТ ШИРИНЫ И ОТ ВЫСОТЫ (16.09.2026, приёмка 50b87961).
   * Считалась только от ширины. Замер на 375×667: ряд значков «Отменить · Вернуть ·
   * Повтор · Новая» уходил под панель «Влево / Вправо» на 23 pt — проверено
   * `elementFromPoint` по центру и нижней кромке каждого значка, все четыре накрыты.
   * Три величины постоянны на 375×667, 390×844 и 403×873:
   *   верх доски            180  (задание в две строки; на 12 языках 158 или 180)
   *   низ доски → низ ряда   90  (строка состояния, зазоры, значки 48)
   *   панель «Влево/Вправо»  73
   * Отсюда запас 180 + 90 + 73 + 8 = 351. На 844 и 873 формула не срабатывает (сторона
   * прежняя, 362 и 375), на 667 даёт 316 вместо 347.
   * ⚠️ Пол 240 оставлен нарочно: ниже клетка 5×5 выходит меньше 45 pt и в неё трудно
   * попасть пальцем. На окнах ниже ~591 pt поле честно прокручивается.
   */
  /**
   * ПОДСКАЗКА ПЕРВОГО ХОДА ЖИВЁТ В СТРОКЕ СОСТОЯНИЯ, А НЕ ОТДЕЛЬНОЙ СТРОКОЙ (16.09.2026).
   * Отдельной строкой она прибавляла высоту ровно в режиме уровней до первого хода: над
   * доской — опускала поле, под доской — толкала значки. Замер `elementFromPoint` на
   * 375×667, «Stufe 1/50»: все четыре значка под панелью «Влево / Вправо». В строке
   * состояния до первого хода всё равно стоит «Блок: 1, 1», и подсказка полезнее.
   */
  const guide=task&&'guide' in task&&task.guide&&state.past.length===0?task.guide:null;
  /**
   * 🔴 СТОРОНА ДОСКИ — ОТ ИЗМЕРЕННОЙ ВЫСОТЫ ПОЛЯ КАРКАСА (17.09.2026, отчёт e5bfc2f0, задача 42dbd9bf).
   * Каркас с 568bec9d прибивает поле, которое помещается, и оставляет прокрутку тому, что выше окна.
   * Замер WebKit на экспорте (вход в партию, колесо по пустому месту поля): лаборатория ездила на
   * 375×667 на 78–122 px, на 360×740 — на 21–65, на 360×800 «Сеть со сдвигом» — на 5. Запас 351
   * считался под прежнюю раскладку и под одну длину задания; у «Сети со сдвигом» задание в четыре
   * строки. Теперь сторона = высота поля каркаса − всё, что в поле кроме доски (замер onLayout).
   * «Всё кроме доски» от стороны не зависит: одна перекладка, без качелей. Замер только растёт в
   * пределах ключа (упражнение, уровень, окно, язык): строка состояния в две строки не качает доску
   * туда-обратно на каждом ходе. Панель «начать заново?» над полем — временная, её не меряем.
   * Пока каркас поле не измерил (или экран без каркаса) — прежняя формула.
   * Пол — клетка 45 pt (5×5 → 241, 4×4 → 192, 3×3 → 143), но не выше прежних 240.
   */
  const ЗАПАС_ПО_ВЫСОТЕ=351;
  const ЗАПАС_ЗАМЕРА=2;
  const ключЗамера=(ширина:number)=>`${mode}|${task?.level??'free'}|${viewportHeight}|${Math.round(ширина)}|${language}`;
  const безДоски=замерПоля&&замерПоля.key===ключЗамера(available)?замерПоля.h:0;
  const поВысоте=высотаПоля>0&&безДоски>0?высотаПоля-безДоски-ЗАПАС_ЗАМЕРА:viewportHeight-ЗАПАС_ПО_ВЫСОТЕ;
  const пол=Math.min(240,n*45+(n-1)*4);
  const side=Math.max(пол,Math.min(available-8,420,поВысоте));
  /** Тесное окно — плотнее зазоры и задание. Решение по высоте окна, а не по замеру: иначе плотность и замер качали бы друг друга. */
  const тесно=viewportHeight<ТЕСНОЕ_ОКНО;
  const size=(side-(n-1)*4)/n;
  /** Смещение едущей линии: угол таймера ±90 → ±одна клетка с зазором. */
  const сдвигПикс=angle.interpolate({inputRange:[-90,90],outputRange:[-(size+4),size+4]});
  const фонКлетки=(cell:Cell,i:number)=>info?(liveColour&&info.connected.has(i)?'#c3ebdd':'#e1e6ef'):liveColour&&cell.id===i?'#cbebdf':'#e3d9f8';
  const рисунокКлетки=(cell:Cell,i:number)=>info?<SpatialPipe cell={cell} active={liveColour&&info.connected.has(i)} source={mode==='netslide'?cell.id===0:i===0}/>:<Text style={styles.number}>{cell.id+1}</Text>;
  function accept(target:Mode|'new'|number) {
    if(typeof target==='number')start(mode,42,target);
    else start(target==='new'?mode:target,target==='new'?(seed+1)>>>0:42,target==='new'?(task?.level??0):0);
    // Смена упражнения — выбор на экране настройки, он там и остаётся; уровень и «новая» — это партия.
    if(typeof target==='number'||target==='new')setPhase('playing');
    else setChosenLevel(null);
  }
  function request(target:Mode|'new'|number) {
    if(preset||turnLock.current||busy)return;
    if(state.past.length&&!won){setPending(target);return;}
    accept(target);
  }
  /**
   * Нажатие клетки: выбрать; второе нажатие по той же клетке быстрее ДВОЙНОЕ_НАЖАТИЕ_МС —
   * поворот по часовой. У упражнений сдвига направления у нажатия нет, там только выбор.
   */
  function нажатьКлетку(i:number,r:number,c:number) {
    if(locked(i))return;
    const цель=mode==='net'||сдвиг?i:Math.min(r,n-2)*n+Math.min(c,n-2);
    if(двойноеНажатие(цель)&&!сдвиг&&selection===цель){turn(1);return;}
    setSelection(цель);
  }
  function turn(amount:number) {
    if(won||pending!==null||busy||turnLock.current||locked(selection))return;
    const command=mode==='net'?{kind:'tile' as const,index:selection,amount}:{kind:'block' as const,row:Math.floor(selection/n),col:selection%n,size:2,amount};
    animateTurn(amount,()=>setState(s=>commit(s,command)));
  }
  function shift(kind:'row'|'column',amount:number) {
    if(won||pending!==null||busy||turnLock.current)return;
    const index=kind==='row'?Math.floor(selection/n):selection%n;
    /*
     * 🔴 СДВИГ ЕДЕТ, А НЕ ПЕРЕСКАКИВАЕТ (17.09.2026). В первой версии линия менялась мгновенно:
     * в упражнении на удержание позиций не видно, какие числа куда уехали и какое перешло
     * через край. Теперь линия едет на клетку тем же таймером, что поворот блока (320 мс),
     * уходящая клетка скрывается за краем доски, а её копия въезжает с другой стороны.
     * Ход засчитывается в конце анимации — как у поворота.
     */
    setSliding({kind,index});
    animateTurn(amount,()=>setState(s=>commit(s,{kind,index,amount})));
  }
  useEffect(()=>{
    if(!onReady)return;
    onReady({request:(level:number)=>{if(preset||readyFor!==hydrationKey||busy)return;request(Math.max(1,Math.min(50,level)));},
      toConfig:()=>{if(!preset)setPhase('config');}});
  });   // без списка зависимостей нарочно: наружу уходит ссылка на ТЕКУЩИЙ request, маршрут держит её в ref
  const ink={color:colors.text};
  if(!profileReady||readyFor!==hydrationKey)return <View style={styles.field}><Text style={ink}>{t('spatialLabRestoring')}</Text></View>;
  const цельУпражнения=mode==='net'?t('spatialLabNetGoal'):mode==='netslide'?t('spatialLabNetslideGoal'):t(mode==='sixteen'?'spatialLabSixteenGoal':'spatialLabTwiddleGoal').replace('{n}',String(n*n));
  const подтверждение=pending!==null?<View style={[styles.confirm,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <Text style={ink}>{t('spatialLabRestartConfirm')}</Text>
    <View style={styles.auxRow}><GameAuxBar><GameAuxAction label={t('spatialLabStay')} onPress={()=>setPending(null)}/><GameAuxAction label={t('start')} onPress={()=>accept(pending)}/></GameAuxBar></View>
  </View>:null;
  if(!preset&&phase==='config'){
    // Выбрать можно пройденное и следующий уровень — вперёд не перепрыгнуть (как у тропинки уровней).
    const доступен=Math.min(50,(completed[mode].length?Math.max(...completed[mode]):0)+1);
    const уровень=Math.max(1,Math.min(доступен,chosenLevel??(task?task.level:доступен)));
    const идёт=state.past.length>0&&!won;
    return <SafeAreaView testID="spatial-config" style={[styles.configRoot,{backgroundColor:colors.background}]}>
      <GradientSurface colors={ГРАДИЕНТ as unknown as [string,string]} style={styles.configHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Pressable onPress={onBack} style={styles.configBack} accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color="#fff"/>
        </Pressable>
        <Text style={styles.configTitle} numberOfLines={1}>{t(ИМЯ[mode])}</Text>
        {/* Место под угловой ряд питомца и справки — как у шапок остальных игр (pan-audit: заголовок под кнопками). */}
        <View style={{ width: HELP_CORNER_SPACE }} />
      </GradientSurface>
      <ScrollView contentContainerStyle={styles.configBody}>
        {подтверждение}
        <View style={[styles.configCard,{backgroundColor:colors.surface}]}>
          <Text style={[styles.instruction,ink]}>{цельУпражнения}</Text>
          <Text testID="spatial-completed" style={[styles.status,ink]}>{t('spatialDoneInLevels')}: {completed[mode].length}/50</Text>
        </View>
        <View style={styles.auxRow}><GameAuxBar>
          <GameAuxAction label={t('spatialLabEasier')} disabled={уровень<=1} onPress={()=>setChosenLevel(уровень-1)}/>
          <GameAuxAction label={t('spatialLabHarder')} disabled={уровень>=доступен} onPress={()=>setChosenLevel(уровень+1)}/>
        </GameAuxBar></View>
        <Text testID="spatial-level" style={[styles.levelLine,ink]}>{t('level')} {уровень}/50</Text>
        <Pressable testID="spatial-start-level" accessibilityRole="button" onPress={()=>request(уровень)}>
          <GradientSurface colors={ГРАДИЕНТ as unknown as [string,string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </Pressable>
        {идёт?<Pressable testID="spatial-continue" accessibilityRole="button" onPress={()=>setPhase('playing')} style={[styles.secondaryBtn,{borderColor:colors.primary,backgroundColor:colors.surface}]}>
          <Text style={[styles.secondaryText,ink]}>{t('exitConfirmStay')} · {task?`${t('level')} ${task.level}`:t('spatialFreePlay')}</Text>
        </Pressable>:null}
        <Pressable testID="spatial-free-play" accessibilityRole="button" onPress={()=>request(0)} style={[styles.secondaryBtn,{borderColor:colors.border,backgroundColor:colors.surface}]}>
          <Text style={[styles.secondaryText,ink]}>{t('spatialFreePlay')}</Text>
        </Pressable>
        <Text testID="spatial-free-hint" style={[styles.note,{color:colors.textSecondary}]}>{t('spatialFreePlayNote')}</Text>
        <View style={styles.tabs}>{SPATIAL_MODES.map(m=><Pressable key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>{if(m!==mode)request(m);}} style={[styles.tab,{borderColor:mode===m?colors.primary:colors.border,backgroundColor:colors.surface}]}><Text style={ink}>{t(ИМЯ[m])}</Text></Pressable>)}</View>
        <Text testID="spatial-save-status" style={[styles.note,{color:colors.textSecondary}]}>{saveError?t(saveError):t('spatialLabLocalSave')}</Text>
      </ScrollView>
      {overlay}
    </SafeAreaView>;
  }
  return <GameShell title={t(ИМЯ[mode])} onBack={onBack} overlay={overlay}
    frame={preset?spatialFrame(viewportHeight):undefined}
    confirmExit={state.past.length>0&&!won} scrollableField
    /*
      МЕНЮ ПАУЗЫ — как в судоку и в играх внимания (09.09.2026): стрелка «назад» открывает
      выбор, а не выкидывает молча. «Новая» перекладывает партию заново тем же request('new'),
      что и кнопка на экране; уход домой делает сам каркас (leave).
    */
    pauseActions={preset?undefined:[
      {id:'resume',label:t('exitConfirmStay'),icon:'play',primary:true},
      {id:'restart',label:t('restart'),icon:'refresh',onPress:()=>request('new')},
      {id:'undo',label:t('btn_undo'),icon:'arrow-undo',onPress:()=>setState(undo)},
      {id:'rules',label:t('btn_rules'),icon:'help-circle-outline',onPress:()=>DeviceEventEmitter.emit(HELP_OPEN_EVENT)},
      {id:'settings',label:t('settings'),icon:'options-outline',onPress:()=>setPhase('config')},
      {id:'home',label:t('goHome'),icon:'home',leave:true},
    ]}
    /*
      🔴 СЧЁТЧИКИ — БЕЙДЖАМИ `hud`, А НЕ СТРОКОЙ `stats` (перенос 09.09.2026).
      Строка из трёх подписей растягивалась на всю плашку, и третья («№ 42»)
      ложилась под угловой ряд питомца и справки: pan-audit на 360 px дал наезд
      37 px. Бейджи компактные (значок + число) и встают слева, где ряда нет.
      «Поле n×n» убрано: доска и так на экране.
    */
    hud={[
      { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: state.past.length, pop: true },
      ...(info ? [{ key: 'found', icon: 'git-network-outline' as const, label: t('hud_linked'), value: `${info.connected.size}/${n*n}` }] : []),
      { key: 'round', icon: 'pricetag-outline', label: t('hud_puzzle'), value: `#${seed}` },
    ]}
    toolbar={сдвиг?<View style={styles.arrows}>{СТРЕЛКИ.map(([kind,amount,key,glyph])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={t(key)} disabled={won||pending!==null||busy} onPress={()=>shift(kind,amount)} style={[styles.turn,styles.arrow,{backgroundColor:colors.primary,opacity:won||pending!==null||busy?0.4:1}]}><Text style={styles.arrowText}>{glyph}</Text></Pressable>)}</View>:<View style={styles.turns}>{([-1,1] as const).map(a=><Pressable key={a} accessibilityRole="button" accessibilityLabel={t(a<0?'spatialLabTurnLeft':'spatialLabTurnRight')} disabled={won||pending!==null||busy||locked(selection)} onPress={()=>turn(a)} style={[styles.turn,{backgroundColor:colors.primary,opacity:won||pending!==null||busy||locked(selection)?0.4:1}]}><Text style={styles.turnText}>{a<0?`↶ ${t('a11yLeft')}`:`${t('a11yRight')} ↷`}</Text></Pressable>)}</View>}>
    <View style={[styles.field,тесно&&styles.fieldTight]} onLayout={e=>{
      const {width,height}=e.nativeEvent.layout;
      setAvailable(width);
      if(pending!==null)return;
      const ключ=ключЗамера(width),h=Math.ceil(height-side);
      setЗамерПоля(cur=>cur&&cur.key===ключ&&cur.h>=h?cur:{key:ключ,h});
    }}>
      <FieldHeightUp onChange={setВысотаПоля}/>
      {подтверждение}
      <Text style={[styles.instruction,тесно&&styles.instructionTight,ink]}>{цельУпражнения}</Text>
      <View testID="spatial-board" style={{width:side,gap:4,overflow:sliding?'hidden':'visible'}}>{Array.from({length:n},(_,r)=><View key={r} style={styles.row}>{view.cells.slice(r*n,(r+1)*n).map((cell,c)=>{
        const i=r*n+c, sr=Math.floor(selection/n),sc=selection%n;
        const selected=mode==='net'||сдвиг?selection===i:r>=sr&&r<sr+2&&c>=sc&&c<sc+2;
        const наЛинии=сдвиг&&!selected&&(r===sr||c===sc);   // строка и столбец выбранной клетки — то, что сдвинут стрелки
        const directions=[t('a11yUp'),t('a11yRight'),t('a11yDown'),t('a11yLeft')].filter((_,d)=>maskAt(cell)&(1<<d));
        const едет=сдвиг&&sliding!==null&&turning!==null&&(sliding.kind==='row'?r===sliding.index:c===sliding.index);
        const клетка=<Pressable key={i} testID={`spatial-cell-${i}`} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={(info?t('spatialLabCellPipe').replace('{dirs}',directions.join(', ')):t('spatialLabCellNumber').replace('{n}',String(cell.id+1))).replace('{r}',String(r+1)).replace('{c}',String(c+1))} disabled={pending!==null||busy||locked(i)} onPress={()=>нажатьКлетку(i,r,c)}
          style={[styles.cell,{opacity:turning!==null&&selected&&!сдвиг?0:1,width:size,height:size,borderColor:selected?'#713ed4':наЛинии?'#a78bfa':'#aaa1c5',backgroundColor:фонКлетки(cell,i),borderWidth:selected?3:наЛинии?2:1}]}>
          {рисунокКлетки(cell,i)}
          {locked(i)?<Text style={{position:'absolute',right:3,top:1,fontSize:12}} accessibilityLabel={t('spatialLabLocked')}>●</Text>:null}
        </Pressable>;
        return едет&&sliding?<Animated.View key={i} style={{transform:[sliding.kind==='row'?{translateX:сдвигПикс}:{translateY:сдвигПикс}]}}>{клетка}</Animated.View>:клетка;
      })}</View>)}
      {сдвиг&&sliding&&turning!==null?(()=>{
        // Копия клетки, уходящей за край: въезжает с противоположной стороны той же линии.
        const уходит=turning>0?n-1:0, место=turning>0?-1:n;
        const i=sliding.kind==='row'?sliding.index*n+уходит:уходит*n+sliding.index;
        return <Animated.View testID="spatial-slide-wrap" pointerEvents="none" accessibilityElementsHidden
          style={{position:'absolute',width:size,height:size,left:(sliding.kind==='row'?место:sliding.index)*(size+4),top:(sliding.kind==='row'?sliding.index:место)*(size+4),transform:[sliding.kind==='row'?{translateX:сдвигПикс}:{translateY:сдвигПикс}]}}>
          <View style={[styles.cell,{width:size,height:size,borderWidth:1,borderColor:'#aaa1c5',backgroundColor:фонКлетки(view.cells[i],i)}]}>{рисунокКлетки(view.cells[i],i)}</View>
        </Animated.View>;
      })():null}
      {turning!==null&&!сдвиг?<Animated.View testID="spatial-turn-animation" pointerEvents="none" accessibilityElementsHidden style={{position:'absolute',left:(selection%n)*(size+4),top:Math.floor(selection/n)*(size+4),width:mode==='net'?size:size*2+4,height:mode==='net'?size:size*2+4,zIndex:2,transform:[{rotate:angle.interpolate({inputRange:[-90,90],outputRange:['-90deg','90deg']})},{scale:angle.interpolate({inputRange:[-90,-45,0,45,90],outputRange:[1,0.707,1,0.707,1]})}]}}>
        {(mode==='net'?[selection]:[selection,selection+1,selection+n,selection+n+1]).map((i,j)=><View key={i} style={[styles.cell,{position:'absolute',left:mode==='net'?0:(j%2)*(size+4),top:mode==='net'?0:Math.floor(j/2)*(size+4),width:size,height:size,backgroundColor:mode==='net'?'#e1e6ef':'#e3d9f8',borderWidth:3,borderColor:'#713ed4'}]}>
          {mode==='net'?<SpatialPipe cell={view.cells[i]} active={liveColour&&!!info?.connected.has(i)} source={i===0}/>:<Animated.Text style={[styles.number,{transform:[{rotate:angle.interpolate({inputRange:[-90,90],outputRange:['90deg','-90deg']})}]}]}>{view.cells[i].id+1}</Animated.Text>}
        </View>)}
      </Animated.View>:null}</View>
      <Text testID={guide?'spatial-guide':'spatial-status'} accessibilityLiveRegion="polite" style={[styles.status,ink]}>{turning!==null&&!сдвиг?t('spatialLabTurning'):replayIndex!==null?t('spatialLabReplayProgress').replace('{i}',String(replayIndex)).replace('{n}',String(state.past.length)):won?t('spatialLabSolved'):guide?t(guide.kind==='row'?(guide.amount!<0?'spatialLabGuideRowLeft':'spatialLabGuideRowRight'):guide.kind==='column'?(guide.amount!<0?'spatialLabGuideColUp':'spatialLabGuideColDown'):guide.amount!<0?'spatialLabGuideLeft':'spatialLabGuideRight'):info?t('spatialLabOpenEnds').replace('{n}',String(info.leaks)):t(сдвиг?'spatialLabLinePos':'spatialLabBlockPos').replace('{r}',String(Math.floor(selection/n)+1)).replace('{c}',String(selection%n+1))}</Text>
      {/*
        🔴 СЛУЖЕБНЫЕ КНОПКИ ПОД ДОСКОЙ И ЗНАЧКАМИ — ПРИЁМКА 50b87961 (16.09.2026).
        Стояли в шапке, над полем, подписями. Замер на 390×844: доска начиналась на
        половине экрана, её нижний ряд уходил под «Влево / Вправо», а по-немецки ряд
        «Rückgängig · Wiederherstellen · Wiederholung» не влезал по ширине — четвёртая
        кнопка целиком за правым краем. Значки влезают на любом языке, подпись живёт
        в accessibilityLabel. Канон приёмки Дениса: управление — под полем.
      */}
      {/*
        ⚠️ ПАНЕЛЬ СЛУЖЕБНЫХ КНОПОК ОБЁРНУТА В РЯД (перенос 09.09.2026).
        У `GameAuxBar` с 03.09 стоит `flexGrow: 1` + `flexBasis: 0` — она
        рассчитана растягиваться внутри РЯДА своего слота. В колонке такой
        ребёнок получает нулевую высоту, и кнопки вылезают поверх поля: замер
        живьём дал контейнер 144..144 при панели 144..192 — 42 точки поверх
        строки задания. Обёртка возвращает панели её ряд.
      */}
      <View style={styles.auxRow}><GameAuxBar><GameAuxAction compact icon="arrow-undo" ladder="undo" label={t('btn_undo')} onPress={()=>setState(undo)} disabled={!state.past.length||pending!==null||busy}/><GameAuxAction compact icon="arrow-redo" label={t('spatialLabRedo')} onPress={()=>setState(redo)} disabled={!state.future.length||pending!==null||busy}/><GameAuxAction compact icon={replayIndex!==null?'stop':'play'} label={t(replayIndex!==null?'voiceStop':'spatialLabReplay')} onPress={()=>setReplayIndex(replayIndex!==null?null:0)} disabled={!state.past.length||pending!==null||turning!==null}/>{!preset&&<GameAuxAction compact icon="shuffle" label={t('spatialLabNew')} onPress={()=>request('new')} disabled={pending!==null||busy}/>}</GameAuxBar></View>
      {/* Строки уровня — последние в поле, а поле теперь прибито: слева внизу над ними висит кнопка отзыва
          (в арабском справа). Отступ с обеих сторон на её ширину — живой кадр 375×667, «Поворот чисел», ур. 1:
          кнопка накрывала «Один» в строке описания уровня. */}
      <View style={{alignItems:'center',gap:тесно?4:8,alignSelf:'stretch',paddingHorizontal:FAB_SIZE+12}}>
        {/*
          🔴 СЧЁТЧИК ПРОЙДЕННОГО ОТНОСИТСЯ К УРОВНЯМ, А СТОЯЛ ПОД «СВОБОДНОЙ ИГРОЙ».
          Отчёт ee0889e7 (12.09.2026), дословно: «Свободная игра и что под ней зачем
          эта строка». Человек читал «Пройдено: 0/50» как показание того, что делает
          СЕЙЧАС, — а оно про другой режим и в свободной игре не двигается никогда.
          Поэтому в свободной игре подпись прямо называет, чей это счёт, и рядом
          сказано, что здесь ходы в прогресс не идут и где его начать.
        */}
        {/* В партии — только чем занят игрок: пояснение про свободную игру живёт на экране настройки
            (двухстрочная подпись здесь уходила под кнопку отзыва — живой кадр 430×932, 17.09.2026). */}
        <Text testID="spatial-game-level" style={ink}>{task?`${t('level')} ${task.level}/50 · ${t('spatialDone')}: ${completed[mode].length}/50`:t('spatialFreePlay')}</Text>
        {task?<Text testID="spatial-level-note" style={[styles.instruction,тесно&&styles.instructionTight,ink]}>{levelNote(task,t,mode)}</Text>:null}
      </View>
      {/*
        ВКЛАДКИ РЕЖИМОВ — ТОЖЕ ПОД ДОСКОЙ (16.09.2026): это выбор игры, а не ход, и
        место над полем ему не нужно. Подписи — имена режимов из словаря
        (`spatialTwiddle`, `spatialNet`), те же, что в заголовке экрана: раньше
        заголовок говорил «Number Twist», а вкладка — «Числа».
      */}
      {/*
        🔴 ТРОПИНКИ УРОВНЕЙ ЗДЕСЬ НЕТ — И ЭТО ВОЗВРАТ, А НЕ ПРОПУСК (09.09.2026).
        Я поставил её над вкладками, и на iPhone 403×873 (отчёты cc1a7535, 652e6eee)
        настройка заняла верхнюю половину экрана, а поле уехало под сгиб и обрезалось.
        Экран Codex уже показывает уровень строкой «Уровень N/50», «Пройдено N/50» и
        кнопками «Проще / Сложнее / Свободная» — второй навигации ему не нужно.
      */}
      {preset?<View style={{paddingHorizontal:52}}><Text testID="spatial-save-status" style={[styles.note,{color:colors.textSecondary}]}>{t('spatialLabWarmupNote')}</Text></View>:null}
    </View>
  </GameShell>;
}
const styles=StyleSheet.create({
  top:{gap:8},auxRow:{flexDirection:'row',alignSelf:'stretch'},tabs:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},tab:{minHeight:48,minWidth:100,borderWidth:2,borderRadius:12,alignItems:'center',justifyContent:'center'},
  turns:{flexDirection:'row',gap:8,width:'100%',maxWidth:640,paddingLeft:32},turn:{flex:1,minHeight:52,borderRadius:12,alignItems:'center',justifyContent:'center',padding:8},turnText:{color:'#fff',fontSize:16,fontWeight:'700'},arrowText:{color:'#fff',fontSize:26,fontWeight:'800'},
  /*
   * Четыре стрелки сдвига — без отступа слева 32, который стоит у пары «Влево/Вправо» (пришёл
   * из пакета Codex без объяснения). Замер 17.09.2026 на 375×667: слот панели 244 pt, с отступом
   * и зазором 8 стрелка выходила 47 pt — ниже пола 48. Без отступа и с зазором 6 — 56 pt.
   */
  arrows:{flexDirection:'row',gap:6,width:'100%',maxWidth:640},arrow:{minWidth:48},
  field:{alignItems:'center',width:'100%',gap:12},fieldTight:{gap:8},instructionTight:{fontSize:14,lineHeight:19},
  configRoot:{flex:1},configHeader:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:8,paddingVertical:6},
  configBack:{width:48,height:48,alignItems:'center',justifyContent:'center'},configTitle:{flex:1,color:'#fff',fontSize:20,fontWeight:'800'},
  configBody:{padding:16,gap:14,alignItems:'stretch'},configCard:{borderRadius:16,padding:14,gap:8,alignItems:'center'},
  levelLine:{fontSize:17,fontWeight:'700',textAlign:'center'},startBtn:{borderRadius:999,paddingVertical:16,alignItems:'center'},startText:{color:'#fff',fontSize:17,fontWeight:'800'},
  secondaryBtn:{minHeight:48,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:18},secondaryText:{fontSize:15,fontWeight:'700',textAlign:'center'},instruction:{fontSize:16,textAlign:'center',maxWidth:420,lineHeight:22},row:{flexDirection:'row',gap:4},cell:{borderRadius:12,alignItems:'center',justifyContent:'center',overflow:'hidden'},number:{fontSize:27,fontWeight:'800',color:'#352654'},status:{fontSize:16,textAlign:'center'},note:{fontSize:12,textAlign:'center'},confirm:{padding:12,borderWidth:1,borderRadius:12,gap:12,width:'100%'},
});
