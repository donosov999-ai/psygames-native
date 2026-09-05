/* psygames-anagrams-word-square · VER 1 · 06.09.2026 */
/**
 * 🔴 «СЛОВО-КВАДРАТ»: ЧЕТЫРЕ СЛОВА ПО ПЕРИМЕТРУ ИЗ ОДНОГО БАНКА БУКВ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026 со скриншотами Wordathlon. Устройство и его
 * разбор — в `core/ring.ts`, там же пробы формы. Здесь только экран.
 *
 * Ввод — тот же, что он просил для анаграмм: палец ведёт линию по буквам банка,
 * слово собирается по пути. Правило шага берётся из общего ядра круга
 * (`letterWheel/geometry`), поэтому ведение в квадрате и в круге не могут
 * разойтись.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { минимальныйРазмерКруга } from '@/src/components/letterWheel/geometry';
import { LetterWheel } from '@/src/components/letterWheel/LetterWheel';
import {
  СТОРОНА, клеткиСтороны, периметр, сторонаСлова, квадратНачат,
  type Кольцо, type Сторона,
} from './core/ring';

export interface WordSquareProps {
  кольцо: Кольцо;
  size: number;
  theme: { surface: string; text: string; textSecondary: string; border: string; primary: string; success: string; danger: string };
  /**
   * ⚠️ ЧАСЫ ПРИХОДЯТ СНАРУЖИ (`gameNow`), а не берутся из `Date.now`: пауза
   * должна останавливать и их. Своё время модуль мерить не вправе — иначе
   * пауза замораживает экран, а секундомер продолжает идти.
   */
  now: () => number;
  /** Все стороны закрыты: промахи и время сборки. */
  onComplete: (промахов: number, мс: number) => void;
  /** Первое касание — «есть что терять» для подтверждения выхода. */
  onProgress?: (тронули: boolean) => void;
  labels: { собрано: string; промахи: string; банк: string };
}

/** Рамка сетки; клетка выводится из неё, а не наоборот — иначе пятая клетка уезжает на новую строку. */
export const РАМКА = 2;
export function размерКлетки(size: number): number {
  return Math.max(1, Math.floor((size - РАМКА * 2) / СТОРОНА));
}

