import React, { useRef } from 'react';
import { Animated, Pressable, ViewStyle, PressableProps, GestureResponderEvent } from 'react-native';
import { hapticTap } from './haptics';

interface Props extends Omit<PressableProps, 'style'> {
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  scaleTo?: number;
  children: React.ReactNode;
}

// Нажимается «вкусно»: лёгкое вдавливание пружиной + хаптик. Обёртка над Pressable.
export default function JuicyPressable({ style, haptic = true, scaleTo = 0.92, onPress, disabled, children, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) => Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: true }).start();
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
      onPress={(e: GestureResponderEvent) => { if (!disabled) { if (haptic) hapticTap(); onPress?.(e); } }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
