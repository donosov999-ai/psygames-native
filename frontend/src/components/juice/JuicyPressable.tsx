import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ViewStyle, PressableProps, GestureResponderEvent } from 'react-native';
import { hapticTap } from './haptics';
import { settle } from './motion';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

interface Props extends Omit<PressableProps, 'style'> {
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  scaleTo?: number;
  children: React.ReactNode;
}

// Нажимается «вкусно»: лёгкое вдавливание пружиной + хаптик. Обёртка над Pressable.
export default function JuicyPressable({ style, haptic = true, scaleTo = 0.92, onPress, disabled, children, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const hov = useRef(false);   // десктоп: ховер-подъём
  const spring = (to: number) => settle(scale, to, reduced, { friction: 6, tension: 220 });
  // Щадящий режим — тот же размен, что в JuicyButton: ховер-подъём (украшение)
  // гасим совсем, вдавливание при нажатии (подтверждение) оставляем мгновенным.
  useEffect(() => { if (reduced) { hov.current = false; settle(scale, 1, true); } }, [reduced, scale]);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onHoverIn={() => { if (reduced) return; hov.current = true; spring(1.03); }}
      onHoverOut={() => { if (reduced) return; hov.current = false; spring(1); }}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(hov.current ? 1.03 : 1)}
      onPress={(e: GestureResponderEvent) => { if (!disabled) { if (haptic) hapticTap(); onPress?.(e); } }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
