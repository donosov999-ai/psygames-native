import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';
import { hapticTap } from './haptics';
import { settle } from './motion';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { sndFlip } from '@/src/services/feedback';

interface Props {
  size: number;
  flipped: boolean;            // false = рубашка (back), true = лицо (front)
  matched?: boolean;           // собрано → приглушение
  onPress?: () => void;
  disabled?: boolean;
  back: React.ReactNode;       // лицо рубашки
  front: React.ReactNode;      // лицо карты
  radius?: number;
  style?: ViewStyle;
  /** Подпись для скринридера: рубашка не должна выдавать символ. */
  a11yLabel?: string;
}

// Карта с 3D-переворотом (rotateY вокруг perspective). Тап → хаптик.
// Две грани с backfaceVisibility:hidden — видна только обращённая к зрителю.
export default function FlipCard({ size, flipped, matched, onPress, disabled, back, front, radius = 12, style, a11yLabel }: Props) {
  const reduced = useReducedMotion();
  const flip = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const hov = useRef(new Animated.Value(1)).current;   // десктоп: ховер-подъём карты
  const mounted = useRef(false);
  useEffect(() => {
    /**
     * Щадящий режим. Переворот — это и есть ход игры: карта показала символ.
     * Убрать его нельзя, иначе играть не во что. Но вращение на 180° вокруг
     * вертикальной оси — самое сильное движение во всём наборе, поэтому грань
     * меняется мгновенно: символ просто оказывается на месте рубашки. Звук
     * свуша остаётся — он не движение и сообщает то же самое на слух.
     */
    settle(flip, flipped ? 1 : 0, reduced, { friction: 8, tension: 90 });
    if (reduced) hov.setValue(1);   // настройку могли включить с курсором над картой
    if (mounted.current) sndFlip();   // свуш при перевороте (не на первом монтировании)
    mounted.current = true;
  }, [flipped, flip, hov, reduced]);
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const faceBase: ViewStyle = {
    position: 'absolute', width: size, height: size, borderRadius: radius,
    justifyContent: 'center', alignItems: 'center', backfaceVisibility: 'hidden', overflow: 'hidden',
  };
  return (
    <Pressable disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !!disabled, selected: !!matched }}
      onHoverIn={() => { if (!reduced) Animated.spring(hov, { toValue: 1.06, friction: 7, useNativeDriver: true }).start(); }}
      onHoverOut={() => { if (!reduced) Animated.spring(hov, { toValue: 1, friction: 7, useNativeDriver: true }).start(); }}
      onPress={() => { if (!disabled) { hapticTap(); onPress?.(); } }} style={[{ width: size, height: size }, style]}>
      <Animated.View style={[faceBase, { opacity: matched ? 0.55 : 1, transform: [{ perspective: 800 }, { rotateY: backRotate }, { scale: hov }] }]}>{back}</Animated.View>
      <Animated.View style={[faceBase, { opacity: matched ? 0.55 : 1, transform: [{ perspective: 800 }, { rotateY: frontRotate }, { scale: hov }] }]}>{front}</Animated.View>
    </Pressable>
  );
}
