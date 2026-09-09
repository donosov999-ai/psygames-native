/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
import React,{useEffect,useState,useId} from 'react';
import {Animated,Easing} from 'react-native';
import Svg,{Polygon,Defs,LinearGradient,Stop} from 'react-native-svg';
import {shapeSurface} from '../games/mental-rotation/core/surface';
import type {Axis,Shape} from '../games/mental-rotation/core/types';

import {useReducedMotion} from '@/src/hooks/useReducedMotion';
export function RotationShape({shape,size,axis='x',degrees=0}:{shape:Shape;size:number;axis?:Axis;degrees?:number}){
  const shine=`cube-shine-${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
  return <Svg testID="rotation-shape" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <Defs><LinearGradient id={shine} x1="0%" y1="0%" x2="65%" y2="100%"><Stop offset="0%" stopColor="#ffffff" stopOpacity={.42}/><Stop offset="48%" stopColor="#ffffff" stopOpacity={.05}/><Stop offset="100%" stopColor="#302043" stopOpacity={.18}/></LinearGradient></Defs>
    {shapeSurface(shape,size,axis,degrees).map(f=>{
      const points=f.points.map(p=>p.join(',')).join(' ');
      return <React.Fragment key={f.id}><Polygon points={points} fill={f.fill} stroke="#635078" strokeWidth={1.1} strokeLinejoin="round"/><Polygon points={points} fill={`url(#${shine})`} stroke="#eee3ff" strokeOpacity={.22} strokeWidth={.45} strokeLinejoin="round"/></React.Fragment>;
    })}
  </Svg>;
}

/** A genuine 3D interpolation, not a crossfade between unrelated stills. */
export function RotationTransition({from,to,axis,size,reduceMotion:reduceMotionProp=false}:{from:Shape;to:Shape;axis:Axis;size:number;reduceMotion?:boolean}){
  // Настройку «меньше движения» компонент читает САМ (гейт reduced-motion: кто запускает
  // анимацию — тот и спрашивает); проп оставлен — экран может форсировать мгновенный показ.
  const reduceMotion=useReducedMotion()||reduceMotionProp;
  const [value]=useState(()=>new Animated.Value(0));
  const [degrees,setDegrees]=useState(0);
  useEffect(()=>{
    const id=value.addListener(({value:v})=>setDegrees(v));
    value.stopAnimation();value.setValue(0);
    if(reduceMotion)return()=>value.removeListener(id);
    const animation=Animated.timing(value,{toValue:90,duration:600,easing:Easing.inOut(Easing.cubic),useNativeDriver:false});
    animation.start();
    return ()=>{animation.stop();value.removeListener(id);};
  },[from,to,axis,reduceMotion,value]);
  return reduceMotion?<RotationShape shape={to} size={size}/>:<RotationShape shape={from} size={size} axis={axis} degrees={degrees}/>;
}
