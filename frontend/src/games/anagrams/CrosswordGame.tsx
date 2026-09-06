/* psygames-anagrams-crossword-screen · VER 1 · 06.09.2026 */
/**
 * 🔴 «КРОССВОРД»: НАЙДЕННОЕ СЛОВО ОСТАЁТСЯ НА ПОЛЕ И ПОДСКАЗЫВАЕТ СОСЕДНЕЕ.
 *
 * Просьба Дениса 06.09.2026 по «Магии Слов»: «тоже крутой режим кроссворда надо
 * добавить». Устройство укладки, правила и замеры — `core/crossword.ts`.
 *
 * ⚠️ ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ «НАЙДИ ВСЕ СЛОВА», а то по описанию похоже. Там
 * найденное слово вычёркивается из списка и дальше ни на что не влияет; здесь
 * каждая его буква ВСТАЁТ В КЛЕТКУ и работает на пересекающие слова. Поэтому
 * порядок находок имеет значение, а тупик размыкается не перебором, а чтением
 * наполовину открытого слова.
 *
 * ⚠️ ПУСТАЯ КЛЕТКА — УСЛОВИЕ ЗАДАЧИ. Она показывает и длину слова, и где оно
 * пересекается с другими: это единственное, что у человека есть до первой
 * находки.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LetterWheel } from '@/src/components/letterWheel/LetterWheel';
import { минимальныйРазмерКруга } from '@/src/components/letterWheel/geometry';
import { allWordsLetters, type AllWordsPack } from './core/allWords';
import {
  собратьКроссворд, словаУровня, кроссвордСобран, кроссвордНачат,
  подсказкаКроссворда, ГОРИЗ, type Кроссворд,
} from './core/crossword';

export interface CrosswordProps {
  pack: AllWordsPack;
  /** Уровень: он же зерно укладки — сетка уровня N всегда одна и та же. */
  level: number;
  seed: number;
  size: number;
  theme: { surface: string; text: string; textSecondary: string; border: string; primary: string; success: string; danger: string };
  now: () => number;
  onComplete: (подсказок: number, мс: number) => void;
  onProgress?: (начат: boolean) => void;
  labels: { найдено: string; подсказки: string; банк: string; сдать: string; сброс: string; подсказка: string };
}

/** Клетки, открытые найденными словами и подсказками. Ключ — `r * cols + c`. */
function открытыеКлетки(к: Кроссворд, найдены: readonly string[], открыто: Record<string, number>): Set<number> {
  const из = new Set<number>();
  const н = new Set(найдены.map((s) => s.toUpperCase()));
  for (const w of к.слова) {
    const целиком = н.has(w.слово);
    const сколько = целиком ? w.слово.length : (открыто[w.слово] ?? 0);
    const dr = w.d === ГОРИЗ ? 0 : 1;
    const dc = w.d === ГОРИЗ ? 1 : 0;
    for (let i = 0; i < сколько; i += 1) из.add((w.r + dr * i) * к.cols + (w.c + dc * i));
  }
  return из;
}

