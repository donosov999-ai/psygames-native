import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  colors?: [string, string];   // верх (светлее) → низ (темнее)
  size?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

// Объёмная грань плитки/слота: вертикальный градиент + верхний блик +
// тёмный нижний бордер + тень = ощущение объёма вместо плоского фона.
export default function TileFace({ colors = ['#fbbf24', '#d97706'], size, radius = 12, style, children }: Props) {
  return (
    <View style={[styles.shadow, size ? { width: size, height: size } : null, { borderRadius: radius }, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[styles.face, { borderRadius: radius }]}>
        <View style={[styles.highlight, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} pointerEvents="none" />
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  face: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderBottomColor: 'rgba(0,0,0,0.25)', borderBottomWidth: 3, overflow: 'hidden' },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.18)' },
});
