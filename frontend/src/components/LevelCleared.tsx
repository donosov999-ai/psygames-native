import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sndWin } from '@/src/services/feedback';

/**
 * LevelCleared — короткий баннер между уровнями для АВТО-ПОТОКА (по выбору Дениса):
 * прошёл уровень чисто → «Уровень N ✓ ⭐⭐⭐» (~2с) → следующий стартует САМ (onContinue).
 * Кнопки «Дальше сразу» (мгновенно) и «Остановиться» (выход) дают контроль.
 * Полноэкранный GameResult остаётся для НЕ-пройденных попыток (переиграть/выйти).
 */

interface Props {
  level: number;            // пройденный уровень (баннер: N ✓ → N+1)
  stars?: number;           // 1–3
  gradient: string[];
  language: string;
  colors: any;
  autoMs?: number;          // авто-старт следующего (по умолчанию 2200мс)
  onContinue: () => void;   // запустить следующий уровень
  onStop: () => void;       // выйти (config / домой)
}

export default function LevelCleared({ level, stars = 3, gradient, language, colors, autoMs = 2200, onContinue, onStop }: Props) {
  const ru = language === 'ru';
  const firedRef = useRef(false);
  const go = () => { if (firedRef.current) return; firedRef.current = true; onContinue(); };

  useEffect(() => {
    sndWin();
    const t = setTimeout(go, autoMs);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.full, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>{ru ? `Уровень ${level} пройден!` : `Level ${level} done!`}</Text>
        <View style={styles.stars}>
          {[1, 2, 3].map((i) => (
            <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={36} color={i <= stars ? '#FFD93B' : 'rgba(255,255,255,0.5)'} />
          ))}
        </View>
        <Text style={styles.next}>{ru ? `Уровень ${level + 1} запускается…` : `Starting level ${level + 1}…`}</Text>
      </LinearGradient>
      <View style={styles.btns}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={go} activeOpacity={0.85}>
          <Ionicons name="play" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>{ru ? 'Дальше сразу' : 'Next now'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => { firedRef.current = true; onStop(); }} activeOpacity={0.85}>
          <Ionicons name="stop" size={20} color={colors.text} />
          <Text style={[styles.btnText, { color: colors.text }]}>{ru ? 'Остановиться' : 'Stop'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', borderRadius: 24, padding: 32, alignItems: 'center' },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 12, marginBottom: 16, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  next: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  btns: { width: '100%', marginTop: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginBottom: 8 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
