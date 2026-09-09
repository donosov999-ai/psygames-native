/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
/** Local-only exercise adapter. Per-profile local saves; no server rewards. */
import React, {useState, useEffect, useRef,useCallback} from 'react';
import {View, Text, Pressable, StyleSheet, Animated, Easing} from 'react-native';
// 🔴 НЕ `useWindowDimensions`: на первом кадре он отдаёт 0, и поле считается от
// нулевой высоты. Защита живёт в `useScreenSize` — общая для всех игр.
import {useScreenSize} from '@/src/hooks/useScreenWidth';
import Svg, {Path, Circle} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useProfile} from '@/src/contexts/ProfileContext';
import GameShell from './GameShell';
import {GameAuxAction, GameAuxBar} from './GameAuxAction';
import {useTheme} from '@/src/contexts/ThemeContext';
import {session, commit, undo, redo, scramble, solved, replay} from '../games/spatial-core/core.mjs';
import {isGameHeld} from '@/src/services/gamePause';
import {netPuzzle, network, maskAt} from '../games/spatial-core/net.mjs';
import type {NetLevelTask} from '../games/spatial-core/net-levels.mjs';
import type {TwiddleLevelTask} from '../games/spatial-core/twiddle-levels.mjs';
import type {Cell} from '../games/spatial-core/core.mjs';
import {createDeal,decodeSnapshot,encodeSnapshot} from '../games/spatial-core/snapshot.mjs';
import {spatialFrame} from '../games/spatial-core/frame';

import {useReducedMotion} from '@/src/hooks/useReducedMotion';
import {useLanguage} from '@/src/contexts/LanguageContext';
type Mode = 'twiddle' | 'net';
type LevelTask = NetLevelTask | (TwiddleLevelTask & {locked:number[];highlighted:number[]});
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
 * `header`, `overlay` и `onReady` — слоты для маршрута app/games/spatial-lab.tsx (09.09.2026): тропинка
 * уровней каркаса рисуется над вкладками, а маршрут получает `request(level)` и зовёт его сам —
 * с тропинки и с экрана итога («дальше»). Механика поля не тронута: это тот же `request()`,
 * что у кнопок «Проще/Сложнее».
 */
