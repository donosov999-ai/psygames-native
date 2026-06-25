import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * BossRound — общий движок «битвы с боссом»: на вехах уровней игра прерывается
 * коротким раундом с РЕЗКО другим правилом (тренировка переключения / гибкости).
 * Похоже на основную игру по материалу, но действие иное (Шульте «ищи числа» →
 * босс «сложи подсвеченные»). Переиспользуется во всех играх; тип задачи = config.type.
 *
 * Пилот (v1.92): type='counting' — сложи подсвеченные числа.
 * Дальше расширяется новыми type ('gonogo', 'oddletter', 'corsi', …) без правок игр.
 */

export type BossType = 'counting';

export interface BossConfig {
  type: BossType;
  gradient: [string, string];
  durationSec?: number;   // лимит на раунд (по умолчанию 15с)
}

interface Props {
  config: BossConfig;
  language: string;
  colors: any;
  onComplete: (win: boolean) => void;   // мягкий провал — игра решает, что дальше
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

interface Counting { nums: number[]; highlighted: number[]; answer: number; options: number[]; }

// «Считалка»: 6 чисел, 3 подсвечены — сумма + 4 близких варианта.
function makeCounting(): Counting {
  const nums = Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * 12));
  const highlighted = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3);
  const answer = highlighted.reduce((s, i) => s + nums[i], 0);
  const opts = new Set<number>([answer]);
  while (opts.size < 4) {
    const d = answer + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 6));
    if (d > 0) opts.add(d);
  }
  return { nums, highlighted, answer, options: shuffle([...opts]) };
}

export default function BossRound({ config, language, colors, onComplete }: Props) {
  const ru = language === 'ru';
  const [stage, setStage] = useState<'intro' | 'task' | 'done'>('intro');
  const [task] = useState<Counting>(makeCounting);
  const [picked, setPicked] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [timeLeft, setTimeLeft] = useState(config.durationSec ?? 15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const introRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    introRef.current = setTimeout(() => setStage('task'), 1800);   // вспышка-предупреждение
    return () => {
      if (introRef.current) clearTimeout(introRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (doneRef.current) clearTimeout(doneRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== 'task') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { finish(false); return 0; } return t - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (win: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setWon(win); setStage('done');
    doneRef.current = setTimeout(() => onComplete(win), 1400);
  };

  const pick = (v: number) => {
    if (picked !== null) return;
    setPicked(v);
    finish(v === task.answer);
  };

  if (stage === 'intro') {
    return (
      <View style={[styles.full, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={styles.bossEmoji}>⚔️</Text>
          <Text style={[styles.bossTitle, { color: colors.text }]}>{ru ? 'БОСС' : 'BOSS'}</Text>
          <Text style={[styles.bossHint, { color: colors.textSecondary }]}>
            {ru ? 'Теперь СЛОЖИ подсвеченные числа — не ищи по порядку!' : 'Now ADD the highlighted numbers — don\'t search in order!'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.full, { backgroundColor: colors.background }]}>
      <View style={styles.hud}>
        <Text style={[styles.hudText, { color: '#f59e0b' }]}>⚔️ {ru ? 'БОСС: сумма подсвеченных?' : 'BOSS: sum of highlighted?'}</Text>
        <Text style={[styles.hudText, { color: timeLeft <= 5 ? '#ef4444' : colors.textSecondary }]}>⏱ {timeLeft}</Text>
      </View>

      <View style={styles.numGrid}>
        {task.nums.map((n, i) => {
          const hl = task.highlighted.includes(i);
          return (
            <View key={i} style={[styles.numCell, {
              backgroundColor: hl ? '#fde68a' : colors.surface,
              borderColor: hl ? '#f59e0b' : colors.border,
              borderWidth: hl ? 3 : 1,
            }]}>
              <Text style={[styles.numText, { color: hl ? '#92600a' : colors.text }]}>{n}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.opts}>
        {task.options.map((o, i) => {
          const isP = picked === o;
          const correct = stage === 'done' && o === task.answer;
          const wrong = stage === 'done' && isP && o !== task.answer;
          return (
            <TouchableOpacity key={i} disabled={picked !== null} activeOpacity={0.85} onPress={() => pick(o)}
              style={[styles.optBtn, { backgroundColor: correct ? '#22c55e' : wrong ? '#ef4444' : config.gradient[0] }]}>
              <Text style={styles.optText}>{o}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {stage === 'done' && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>
            {won ? (ru ? '🏆 Босс повержен! +⭐' : '🏆 Boss defeated! +⭐') : (ru ? 'Босс устоял — идём дальше' : 'Boss survived — moving on')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, padding: 20, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 12 },
  bossEmoji: { fontSize: 72 },
  bossTitle: { fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  bossHint: { fontSize: 15, textAlign: 'center', maxWidth: 320, lineHeight: 21 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  hudText: { fontSize: 15, fontWeight: '700' },
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 32 },
  numCell: { width: 80, height: 80, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  numText: { fontSize: 34, fontWeight: '800' },
  opts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  optBtn: { minWidth: 76, paddingVertical: 18, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center' },
  optText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  banner: { position: 'absolute', top: '42%', alignSelf: 'center', backgroundColor: 'rgba(245,158,11,0.97)', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16 },
  bannerText: { color: '#3f2b00', fontSize: 19, fontWeight: '900', textAlign: 'center' },
});
