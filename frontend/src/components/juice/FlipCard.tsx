import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';
import { hapticTap } from './haptics';

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
}

// Карта с 3D-переворотом (rotateY вокруг perspective). Тап → хаптик.
// Две грани с backfaceVisibility:hidden — видна только обращённая к зрителю.
export default function FlipCard({ size, flipped, matched, onPress, disabled, back, front, radius = 12, style }: Props) {
  const flip = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(flip, { toValue: flipped ? 1 : 0, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [flipped, flip]);
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const faceBase: ViewStyle = {
    position: 'absolute', width: size, height: size, borderRadius: radius,
    justifyContent: 'center', alignItems: 'center', backfaceVisibility: 'hidden', overflow: 'hidden',
  };
  return (
    <Pressable disabled={disabled} onPress={() => { if (!disabled) { hapticTap(); onPress?.(); } }} style={[{ width: size, height: size }, style]}>
      <Animated.View style={[faceBase, { opacity: matched ? 0.55 : 1, transform: [{ perspective: 800 }, { rotateY: backRotate }] }]}>{back}</Animated.View>
      <Animated.View style={[faceBase, { opacity: matched ? 0.55 : 1, transform: [{ perspective: 800 }, { rotateY: frontRotate }] }]}>{front}</Animated.View>
    </Pressable>
  );
}
