/* psygames-game-puzzles · VER 1 · 10.09.2026 */
/**
 * «ЧЁТ-НЕЧЕТ» — первая головоломка на мосте к движкам Саймона Тэтхэма.
 *
 * Правило: в каждой строке и каждом столбце поровну нулей и единиц, и трёх одинаковых
 * подряд не бывает. Клетка перебирается нажатием: пусто → 0 → 1 → пусто.
 *
 * 🔴 ЧТО ЗДЕСЬ ЧЬЁ. Доску генерирует ЕГО движок (`unruly.c`) — там гарантия единственного
 * решения и лестница из семи ступеней, от 8×8 Trivial до 14×14 Normal; это и есть дорогая
 * часть, ради которой мост строился. Правило проверки — наше (`tatham-bridge/unruly.ts`),
 * оно в две строки и ходить за ним в wasm на каждое нажатие было бы лишней ценой.
 *
 * 📌 Ступень автора — ОСЬ нашей лестницы (решение Дениса 10.09.2026): уровень 1..7 выбирает
 * его пресет, дальше лестница растёт размером поля и плотностью подсказок.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { useRouter } from 'expo-router';
import GameShell from '@/src/components/GameShell';
import { HELP_OPEN_EVENT } from '@/src/components/GameHelpOverlay';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { движки, доска, type Движок } from '@/src/games/tatham-bridge';
import { изТекста, нарушения, решено, type Клетка } from '@/src/games/tatham-bridge/unruly';

const ИМЯ_ДВИЖКА = 'Unruly';

export default function PuzzlesScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const lvl = usePersistentLevel('puzzles_unruly');

  const [движок, setДвижок] = useState<Движок | null>(null);
  const [поле, setПоле] = useState<Клетка[][]>([]);
  const [начальное, setНачальное] = useState<Клетка[][]>([]);
  const [зерно, setЗерно] = useState(() => Math.floor(Math.random() * 1e6));
  const [ходов, setХодов] = useState(0);

  /** Ступень автора по нашему уровню: уровень 1 → ступень 0, дальше по порядку. */
  const ступень = движок ? Math.min(Math.max(lvl.level - 1, 0), движок.ступени.length - 1) : 0;

  const раздать = useCallback(async (д: Движок, ст: number, з: number) => {
    const строки = await доска(д.индекс, д.ступени[ст]?.параметры ?? '', з);
    const сетка = изТекста(строки);
    setНачальное(сетка.map((r) => [...r]));
    setПоле(сетка.map((r) => [...r]));
    setХодов(0);
  }, []);

  useEffect(() => {
    let живо = true;
    (async () => {
      const все = await движки();
      const д = все.find((x) => x.имя === ИМЯ_ДВИЖКА);
      if (!живо || !д) return;
      setДвижок(д);
      await раздать(д, Math.min(Math.max(lvl.level - 1, 0), д.ступени.length - 1), зерно);
    })();
    return () => { живо = false; };
    // раздаём один раз на монтирование; смену уровня и новую партию ведут кнопки
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const новая = useCallback(() => {
    if (!движок) return;
    const з = Math.floor(Math.random() * 1e6);
    setЗерно(з);
    void раздать(движок, ступень, з);
  }, [движок, ступень, раздать]);

  const жать = useCallback((y: number, x: number) => {
    // клетки-подсказки движка не трогаем: они часть условия
    if (начальное[y]?.[x] !== null) return;
    setПоле((п) => {
      const н = п.map((r) => [...r]);
      н[y][x] = н[y][x] === null ? 0 : н[y][x] === 0 ? 1 : null;
      return н;
    });
    setХодов((n) => n + 1);
  }, [начальное]);

  const беды = поле.length ? нарушения(поле) : { строки: [], столбцы: [] };
  const победа = поле.length > 0 && решено(поле);
  const w = поле[0]?.length ?? 0;
  const сторона = w ? Math.min(38, Math.floor(300 / w)) : 32;

  return (
    <GameShell
      title={t('puzzlesUnruly')}
      onBack={() => router.back()}
      confirmExit={ходов > 0 && !победа}
      pauseActions={[
        { id: 'resume', label: t('exitConfirmStay'), icon: 'play', primary: true },
        { id: 'restart', label: t('restart'), icon: 'refresh', onPress: новая },
        { id: 'rules', label: t('btn_rules'), icon: 'help-circle-outline', onPress: () => DeviceEventEmitter.emit(HELP_OPEN_EVENT) },
        { id: 'home', label: t('goHome'), icon: 'home', leave: true },
      ]}
      hud={[
        { key: 'level', icon: 'trending-up-outline', label: t('hud_step'), value: `${lvl.level}/${движок?.ступени.length ?? 7}` },
        { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: ходов, pop: true },
      ]}
    >
      {!поле.length ? (
        <View style={styles.centre}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <View style={styles.centre}>
          <Text style={[styles.rule, { color: colors.textSecondary }]}>{t('puzzlesUnrulyRule')}</Text>
          <View>
            {поле.map((ряд, y) => (
              <View key={y} style={styles.row}>
                {ряд.map((c, x) => {
                  const дано = начальное[y][x] !== null;
                  const плохо = беды.строки.includes(y) || беды.столбцы.includes(x);
                  return (
                    <Pressable
                      key={x}
                      accessibilityRole="button"
                      accessibilityLabel={`${y + 1}·${x + 1}`}
                      onPress={() => жать(y, x)}
                      style={[styles.cell, {
                        width: сторона, height: сторона,
                        borderColor: плохо ? '#E24B4A' : colors.border,
                        backgroundColor: c === null ? colors.surface : c === 0 ? colors.background : colors.primary,
                      }]}
                    >
                      <Text style={[styles.mark, { color: c === 1 ? '#fff' : colors.text, opacity: дано ? 1 : 0.75 }]}>
                        {c === null ? '' : c === 0 ? '○' : '●'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {победа ? <Text style={[styles.won, { color: colors.primary }]}>{t('levelDone').replace('{n}', String(lvl.level))}</Text> : null}
        </View>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  rule: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  row: { flexDirection: 'row' },
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: 6 },
  mark: { fontSize: 15, fontWeight: '700' },
  won: { fontSize: 17, fontWeight: '700' },
});
