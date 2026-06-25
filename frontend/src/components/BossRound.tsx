import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * BossRound — общий движок «битвы с боссом»: на вехах уровней игра прерывается
 * коротким раундом с РЕЗКО другим правилом (тренировка переключения / гибкости).
 * Переиспользуется во всех играх; тип задачи = config.type.
 *
 * Типы:
 *  - counting    (Шульте) — сложи подсвеченные числа.
 *  - lightning   (судоку) — какой цифры не хватает в ряду.
 *  - completeline(судоку) — дополни набор 1-9 (назови недостающую).
 *  - finderror   (судоку) — найди клетку-повтор в строке (тап нарушителя).
 *  - memblock    — TODO (память показ→скрыть), пока не реализован → фаза-2.
 *
 * Два режима задачи: 'choose' (выбрать вариант) и 'tapcell' (тапнуть клетку сетки).
 */

export type BossType = 'counting' | 'lightning' | 'completeline' | 'finderror' | 'oddletter' | 'gonogo';

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

const rnd = (n: number) => Math.floor(Math.random() * n);
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function mkOptions(answer: number): number[] {
  const o = new Set<number>([answer]);
  while (o.size < 4) { const d = answer + (Math.random() < 0.5 ? -1 : 1) * (1 + rnd(6)); if (d > 0) o.add(d); }
  return shuffle([...o]);
}
function mkOptionsFrom(answer: number, max: number): number[] {
  const o = new Set<number>([answer]);
  for (const v of shuffle(Array.from({ length: max }, (_, i) => i + 1).filter((v) => v !== answer))) {
    if (o.size >= 4) break; o.add(v);
  }
  return shuffle([...o]);
}

interface BossTask {
  kind: 'choose' | 'tapcell';
  intro: { ru: string; en: string };
  hud: { ru: string; en: string };
  cells?: { value: number | string; hl?: boolean }[];   // choose: визуальная сетка-подсказка
  cols?: number;
  options?: number[];
  answer?: number;
  grid?: (number | string)[];                             // tapcell: сетка для тапа (числа/буквы/эмодзи)
  gridCols?: number;
  badCells?: number[];                                    // tapcell: «нарушители» (верный тап)
}

function makeTask(type: BossType): BossTask {
  if (type === 'lightning') {
    const n = 5, miss = 1 + rnd(n);
    const cells = Array.from({ length: n }, (_, i) => ({ value: (i + 1 === miss ? '?' : i + 1) as number | string, hl: i + 1 === miss }));
    return { kind: 'choose', intro: { ru: 'Какой цифры НЕ ХВАТАЕТ в ряду?', en: 'Which digit is MISSING?' }, hud: { ru: 'Впиши пропуск', en: 'Fill the gap' }, cells, cols: n, options: mkOptionsFrom(miss, n), answer: miss };
  }
  if (type === 'completeline') {
    const miss = 1 + rnd(9);
    const shown = shuffle(Array.from({ length: 9 }, (_, i) => i + 1).filter((v) => v !== miss));
    return { kind: 'choose', intro: { ru: 'Дополни ряд до 1–9 — какой цифры нет?', en: 'Complete 1-9 — which digit is missing?' }, hud: { ru: 'Недостающая цифра', en: 'Missing digit' }, cells: shown.map((v) => ({ value: v })), cols: 9, options: mkOptionsFrom(miss, 9), answer: miss };
  }
  if (type === 'finderror') {
    const n = 4;
    const grid: number[] = [];
    for (let r = 0; r < n; r++) for (const v of shuffle([1, 2, 3, 4])) grid.push(v);
    const er = rnd(n), base = er * n, a = rnd(n);
    let b = rnd(n); while (b === a) b = rnd(n);
    grid[base + b] = grid[base + a];   // в строке er теперь повтор (клетки a и b)
    return { kind: 'tapcell', intro: { ru: 'Найди ОШИБКУ — цифра повторяется в строке', en: 'Find the ERROR — a repeat in a row' }, hud: { ru: 'Тапни повтор', en: 'Tap the repeat' }, grid, gridCols: n, badCells: [base + a, base + b] };
  }
  if (type === 'oddletter') {
    // 5 согласных + 1 гласная (латиница, универсально) — тапни ЛИШНЮЮ гласную.
    const cons = 'BCDFGHJKLMNPQRSTVWXZ', vow = 'AEIOU';
    const letters: (number | string)[] = Array.from({ length: 5 }, () => cons[rnd(cons.length)]);
    const vIdx = rnd(6);
    letters.splice(vIdx, 0, vow[rnd(vow.length)]);
    return { kind: 'tapcell', intro: { ru: 'Найди ЛИШНЮЮ — гласную среди согласных', en: 'Find the ODD letter — the vowel' }, hud: { ru: 'Тапни гласную', en: 'Tap the vowel' }, grid: letters, gridCols: 3, badCells: [vIdx] };
  }
  if (type === 'gonogo') {
    // 6 цветных кружков, ровно один ЗЕЛЁНЫЙ — тапни только его (подави остальные).
    const others = ['🔴', '🔵', '🟡', '🟣', '🟠'];
    const grid: (number | string)[] = Array.from({ length: 6 }, () => others[rnd(others.length)]);
    const gIdx = rnd(6);
    grid[gIdx] = '🟢';
    return { kind: 'tapcell', intro: { ru: 'Тапни только ЗЕЛЁНЫЙ, подави остальные', en: 'Tap only GREEN' }, hud: { ru: 'Зелёный!', en: 'Green!' }, grid, gridCols: 3, badCells: [gIdx] };
  }
  // counting (Шульте)
  const nums = Array.from({ length: 6 }, () => 1 + rnd(12));
  const hl = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3);
  const answer = hl.reduce((s, i) => s + nums[i], 0);
  return { kind: 'choose', intro: { ru: 'Теперь СЛОЖИ подсвеченные числа — не ищи по порядку!', en: 'Now ADD the highlighted numbers!' }, hud: { ru: 'Сумма подсвеченных?', en: 'Sum of highlighted?' }, cells: nums.map((v, i) => ({ value: v, hl: hl.includes(i) })), cols: 3, options: mkOptions(answer), answer };
}