export default function SpatialLab({onBack,preset,initialMode,onComplete,header,overlay,onReady}:{onBack:()=>void;preset?:{mode:Mode;level:number;seed:number};initialMode?:Mode;onComplete?:(result:{mode:Mode;level:number;moves:number})=>void;header?:React.ReactNode;overlay?:React.ReactNode;onReady?:(api:{request:(level:number)=>void})=>void}) {
  const {t}=useLanguage();   // названия упражнений — из общего словаря (12 языков), не литералами
  const {colors}=useTheme();
  const {h:viewportHeight}=useScreenSize();
  const {profile,ready:profileReady}=useProfile();
  const saveKey=`psygames_spatial_lab_v1_${profile.id}`;
  const hydrationKey=saveKey+(preset?`-preset-${preset.mode}-${preset.level}-${preset.seed}`:'');
  const [readyFor,setReadyFor]=useState<string|null>(null);
  const [saveAllowed,setSaveAllowed]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [completed,setCompleted]=useState<Record<Mode,number[]>>({net:[],twiddle:[]});
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
  const [angle]=useState(()=>new Animated.Value(0));
  const turnLock=useRef(false);
  const reduceMotion=useReducedMotion();   // «меньше движения»: поворот блока без анимации
  const completionSent=useRef(false);
  const presetMode=preset?.mode,presetSeed=preset?.seed,presetLevel=preset?.level;
  const start=useCallback((target:Mode,nextSeed:number,level=0)=>{
    completionSent.current=false;
    const next=createDeal(target,nextSeed,level);
    angle.stopAnimation();turnLock.current=false;setTurning(null);setReplayIndex(null);
    setTask(next.task);setMode(target);setSeed(nextSeed);setState(next.state);
    setSelection(next.selection);setPending(null);
  },[angle]);
  const animateTurn=useCallback((amount:number,onComplete:()=>void)=>{
    turnLock.current=true;angle.setValue(0);setTurning(amount);
    if(reduceMotion){onComplete();turnLock.current=false;setTurning(null);return;}
    Animated.timing(angle,{toValue:amount*90,duration:320,easing:Easing.inOut(Easing.cubic),useNativeDriver:false}).start(({finished})=>{
      if(finished)onComplete();
      turnLock.current=false;setTurning(null);
    });
  },[angle,reduceMotion]);
  useEffect(()=>{
    if(!profileReady)return;
    let cancelled=false;
    // Both local saves and preset hydration cross the same queued boundary.
    saveQueue.then(()=>presetMode?null:AsyncStorage.getItem(saveKey)).then(raw=>{
      if(cancelled)return;
      setSaveError('');
      if(presetMode){
        start(presetMode,presetSeed!,presetLevel!);setCompleted({net:[],twiddle:[]});
        setSaveAllowed(false);setReadyFor(hydrationKey);return;
      }
      const restored=decodeSnapshot(raw);
      if(restored&&initialMode&&restored.mode!==initialMode){
        // Карточка развилки открыла ДРУГОЕ упражнение, чем лежит в сохранении (09.09.2026):
        // намерение человека важнее слота — пройденные уровни оставляем, поле начинаем в нужном режиме.
        angle.stopAnimation();turnLock.current=false;setTurning(null);setReplayIndex(null);setPending(null);
        setCompleted(restored.completed);start(initialMode,42);
      }else if(restored){
        angle.stopAnimation();turnLock.current=false;setTurning(null);setReplayIndex(null);setPending(null);
        setMode(restored.mode);setSeed(restored.seed);setTask(restored.task);setState(restored.state);setSelection(restored.selection);setCompleted(restored.completed);
      }else{
        start(initialMode??'twiddle',42);setCompleted({net:[],twiddle:[]});
        if(raw!==null)setSaveError('Старое сохранение не прочитано и не перезаписано. Эта партия без сохранения.');
      }
      setSaveAllowed(raw===null||restored!==null);setReadyFor(hydrationKey);
    }).catch(()=>{if(!cancelled){start(initialMode??'twiddle',42);setCompleted({net:[],twiddle:[]});setSaveError('Хранилище недоступно. Эта партия без сохранения.');setReadyFor(hydrationKey);}});
    return()=>{cancelled=true;};
  },[profileReady,hydrationKey,presetMode,presetSeed,presetLevel,saveKey,angle,start,initialMode]);
  useEffect(()=>{
    if(preset||!saveAllowed||readyFor!==hydrationKey||!profileReady)return;
    const raw=encodeSnapshot({mode,seed,level:task?.level??0,selection,state,completed});
    let current=true;
    saveQueue=saveQueue.then(()=>AsyncStorage.setItem(saveKey,raw)).catch(()=>{if(current)setSaveError('Не удалось сохранить последние ходы.');});
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
      setSelection(cmd.kind==='block'?cmd.row*state.present.width+cmd.col:'index' in cmd?cmd.index:0);
      animateTurn(cmd.amount??1,()=>setReplayIndex(i=>i===null?null:i+1));
    },150);
    return ()=>{clearInterval(timer);angle.stopAnimation();};
  },[replayIndex,state.past,state.present.width,angle,animateTurn]);
  const busy=replayIndex!==null||turning!==null;
  const view=replayIndex!==null?replay(state.initial,state.past.slice(0,replayIndex)):state.present;
  const n=state.present.width;
  const info=mode==='net'?network(view):null;
  const liveColour=task?.spec.liveColour!==false;
  const locked=(i:number)=>task?.locked.includes(i)??false;
  const won=info?info.won:solved(state.present);
  useEffect(()=>{
    if(readyFor!==hydrationKey||!won||!task||busy)return;
    if(preset){
      if(!completionSent.current){completionSent.current=true;onComplete?.({mode,level:task.level,moves:state.past.length});}
      return;
    }
  },[won,task,mode,busy,readyFor,hydrationKey,preset,onComplete,state.past.length]);
  // Derived from this render's committed board; guarded against repeat renders.
  if(!preset&&readyFor===hydrationKey&&won&&task&&!busy&&!completed[mode].includes(task.level)){
    setCompleted({...completed,[mode]:[...completed[mode],task.level].sort((a,b)=>a-b)});
  }
  const side=Math.max(240,Math.min(available-8,420));
  const size=(side-(n-1)*4)/n;
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
  useEffect(()=>{
    if(!onReady)return;
    onReady({request:(level:number)=>{if(preset||readyFor!==hydrationKey||busy)return;request(Math.max(1,Math.min(50,level)));}});
  });   // без списка зависимостей нарочно: наружу уходит ссылка на ТЕКУЩИЙ request, маршрут держит её в ref
  const ink={color:colors.text};
  if(!profileReady||readyFor!==hydrationKey)return <View style={styles.field}><Text style={ink}>Восстанавливаю локальную партию…</Text></View>;
  return <GameShell title={mode==='net'?t('spatialNet'):t('spatialTwiddle')} onBack={onBack} overlay={overlay}
    frame={preset?spatialFrame(viewportHeight):undefined}
    confirmExit={state.past.length>0&&!won} scrollableField
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
    headerActions={<View style={styles.top}>
      {header}
      {!preset&&<View style={styles.tabs}>{(['twiddle','net'] as const).map(m=><Pressable key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>{if(m!==mode)request(m);}} style={[styles.tab,{borderColor:mode===m?colors.primary:colors.border,backgroundColor:colors.surface}]}><Text style={ink}>{m==='twiddle'?'Числа':'Трубы'}</Text></Pressable>)}</View>}
      {/*
        ⚠️ ПАНЕЛЬ СЛУЖЕБНЫХ КНОПОК ОБЁРНУТА В РЯД (перенос 09.09.2026).
        У `GameAuxBar` с 03.09 стоит `flexGrow: 1` + `flexBasis: 0` — она
        рассчитана растягиваться внутри РЯДА своего слота. В колонке такой
        ребёнок получает нулевую высоту, и кнопки вылезают поверх поля: замер
        живьём дал контейнер 144..144 при панели 144..192 — 42 точки поверх
        строки задания. Обёртка возвращает панели её ряд.
      */}
      <View style={styles.auxRow}><GameAuxBar><GameAuxAction compact={!!preset} icon={preset?'arrow-undo':undefined} label="Отменить" onPress={()=>setState(undo)} disabled={!state.past.length||pending!==null||busy}/><GameAuxAction compact={!!preset} icon={preset?'arrow-redo':undefined} label="Вернуть" onPress={()=>setState(redo)} disabled={!state.future.length||pending!==null||busy}/><GameAuxAction compact={!!preset} icon={preset?'play':undefined} label={replayIndex!==null?'Стоп':'Повтор'} onPress={()=>setReplayIndex(replayIndex!==null?null:0)} disabled={!state.past.length||pending!==null||turning!==null}/>{!preset&&<GameAuxAction label="Новая" onPress={()=>request('new')} disabled={pending!==null||busy}/>}</GameAuxBar></View>
    </View>}
    toolbar={<View style={styles.turns}>{([-1,1] as const).map(a=><Pressable key={a} accessibilityRole="button" accessibilityLabel={a<0?'Повернуть влево':'Повернуть вправо'} disabled={won||pending!==null||busy||locked(selection)} onPress={()=>turn(a)} style={[styles.turn,{backgroundColor:colors.primary,opacity:won||pending!==null||busy||locked(selection)?0.4:1}]}><Text style={styles.turnText}>{a<0?'↶ Влево':'Вправо ↷'}</Text></Pressable>)}</View>}>
    <View style={styles.field} onLayout={e=>setAvailable(e.nativeEvent.layout.width)}>
      {pending!==null?<View style={[styles.confirm,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={ink}>Начать заново? Текущие ходы будут потеряны.</Text>
        <View style={styles.auxRow}><GameAuxBar><GameAuxAction label="Остаться" onPress={()=>setPending(null)}/><GameAuxAction label="Начать" onPress={()=>accept(pending)}/></GameAuxBar></View>
      </View>:null}
      <View style={{alignItems:'center',gap:8}}>
        <Text testID="spatial-level" style={ink}>{task?`Уровень ${task.level}/50`:'Свободная игра'}</Text>
        {!preset&&<Text testID="spatial-completed" style={ink}>Пройдено: {completed[mode].length}/50</Text>}
        {!preset&&<View style={styles.auxRow}><GameAuxBar>
          <GameAuxAction label="Проще" disabled={!task||task.level===1||busy||pending!==null} onPress={()=>request((task?.level??1)-1)}/>
          <GameAuxAction label={task?'Сложнее':'Начать уровни'} disabled={task?.level===50||busy||pending!==null} onPress={()=>request((task?.level??0)+1)}/>
          {task?<GameAuxAction label="Свободная" disabled={busy||pending!==null} onPress={()=>request(0)}/>:null}
        </GameAuxBar></View>}
        {task?<Text style={[styles.instruction,ink]}>{task.spec.change}</Text>:null}
      </View>
      {task&&'guide' in task&&task.guide&&state.past.length===0?<Text testID="spatial-guide" style={[styles.instruction,ink]}>Выделенный блок: поверни {task.guide.amount!<0?'влево ↶':'вправо ↷'}.</Text>:null}
      <Text style={[styles.instruction,ink]}>{mode==='net'?'Соедини все трубы с источником, без открытых концов.':`Выбери блок 2×2. Расставь числа по строкам от 1 до ${n*n}.`}</Text>
      <View testID="spatial-board" style={{width:side,gap:4}}>{Array.from({length:n},(_,r)=><View key={r} style={styles.row}>{view.cells.slice(r*n,(r+1)*n).map((cell,c)=>{
        const i=r*n+c, sr=Math.floor(selection/n),sc=selection%n;
        const selected=mode==='net'?selection===i:r>=sr&&r<sr+2&&c>=sc&&c<sc+2;
        const directions=['вверх','вправо','вниз','влево'].filter((_,d)=>maskAt(cell)&(1<<d));
        return <Pressable key={i} testID={`spatial-cell-${i}`} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={`${mode==='net'?`Труба ${directions.join(', ')}`:`Число ${cell.id+1}`}, строка ${r+1}, столбец ${c+1}`} disabled={pending!==null||busy||locked(i)} onPress={()=>{if(locked(i))return;setSelection(mode==='net'?i:Math.min(r,n-2)*n+Math.min(c,n-2));}}
          style={[styles.cell,{opacity:turning!==null&&selected?0:1,width:size,height:size,borderColor:selected?'#713ed4':'#aaa1c5',backgroundColor:info?(liveColour&&info.connected.has(i)?'#c3ebdd':'#e1e6ef'):liveColour&&cell.id===i?'#cbebdf':'#e3d9f8',borderWidth:selected?3:1}]}>
          {info?<SpatialPipe cell={cell} active={liveColour&&info.connected.has(i)} source={i===0}/>:<Text style={styles.number}>{cell.id+1}</Text>}
          {locked(i)?<Text style={{position:'absolute',right:3,top:1,fontSize:12}} accessibilityLabel="Закреплена">●</Text>:null}
        </Pressable>;
      })}</View>)}
      {turning!==null?<Animated.View testID="spatial-turn-animation" pointerEvents="none" accessibilityElementsHidden style={{position:'absolute',left:(selection%n)*(size+4),top:Math.floor(selection/n)*(size+4),width:mode==='net'?size:size*2+4,height:mode==='net'?size:size*2+4,zIndex:2,transform:[{rotate:angle.interpolate({inputRange:[-90,90],outputRange:['-90deg','90deg']})},{scale:angle.interpolate({inputRange:[-90,-45,0,45,90],outputRange:[1,0.707,1,0.707,1]})}]}}>
        {(mode==='net'?[selection]:[selection,selection+1,selection+n,selection+n+1]).map((i,j)=><View key={i} style={[styles.cell,{position:'absolute',left:mode==='net'?0:(j%2)*(size+4),top:mode==='net'?0:Math.floor(j/2)*(size+4),width:size,height:size,backgroundColor:mode==='net'?'#e1e6ef':'#e3d9f8',borderWidth:3,borderColor:'#713ed4'}]}>
          {mode==='net'?<SpatialPipe cell={view.cells[i]} active={liveColour&&!!info?.connected.has(i)} source={i===0}/>:<Animated.Text style={[styles.number,{transform:[{rotate:angle.interpolate({inputRange:[-90,90],outputRange:['90deg','-90deg']})}]}]}>{view.cells[i].id+1}</Animated.Text>}
        </View>)}
      </Animated.View>:null}</View>
      <Text accessibilityLiveRegion="polite" style={[styles.status,ink]}>{turning!==null?'Поворот…':replayIndex!==null?`Повтор: ${replayIndex}/${state.past.length}`:won?'Готово! Задача решена.':info?`Открытых концов: ${info.leaks}`:`Блок: ${Math.floor(selection/n)+1}, ${selection%n+1}`}</Text>
      <View style={{paddingHorizontal:52}}><Text testID="spatial-save-status" style={[styles.note,{color:colors.textSecondary}]}>{preset?'Шаг зарядки · отдельная партия, личное сохранение не меняется':saveError||'Партия и прогресс сохраняются только на этом устройстве'}</Text></View>
    </View>
  </GameShell>;
}
const styles=StyleSheet.create({
  top:{gap:8},auxRow:{flexDirection:'row',alignSelf:'stretch'},tabs:{flexDirection:'row',gap:8,justifyContent:'center'},tab:{minHeight:48,minWidth:100,borderWidth:2,borderRadius:12,alignItems:'center',justifyContent:'center'},
  turns:{flexDirection:'row',gap:8,width:'100%',maxWidth:640,paddingLeft:32},turn:{flex:1,minHeight:52,borderRadius:12,alignItems:'center',justifyContent:'center',padding:8},turnText:{color:'#fff',fontSize:16,fontWeight:'700'},
  field:{alignItems:'center',width:'100%',gap:12},instruction:{fontSize:16,textAlign:'center',maxWidth:420,lineHeight:22},row:{flexDirection:'row',gap:4},cell:{borderRadius:12,alignItems:'center',justifyContent:'center',overflow:'hidden'},number:{fontSize:27,fontWeight:'800',color:'#352654'},status:{fontSize:16,textAlign:'center'},note:{fontSize:12,textAlign:'center'},confirm:{padding:12,borderWidth:1,borderRadius:12,gap:12,width:'100%'},
});
