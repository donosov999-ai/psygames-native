/**
 * Global toast listener for level-unlock events.
 *
 * Listens for `psygames:level-unlocked` CustomEvent on the window (fired
 * by level-unlocks service after every threshold pass). Shows a temporary
 * floating banner at the top.
 *
 * Mounted once at the root layout, so it works no matter which screen
 * the user finishes a game on.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface UnlockEventDetail {
  gameId: string;
  levelKey: string;
  label: string;
}

export default function UnlockToast() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState<UnlockEventDetail | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    // Only on web/Tauri (window-based CustomEvent). Native RN would need a different bus.
    if (typeof window === 'undefined') return;

    const handler = (e: Event) => {
      const ce = e as CustomEvent<UnlockEventDetail>;
      setDetail(ce.detail);
      setVisible(true);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
      ]).start();
      // Auto-dismiss after 4.5s
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -50, duration: 250, useNativeDriver: true }),
        ]).start(() => {
          setVisible(false);
          setDetail(null);
        });
      }, 4500);
    };

    window.addEventListener('psygames:level-unlocked', handler);
    return () => window.removeEventListener('psygames:level-unlocked', handler);
  }, [opacity, translateY]);

  if (!visible || !detail) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, {
      opacity, transform: [{ translateY }],
    }]}>
      <Ionicons name="trophy" size={20} color="#fbbf24" />
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>🎉 Новый уровень разблокирован!</Text>
        <Text style={styles.toastSub}>{detail.label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  toastTitle: { color: '#fbbf24', fontSize: 14, fontWeight: '800' },
  toastSub: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
});