export function CrosswordGame({ pack, level, seed, size, theme, now, onComplete, onProgress, labels }: CrosswordProps) {
  const [найдены, setНайдены] = React.useState<string[]>([]);
  const [линия, setЛиния] = React.useState<number[]>([]);
  const [подсказок, setПодсказок] = React.useState(0);
  const [открыто, setОткрыто] = React.useState<Record<string, number>>({});
  const [мигание, setМигание] = React.useState<'нет' | 'верно' | 'повтор' | 'мимо'>('нет');

  /**
   * ⚠️ ЗЕРНО УКЛАДКИ — УРОВЕНЬ, А НЕ `seed` РАСКЛАДКИ БУКВ. Круг перемешивается
   * от захода к заходу, а сетка обязана быть одна и та же: иначе «переиграть
   * уровень» означало бы другую задачу, и сравнивать заходы стало бы нечем.
   */
  const кр = React.useMemo(() => собратьКроссворд(словаУровня(pack, level), level, 12, 12), [pack, level]);
  const буквы = React.useMemo(() => allWordsLetters(pack, seed), [pack, seed]);
  const кругРазмер = Math.max(минимальныйРазмерКруга(буквы.length), Math.min(size, 280));
  const готово = кроссвордСобран(кр, найдены);

  const начало = React.useRef(0);
  const подсказокRef = React.useRef(0);
  React.useEffect(() => { подсказокRef.current = подсказок; }, [подсказок]);
  const готовоRef = React.useRef(false);
  React.useEffect(() => { готовоRef.current = готово; }, [готово]);

  React.useEffect(() => {
    const начат = кроссвордНачат(найдены);
    if (начат && начало.current === 0) начало.current = now();
    onProgress?.(начат);
  }, [найдены, onProgress, now]);

  const цели = React.useMemo(() => new Set(кр.слова.map((w) => w.слово)), [кр]);

  const сдать = React.useCallback((слово: string) => {
    const s = слово.toUpperCase();
    if (готовоRef.current || s.length < 3) { setЛиния([]); return; }
    setЛиния([]);
    setНайдены((текущие) => {
      const уже = текущие.some((x) => x.toUpperCase() === s);
      const исход = уже ? 'повтор' : цели.has(s) ? 'верно' : 'мимо';
      setМигание(исход);
      setTimeout(() => setМигание('нет'), 340);
      if (исход !== 'верно') return текущие;
      const дальше = [...текущие, s];
      if (кроссвордСобран(кр, дальше)) {
        const мс = начало.current ? now() - начало.current : 0;
        setTimeout(() => onComplete(подсказокRef.current, мс), 420);
      }
      return дальше;
    });
  }, [кр, цели, onComplete, now]);

  /**
   * ПОДСКАЗКА ОТКРЫВАЕТ ОДНУ БУКВУ САМОГО КОРОТКОГО НЕНАЙДЕННОГО СЛОВА — и в
   * кроссворде она честнее, чем в списке: буква встаёт на поле и работает на
   * пересекающее слово тоже. Поэтому одной хватает, чтобы сдвинуться.
   */
  const взятьПодсказку = React.useCallback(() => {
    const h = подсказкаКроссворда(кр, найдены, открыто);
    if (!h) return;   // открывать нечего — подсказку не списываем
    setОткрыто((было) => ({ ...было, [h.слово]: h.открыто }));
    setПодсказок((n) => n + 1);
  }, [кр, найдены, открыто]);

  const видно = открытыеКлетки(кр, найдены, открыто);
  const набрано = линия.map((i) => (буквы[i] ?? '').toUpperCase()).join('');
  const цветНабора = мигание === 'мимо' ? theme.danger
    : мигание === 'верно' ? theme.success
      : мигание === 'повтор' ? theme.textSecondary : theme.text;

  /**
   * 🔴 КЛЕТКА СЧИТАЕТСЯ ОТ ЧИСЛА СТОЛБЦОВ, А НЕ ЗАШИТА ЧИСЛОМ. Пол в 18 точек —
   * не вкус: ниже него буква перестаёт читаться, а палец перестаёт попадать.
   * Сетка на первых уровнях не шире 12 клеток (это стережёт проба), значит на
   * телефоне 360 клетка выходит около 26.
   */
  const клетка = Math.max(18, Math.min(34, Math.floor((size - 12) / Math.max(1, кр.cols)) - 2));

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <ScrollView
        style={{ maxHeight: Math.round(size * 0.95), alignSelf: 'stretch' }}
        contentContainerStyle={{ alignItems: 'center', paddingVertical: 2 }}
        showsVerticalScrollIndicator
      >
        <View accessible accessibilityLabel={`${кр.rows}×${кр.cols}`}>
          {Array.from({ length: кр.rows }, (_, r) => (
            <View key={r} style={стили.ряд}>
              {Array.from({ length: кр.cols }, (_, c) => {
                const k = r * кр.cols + c;
                const ch = кр.буквы.get(k);
                if (ch === undefined) {
                  // Пустое место сетки: держим ширину, но ничего не рисуем.
                  return <View key={c} style={{ width: клетка, height: клетка }} />;
                }
                const открытая = видно.has(k);
                return (
                  <View key={c} style={[стили.клетка, {
                    width: клетка, height: клетка,
                    backgroundColor: открытая ? theme.primary : theme.surface,
                    borderColor: открытая ? theme.primary : theme.border,
                  }]}>
                    <Text style={[стили.буква, {
                      fontSize: клетка * 0.6,
                      color: открытая ? '#fff' : 'transparent',
                    }]}>{ch}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={[стили.набор, { color: цветНабора }]}>{набрано || '·'}</Text>

      <LetterWheel
        letters={буквы.map((б) => б.toUpperCase())}
        size={кругРазмер}
        trace={линия}
        onTrace={(next) => setЛиния([...next])}
        onSubmit={(слово) => сдать(слово)}
        colors={{ surface: theme.surface, text: theme.text, primary: theme.primary, border: theme.border }}
        label={labels.банк}
        disabled={готово}
      />

      {/* Кнопка сдачи нужна тем, кто играет тапом: ведение пальцем сдаёт по отпусканию. */}
      <View style={стили.действия}>
        <Pressable
          accessibilityRole="button" accessibilityLabel={labels.сброс}
          accessibilityState={{ disabled: линия.length === 0 }}
          disabled={линия.length === 0} onPress={() => setЛиния([])}
          style={[стили.кнопка, { backgroundColor: theme.surface, borderColor: theme.border, opacity: линия.length ? 1 : 0.4 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: theme.text }]}>{labels.сброс}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button" accessibilityLabel={labels.подсказка}
          accessibilityState={{ disabled: готово }}
          disabled={готово} onPress={взятьПодсказку}
          style={[стили.кнопка, { backgroundColor: theme.surface, borderColor: theme.primary, opacity: готово ? 0.4 : 1 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: theme.primary }]}>{labels.подсказка}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button" accessibilityLabel={labels.сдать}
          accessibilityState={{ disabled: линия.length < 3 }}
          disabled={линия.length < 3} onPress={() => сдать(набрано)}
          style={[стили.кнопка, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: линия.length >= 3 ? 1 : 0.4 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: '#fff' }]}>{labels.сдать}</Text>
        </Pressable>
      </View>

      <Text style={[стили.счёт, { color: theme.textSecondary }]}>
        {labels.найдено} {найдены.length}/{кр.слова.length}{подсказок ? ` · ${labels.подсказки} ${подсказок}` : ''}
      </Text>
    </View>
  );
}

const стили = StyleSheet.create({
  ряд: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  клетка: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 4 },
  буква: { fontWeight: '800' },
  набор: { fontSize: 22, fontWeight: '800', letterSpacing: 3, minHeight: 28 },
  счёт: { fontSize: 13 },
  действия: { flexDirection: 'row', gap: 10 },
  // 44 — норма цели нажатия.
  кнопка: { minHeight: 44, minWidth: 110, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  кнопкаТекст: { fontSize: 15, fontWeight: '700' },
});

export default CrosswordGame;
