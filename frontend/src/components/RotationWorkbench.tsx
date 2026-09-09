/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,Text,View} from 'react-native';
import {normalizeShape,rotateShape,sameShape} from '../games/mental-rotation/core/geometry';
import type {Axis,Shape} from '../games/mental-rotation/core/types';
import {RotationShape} from './RotationShape';

import {useReducedMotion} from '@/src/hooks/useReducedMotion';
/** Educational manipulation after the timed response, never an answer shortcut. */
export default function RotationWorkbench({initial,target,size,reduceMotion:reduceMotionProp,ink,accent,ru}:{initial:Shape;target:Shape;size:number;reduceMotion:boolean;ink:string;accent:string;ru:boolean}){
  const reduceMotion=useReducedMotion()||reduceMotionProp;   // настройку читает сам (гейт reduced-motion)
  const [shape,setShape]=useState(initial),[axis,setAxis]=useState<Axis>('x'),[degrees,setDegrees]=useState(0),[busy,setBusy]=useState(false),[moves,setMoves]=useState(0);
  const lock=useRef(false);
  const [value]=useState(()=>new Animated.Value(0));
  useEffect(()=>{const id=value.addListener(({value:v})=>setDegrees(v));return()=>{value.stopAnimation();value.removeListener(id);};},[value]);
  function turn(a:Axis,amount:number){
    if(lock.current)return;
    lock.current=true;setBusy(true);setAxis(a);value.setValue(0);
    const next=normalizeShape(rotateShape(shape,a,amount));
    const finish=()=>{setShape(next);value.setValue(0);setDegrees(0);setMoves(n=>n+1);setBusy(false);lock.current=false;};
    if(reduceMotion){finish();return;}
    Animated.timing(value,{toValue:amount*90,duration:600,easing:Easing.inOut(Easing.cubic),useNativeDriver:false}).start(({finished})=>{if(finished)finish();});
  }
  return <View testID="rotation-workbench" style={{alignItems:'center',gap:8,width:'100%',maxWidth:360}}>
    <RotationShape shape={shape} size={size} axis={axis} degrees={degrees}/>
    <Text style={{color:ink,textAlign:'center'}}>{ru?'Поверни как в правильном ответе':'Match the orientation of the correct answer'}</Text>
    {(['x','y','z'] as const).map(a=><View key={a} style={{flexDirection:'row',gap:8,width:'100%'}}>{[-1,1].map(amount=><Pressable key={amount} testID={`rotation-${a}-${amount}`} accessibilityRole="button" accessibilityLabel={`${a.toUpperCase()} ${amount<0?'−':'+'}90°`} disabled={busy} onPress={()=>turn(a,amount)} style={{flex:1,minHeight:48,borderRadius:10,borderWidth:1,borderColor:accent,alignItems:'center',justifyContent:'center',opacity:busy?.5:1}}><Text style={{color:ink}}>{a.toUpperCase()} {amount<0?'↶':'↷'}</Text></Pressable>)}</View>)}
    <Text testID="rotation-match" accessibilityLiveRegion="polite" style={{color:ink,textAlign:'center'}}>{busy?(ru?'Поворот…':'Turning…'):sameShape(shape,target)?(ru?'Ориентация совпала ✓':'Orientation matched ✓'):`${ru?'Поворотов':'Turns'}: ${moves}`}</Text>
  </View>;
}
