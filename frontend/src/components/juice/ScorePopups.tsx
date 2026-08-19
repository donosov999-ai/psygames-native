import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

export interface Popup { id: number; x: number; y: number; text: string; color: string; }
let _id = 0;

// Менеджер всплывашек «+N». spawn(x, y, text, color) — текст взлетает и гаснет ~0.9с.
// Координаты (x,y) — относительно слоя ScorePopupLayer (обычно игрового контейнера).
export function useScorePopups() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const spawn = (x: number, y: number, text: string, color = '#fde047') => {
    const id = ++_id;
    setPopups((p) => [...p, { id, x, y, text, color }]);
    setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 950);
  };
  return { popups, spawn };
}

function ScorePopup({ popup }: { popup: Popup }) {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [a, reduced]);

  /**
   * Щадящий режим. «+40» — это не украшение, а сообщение «засчитано сорок»:
   * убрать его совсем значит отнять у человека счёт. Поэтому оставляем текст,
   * но он просто появляется на месте — без взлёта на 52 точки вверх, без
   * подпрыгивания масштаба и без затухания. Снимет его тот же таймер на 950 мс,
   * что и в обычном режиме, так что поведение слоя не меняется.
   */
  if (reduced) {
    return (
      <View pointerEvents="none" style={[styles.pop, { left: popup.x, top: popup.y }]}>
        <Text style={[styles.txt, { color: popup.color }]}>{popup.text}</Text>
      </View>
    );
  }

  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [0, -52] });
  const opacity = a.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const scale = a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 1] });
  return (
    <Animated.View pointerEvents="none" style={[styles.pop, { left: popup.x, top: popup.y, opacity, transform: [{ translateY }, { scale }] }]}>
      <Text style={[styles.txt, { color: popup.color }]}>{popup.text}</Text>
    </Animated.View>
  );
}

// Слой всплывашек поверх игры (absoluteFill). Рендерить ПОСЛЕДНИМ внутри игрового контейнера.
export function ScorePopupLayer({ popups }: { popups: Popup[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {popups.map((p) => <ScorePopup key={p.id} popup={p} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  pop: { position: 'absolute' },
  txt: { fontSize: 24, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