export function WordSquareGame({ кольцо, size, theme, now, onComplete, onProgress, labels }: WordSquareProps) {
  const [закрыты, setЗакрыты] = React.useState<Сторона[]>([]);
  const [линия, setЛиния] = React.useState<number[]>([]);
  const [промахов, setПромахов] = React.useState(0);
  const [мигание, setМигание] = React.useState<'нет' | 'верно' | 'мимо'>('нет');
  /** Время сборки: пошло с первой плитки, а не с открытия экрана. */
  const начало = React.useRef(0);
  /** Промахи читает отложенный вызов итога — состояние к тому мигу уже уедет. */
  const промаховRef = React.useRef(0);
  React.useEffect(() => { промаховRef.current = промахов; }, [промахов]);
  /**
   * ⚠️ ЗАВЕРШЕНИЕ ВЫВОДИТСЯ ИЗ СОСТОЯНИЯ, А НЕ ХРАНИТСЯ РЕФОМ. Реф, прочитанный
   * в теле рендера, при повторном прогоне уезжает вперёд — и кнопки остались бы
   * живыми после конца партии.
   */
  const завершено = закрыты.length === 4;
  const завершеноRef = React.useRef(false);
  React.useEffect(() => { завершеноRef.current = завершено; }, [завершено]);

  /**
   * ⚠️ СБРОСА ПРИ СМЕНЕ КОЛЬЦА ЗДЕСЬ НЕТ — И ЭТО НАРОЧНО. Эффект, синхронно
   * зовущий четыре `setState`, гонит каскад перерисовок. Новое кольцо — это
   * НОВАЯ партия, поэтому родитель передаёт `key` с ключом кольца.
   */

  const клетка = размерКлетки(size);
  const поле = периметр(кольцо, закрыты);

  /** Круг банка растёт вместе с числом плиток: иначе палец в них не попадает. */
  const кругРазмер = Math.max(минимальныйРазмерКруга(кольцо.банк.length), Math.min(size, 300));

  /** «Есть что терять» решает предикат ядра — его же гоняет гейт обёрток. */
  React.useEffect(() => {
    const начат = квадратНачат(линия, закрыты);
    if (начат && начало.current === 0) начало.current = now();
    onProgress?.(начат);
  }, [линия, закрыты, onProgress, now]);

  const сдать = React.useCallback((слово: string) => {
    if (завершеноRef.current) return;
    setЛиния([]);
    setЗакрыты((текущие) => {
      const сторона = сторонаСлова(кольцо, слово, текущие);
      if (!сторона) {
        if (слово.length >= 2) { setПромахов((n) => n + 1); setМигание('мимо'); setTimeout(() => setМигание('нет'), 320); }
        return текущие;
      }
      const дальше = [...текущие, сторона];
      setМигание('верно');
      setTimeout(() => setМигание('нет'), 320);
      if (дальше.length === 4) {
        const мс = начало.current ? now() - начало.current : 0;
        setTimeout(() => onComplete(промаховRef.current, мс), 420);
      }
      return дальше;
    });
  }, [кольцо, onComplete, now]);

  const набрано = линия.map((i) => кольцо.банк[i] ?? '').join('');
  const сторонаКлетки = (и: number): Сторона | null => {
    for (const с of ['верх', 'право', 'низ', 'лево'] as const) if (клеткиСтороны(с).indexOf(и) >= 0) return с;
    return null;
  };

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View
        accessibilityLabel={`${labels.собрано} ${закрыты.length}/4`}
        style={[стили.доска, {
          width: клетка * СТОРОНА + РАМКА * 2, height: клетка * СТОРОНА + РАМКА * 2,
          borderColor: theme.border, backgroundColor: theme.surface,
        }]}
      >
        {Array.from({ length: СТОРОНА * СТОРОНА }).map((_, и) => {
          const r = Math.floor(и / СТОРОНА), c = и % СТОРОНА;
          const сторона = сторонаКлетки(и);
          const закрыта = !!сторона && закрыты.indexOf(сторона) >= 0;
          const общая = { position: 'absolute' as const, left: РАМКА + c * клетка, top: РАМКА + r * клетка, width: клетка, height: клетка };
          if (!сторона) {
            /* Центр 3×3 пуст: банк не влезает в девять клеток (замер — в `core/ring`). */
            return <View key={и} style={[стили.клетка, общая, { backgroundColor: 'transparent', borderColor: 'transparent' }]} />;
          }
          return (
            <View key={и} accessible accessibilityLabel={поле[и] || undefined}
              style={[стили.клетка, общая, {
                backgroundColor: закрыта ? theme.primary : theme.surface,
                borderColor: закрыта ? theme.primary : theme.border,
              }]}>
              <Text style={[стили.буква, { fontSize: клетка * 0.42, color: закрыта ? '#fff' : theme.textSecondary }]}>{поле[и]}</Text>
            </View>
          );
        })}
      </View>

      <Text style={[стили.набор, { color: мигание === 'мимо' ? theme.danger : мигание === 'верно' ? theme.success : theme.text }]}>
        {набрано || '·'}
      </Text>

      <LetterWheel
        letters={кольцо.банк}
        size={кругРазмер}
        trace={линия}
        /**
         * 🔴 СДАЧА НА ПЯТОЙ БУКВЕ, А НЕ ТОЛЬКО ПО ОТПУСКАНИЮ ПАЛЬЦА.
         *
         * 📍 Найдено ИГРОЙ: при вводе ТАПОМ палец не отпускают вовсе, и слово
         * не сдавалось никогда — можно было набрать все пять букв и смотреть на
         * них до конца партии. Все четыре слова кольца ровно пятибуквенные,
         * поэтому длина и есть признак готовности; ведение пальцем при этом
         * сдаёт и короткое слово по отпусканию — тогда это промах.
         */
        onTrace={(next) => {
          setЛиния([...next]);
          if (next.length === СТОРОНА) сдать(next.map((i) => кольцо.банк[i] ?? '').join(''));
        }}
        onSubmit={(слово) => { if (слово.length !== СТОРОНА) сдать(слово); }}
        colors={{ surface: theme.surface, text: theme.text, primary: theme.primary, border: theme.border }}
        label={labels.банк}
        disabled={завершено}
      />

      <Text style={[стили.счёт, { color: theme.textSecondary }]}>
        {labels.собрано} {закрыты.length}/4 · {labels.промахи} {промахов}
      </Text>
    </View>
  );
}

const стили = StyleSheet.create({
  доска: { borderWidth: РАМКА, borderRadius: 10, position: 'relative' },
  клетка: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  буква: { fontWeight: '800' },
  строка: { alignItems: 'center', justifyContent: 'center' },
  набор: { fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  счёт: { fontSize: 13 },
});

export default WordSquareGame;
