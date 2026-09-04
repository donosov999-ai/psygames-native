/* psygames-vocab-srs-typing-answer · VER 1 · 04.09.2026 */
/**
 * ПОЛЕ ПЕЧАТИ ОТВЕТА (задача 676a62cb).
 *
 * Слово-образец нарисовано посимвольно: набранное зелёное, текущая буква под
 * курсором, остальное приглушено. Опечатка НЕ ПУСКАЕТ дальше и на мгновение
 * красит букву красным — метод Шестова целиком в этом: пока не нажат верный
 * символ, курсор стоит.
 *
 * ⚠️ ПОЧЕМУ НЕ ОБЫЧНОЕ ПОЛЕ ВВОДА. `TextInput` разрешает вставку из буфера,
 * стирание середины и автозамену — то есть даёт обойти саму механику. Поле здесь
 * невидимое и служит только приёмником нажатий: значение ему выставляет ДВИЖОК,
 * а не человек. Вставленный текст движок не примет: он смотрит одно нажатие.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Platform, Pressable } from 'react-native';
import { createState, pressChar, backspace, MARK, type TypingState } from './core/typing';

export interface TypingAnswerProps {
  /** Слово, которое надо набрать. */
  word: string;
  /** Цвета темы. */
  colors: { text: string; textSecondary: string; surface: string; border: string };
  /** Слово набрано целиком и верно. */
  onDone: (typos: number) => void;
  /** Подсказка под полем. */
  hint?: string;
  /** Заблокировать ввод (идёт переход к следующей карточке). */
  disabled?: boolean;
}

export default function TypingAnswer({ word, colors, onDone, hint, disabled }: TypingAnswerProps) {
  const [, форсировать] = useState(0);
  const состояние = useRef<TypingState>(createState([word]));
  const ошибкаНа = useRef<number | null>(null);
  const полеRef = useRef<TextInput>(null);

  // Новое слово — новое состояние. Иначе курсор остался бы от прошлой карточки.
  useEffect(() => {
    состояние.current = createState([word]);
    ошибкаНа.current = null;
    форсировать((n) => n + 1);
    const t = setTimeout(() => полеRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [word]);

  const нажатие = useCallback((ключ: string) => {
    if (disabled) return;
    const ст = состояние.current;
    if (ключ === 'Backspace') { backspace(ст); ошибкаНа.current = null; форсировать((n) => n + 1); return; }
    if (ключ.length !== 1) return;                       // Shift, Tab, стрелки — не буквы
    const до = ст.errors;
    const итог = pressChar(ст, ключ, true);              // true = блокировка на ошибке, метод Шестова
    ошибкаНа.current = ст.errors > до ? ст.pos : null;
    форсировать((n) => n + 1);
    if (итог.finished) onDone(ст.errors);
  }, [disabled, onDone]);

  const буквы = useMemo(() => [...word], [word]);
  const ст = состояние.current;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ?? word}
      onPress={() => полеRef.current?.focus()}
      style={[styles.box, { backgroundColor: colors.surface, borderColor: ошибкаНа.current !== null ? '#f43f5e' : colors.border }]}
    >
      <View style={styles.row}>
        {буквы.map((б, i) => {
          const набрана = i < ст.pos && ст.marks[i] === MARK.CORRECT;
          const текущая = i === ст.pos;
          const ошибка = текущая && ошибкаНа.current !== null;
          return (
            <Text
              key={`${б}-${i}`}
              style={[
                styles.char,
                { color: набрана ? '#22c55e' : ошибка ? '#f43f5e' : текущая ? colors.text : colors.textSecondary },
                текущая && { borderBottomWidth: 3, borderBottomColor: ошибка ? '#f43f5e' : colors.text },
              ]}
            >
              {б === ' ' ? '␣' : б}
            </Text>
          );
        })}
      </View>
      {hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
      {/**
        * Приёмник нажатий. `value` держит ДВИЖОК: что бы ни попало в поле —
        * вставка, автозамена, — на экран это не влияет.
        */}
      <TextInput
        ref={полеRef}
        style={styles.hidden}
        value={word.slice(0, ст.pos)}
        onChangeText={() => { /* значение ставит движок, ввод сюда не идёт */ }}
        onKeyPress={(e) => нажатие(e.nativeEvent.key)}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        editable={!disabled}
        // На вебе поле нужно видимым для фокуса, но нулевого размера — иначе
        // браузер его не сфокусирует и нажатия не придут.
        {...(Platform.OS === 'web' ? { autoFocus: true } : {})}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 2, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  char: { fontSize: 30, fontWeight: '800', paddingHorizontal: 1, minWidth: 14, textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1, left: 0, top: 0 },
});
