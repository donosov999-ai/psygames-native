/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
/** Local-only exercise adapter. Per-profile local saves; no server rewards. */
import React, {useState, useEffect, useRef,useCallback} from 'react';
import {победаКОтправке} from './spatialLabWin';
import {levelNote} from './spatialLabLevelNote';
import {View, Text, Pressable, StyleSheet, Animated, Easing, DeviceEventEmitter } from 'react-native';
// 🔴 НЕ `useWindowDimensions`: на первом кадре он отдаёт 0, и поле считается от
// нулевой высоты. Защита живёт в `useScreenSize` — общая для всех игр.
import {useScreenSize} from '@/src/hooks/useScreenWidth';
import Svg, {Path, Circle} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useProfile} from '@/src/contexts/ProfileContext';
import GameShell from './GameShell';
import {HELP_OPEN_EVENT} from './GameHelpOverlay';
import {GameAuxAction, GameAuxBar} from './GameAuxAction';
import {useTheme} from '@/src/contexts/ThemeContext';
import {session, commit, undo, redo, scramble, solved, replay} from '../games/spatial-core/core.mjs';
import {isGameHeld} from '@/src/services/gamePause';
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

export default function SpatialLab({onBack,preset,initialMode,onComplete,overlay,onReady}:{onBack:()=>void;preset?:{mode:Mode;level:number;seed:number};initialMode?:Mode;onComplete?:(result:{mode:Mode;level:number;moves:number})=>void;overlay?:React.ReactNode;onReady?:(api:{request:(level:number)=>void})=>void}) {
  const {t}=useLanguage();   // названия упражнений — из общего словаря (12 языков), не литералами
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
  const [mode,setMode]=useState<Mode>('twiddle');
  const [seed,setSeed]=useState(42);
  const [state,setState]=useState(()=>deal('twiddle',42));
  const [selection,setSelection]=useState(0);
  const [task,setTask]=useState<LevelTask|null>(null);
  const [pending,setPending]=useState<Mode|'new'|number|null>(null);
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
  const ЗАПАС_ПО_ВЫСОТЕ=351;
  const side=Math.max(240,Math.min(available-8,420,viewportHeight-ЗАПАС_ПО_ВЫСОТЕ));
  const size=(side-(n-1)*4)/n;
  /** Смещение едущей линии: угол таймера ±90 → ±одна клетка с зазором. */
  const сдвигПикс=angle.interpolate({inputRange:[-90,90],outputRange:[-(size+4),size+4]});
  const фонКлетки=(cell:Cell,i:number)=>info?(liveColour&&info.connected.has(i)?'#c3ebdd':'#e1e6ef'):liveColour&&cell.id===i?'#cbebdf':'#e3d9f8';
  const рисунокКлетки=(cell:Cell,i:number)=>info?<SpatialPipe cell={cell} active={liveColour&&info.connected.has(i)} source={mode==='netslide'?cell.id===0:i===0}/>:<Text style={styles.number}>{cell.id+1}</Text>;
  function accept(target:Mode|'new'|number) {
    if(typeof target==='number')start(mode,42,target);
    else start(target==='new'?mode:target,target==='new'?(seed+1)>>>0:42,target==='new'?(task?.level??0):0);
  }
  function request(target:Mode|'new'|number) {
    if(preset||turnLock.current||busy)return;
    if(state.past.length&&!won){setPending(target);return;}
    accept(target);
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
    onReady({request:(level:number)=>{if(preset||readyFor!==hydrationKey||busy)return;request(Math.max(1,Math.min(50,level)));}});
  });   // без списка зависимостей нарочно: наружу уходит ссылка на ТЕКУЩИЙ request, маршрут держит её в ref
  const ink={color:colors.text};
  if(!profileReady||readyFor!==hydrationKey)return <View style={styles.field}><Text style={ink}>{t('spatialLabRestoring')}</Text></View>;
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
    <View style={styles.field} onLayout={e=>setAvailable(e.nativeEvent.layout.width)}>
      {pending!==null?<View style={[styles.confirm,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={ink}>{t('spatialLabRestartConfirm')}</Text>
        <View style={styles.auxRow}><GameAuxBar><GameAuxAction label={t('spatialLabStay')} onPress={()=>setPending(null)}/><GameAuxAction label={t('start')} onPress={()=>accept(pending)}/></GameAuxBar></View>
      </View>:null}
      <Text style={[styles.instruction,ink]}>{mode==='net'?t('spatialLabNetGoal'):mode==='netslide'?t('spatialLabNetslideGoal'):t(mode==='sixteen'?'spatialLabSixteenGoal':'spatialLabTwiddleGoal').replace('{n}',String(n*n))}</Text>
      <View testID="spatial-board" style={{width:side,gap:4,overflow:sliding?'hidden':'visible'}}>{Array.from({length:n},(_,r)=><View key={r} style={styles.row}>{view.cells.slice(r*n,(r+1)*n).map((cell,c)=>{
        const i=r*n+c, sr=Math.floor(selection/n),sc=selection%n;
        const selected=mode==='net'||сдвиг?selection===i:r>=sr&&r<sr+2&&c>=sc&&c<sc+2;
        const наЛинии=сдвиг&&!selected&&(r===sr||c===sc);   // строка и столбец выбранной клетки — то, что сдвинут стрелки
        const directions=[t('a11yUp'),t('a11yRight'),t('a11yDown'),t('a11yLeft')].filter((_,d)=>maskAt(cell)&(1<<d));
        const едет=сдвиг&&sliding!==null&&turning!==null&&(sliding.kind==='row'?r===sliding.index:c===sliding.index);
        const клетка=<Pressable key={i} testID={`spatial-cell-${i}`} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={(info?t('spatialLabCellPipe').replace('{dirs}',directions.join(', ')):t('spatialLabCellNumber').replace('{n}',String(cell.id+1))).replace('{r}',String(r+1)).replace('{c}',String(c+1))} disabled={pending!==null||busy||locked(i)} onPress={()=>{if(locked(i))return;setSelection(mode==='net'||сдвиг?i:Math.min(r,n-2)*n+Math.min(c,n-2));}}
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
      <View style={{alignItems:'center',gap:8}}>
        {/*
          🔴 СЧЁТЧИК ПРОЙДЕННОГО ОТНОСИТСЯ К УРОВНЯМ, А СТОЯЛ ПОД «СВОБОДНОЙ ИГРОЙ».
          Отчёт ee0889e7 (12.09.2026), дословно: «Свободная игра и что под ней зачем
          эта строка». Человек читал «Пройдено: 0/50» как показание того, что делает
          СЕЙЧАС, — а оно про другой режим и в свободной игре не двигается никогда.
          Поэтому в свободной игре подпись прямо называет, чей это счёт, и рядом
          сказано, что здесь ходы в прогресс не идут и где его начать.
        */}
        <Text testID="spatial-level" style={ink}>{task?`${t('level')} ${task.level}/50`:t('spatialFreePlay')}</Text>
        {!preset&&<Text testID="spatial-completed" style={ink}>{task?t('spatialDone'):t('spatialDoneInLevels')}: {completed[mode].length}/50</Text>}
        {!preset&&!task&&<Text testID="spatial-free-hint" style={[styles.instruction,ink]}>{t('spatialFreePlayHint')}</Text>}
        {!preset&&<View style={styles.auxRow}><GameAuxBar>
          <GameAuxAction label={t('spatialLabEasier')} disabled={!task||task.level===1||busy||pending!==null} onPress={()=>request((task?.level??1)-1)}/>
          <GameAuxAction label={t(task?'spatialLabHarder':'spatialLabStartLevels')} disabled={task?.level===50||busy||pending!==null} onPress={()=>request((task?.level??0)+1)}/>
          {task?<GameAuxAction label={t('spatialFreePlay')} disabled={busy||pending!==null} onPress={()=>request(0)}/>:null}
        </GameAuxBar></View>}
        {task?<Text testID="spatial-level-note" style={[styles.instruction,ink]}>{levelNote(task,t,mode)}</Text>:null}
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
      {!preset&&<View style={styles.tabs}>{SPATIAL_MODES.map(m=><Pressable key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>{if(m!==mode)request(m);}} style={[styles.tab,{borderColor:mode===m?colors.primary:colors.border,backgroundColor:colors.surface}]}><Text style={ink}>{t(ИМЯ[m])}</Text></Pressable>)}</View>}
      <View style={{paddingHorizontal:52}}><Text testID="spatial-save-status" style={[styles.note,{color:colors.textSecondary}]}>{preset?t('spatialLabWarmupNote'):saveError?t(saveError):t('spatialLabLocalSave')}</Text></View>
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
  field:{alignItems:'center',width:'100%',gap:12},instruction:{fontSize:16,textAlign:'center',maxWidth:420,lineHeight:22},row:{flexDirection:'row',gap:4},cell:{borderRadius:12,alignItems:'center',justifyContent:'center',overflow:'hidden'},number:{fontSize:27,fontWeight:'800',color:'#352654'},status:{fontSize:16,textAlign:'center'},note:{fontSize:12,textAlign:'center'},confirm:{padding:12,borderWidth:1,borderRadius:12,gap:12,width:'100%'},
});