export default function BossRound({ config, language, colors, onComplete }: Props) {
  const ru = language === 'ru';
  const [stage, setStage] = useState<'intro' | 'task' | 'done'>('intro');
  const [task] = useState<BossTask>(() => makeTask(config.type));
  const [picked, setPicked] = useState<number | null>(null);     // choose: выбранный вариант; tapcell: индекс клетки
  const [won, setWon] = useState(false);
  const [timeLeft, setTimeLeft] = useState(config.durationSec ?? 15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const introRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    introRef.current = setTimeout(() => setStage('task'), 1800);
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

  const pickOption = (v: number) => { if (picked !== null) return; setPicked(v); finish(v === task.answer); };
  const pickCell = (idx: number) => { if (picked !== null) return; setPicked(idx); finish(!!task.badCells?.includes(idx)); };

  if (stage === 'intro') {
    return (
      <View style={[styles.full, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={styles.bossEmoji}>⚔️</Text>
          <Text style={[styles.bossTitle, { color: colors.text }]}>{ru ? 'БОСС' : 'BOSS'}</Text>
          <Text style={[styles.bossHint, { color: colors.textSecondary }]}>{ru ? task.intro.ru : task.intro.en}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.full, { backgroundColor: colors.background }]}>
      <View style={styles.hud}>
        <Text style={[styles.hudText, { color: '#f59e0b' }]}>⚔️ {ru ? task.hud.ru : task.hud.en}</Text>
        <Text style={[styles.hudText, { color: timeLeft <= 5 ? '#ef4444' : colors.textSecondary }]}>⏱ {timeLeft}</Text>
      </View>

      {/* choose: визуальная сетка-подсказка сверху */}
      {task.kind === 'choose' && task.cells && (
        <View style={[styles.numGrid, { maxWidth: (task.cols ?? 3) * 64 + 40 }]}>
          {task.cells.map((c, i) => (
            <View key={i} style={[styles.numCell, {
              backgroundColor: c.hl ? '#fde68a' : colors.surface,
              borderColor: c.hl ? '#f59e0b' : colors.border, borderWidth: c.hl ? 3 : 1,
            }]}>
              <Text style={[styles.numText, { color: c.hl ? '#92600a' : colors.text }]}>{c.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* tapcell: тапни клетку-нарушитель */}
      {task.kind === 'tapcell' && task.grid && (
        <View style={[styles.numGrid, { maxWidth: (task.gridCols ?? 4) * 64 + 40 }]}>
          {task.grid.map((v, i) => {
            const isP = picked === i;
            const correct = stage === 'done' && task.badCells?.includes(i);
            const wrong = stage === 'done' && isP && !task.badCells?.includes(i);
            return (
              <TouchableOpacity key={i} disabled={picked !== null} activeOpacity={0.85} onPress={() => pickCell(i)}
                style={[styles.numCell, {
                  backgroundColor: correct ? '#22c55e' : wrong ? '#ef4444' : colors.surface,
                  borderColor: colors.border, borderWidth: 1,
                }]}>
                <Text style={[styles.numText, { color: correct || wrong ? '#fff' : colors.text }]}>{v}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* choose: кнопки-варианты */}
      {task.kind === 'choose' && task.options && (
        <View style={styles.opts}>
          {task.options.map((o, i) => {
            const isP = picked === o;
            const correct = stage === 'done' && o === task.answer;
            const wrong = stage === 'done' && isP && o !== task.answer;
            return (
              <TouchableOpacity key={i} disabled={picked !== null} activeOpacity={0.85} onPress={() => pickOption(o)}
                style={[styles.optBtn, { backgroundColor: correct ? '#22c55e' : wrong ? '#ef4444' : config.gradient[0] }]}>
                <Text style={styles.optText}>{o}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 28, alignSelf: 'center' },
  numCell: { width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  numText: { fontSize: 26, fontWeight: '800' },
  opts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  optBtn: { minWidth: 70, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center' },
  optText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  banner: { position: 'absolute', top: '42%', alignSelf: 'center', backgroundColor: 'rgba(245,158,11,0.97)', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16 },
  bannerText: { color: '#3f2b00', fontSize: 19, fontWeight: '900', textAlign: 'center' },
});
