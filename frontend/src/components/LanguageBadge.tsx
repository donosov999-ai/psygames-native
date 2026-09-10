/* psygames-language-badge · VER 1 · 10.09.2026 */
/**
 * 🔴 НА КАКОМ ЯЗЫКЕ СЕЙЧАС СПРАШИВАЮТ — СЛОВОМ И РЯДОМ СО СТИМУЛОМ.
 *
 * 📍 ПРАВКА ДЕНИСА 10.09.2026: «подписи должны быть — раз переход в
 * мультиязычности, какой язык пишется; обозначение мелкое».
 *
 * ЧТО БЫЛО. Язык показывался только пилюлей в шапке двумя буквами. Шапка —
 * место для счётчиков, глаз на ней не задерживается, и на смене языка ничего
 * не происходило: слово менялось, а сигнала о переходе не было. Человек читает
 * это как «мне суётся один язык», и он прав: обещание «два языка» ничем на
 * экране не подтверждалось.
 *
 * ЧТО ЗДЕСЬ. Название языка ПОЛНОСТЬЮ, у самого стимула, и отдельная отметка
 * перехода: когда язык сменился относительно прошлого вопроса, подпись
 * подсвечивается акцентом и получает стрелку. Повтор языка идёт спокойным
 * серым — иначе подсветка перестанет что-либо значить.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/src/contexts/ThemeContext';
import { WORD_LANG_LABEL } from '@/src/services/wordLanguage';

export function LanguageBadge({ язык, сменился, accent }: {
  язык: string | undefined;
  /** Язык отличается от предыдущего вопроса — это и есть переход. */
  сменился: boolean;
  accent: string;
}) {
  const { colors } = useTheme();
  if (!язык) return null;
  const имя = WORD_LANG_LABEL[язык] ?? язык.toUpperCase();
  return (
    <View
      accessible
      accessibilityLabel={имя}
      testID="language-badge"
      style={[
        стили.плашка,
        сменился
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: 'transparent', borderColor: colors.border },
      ]}
    >
      <Text style={[стили.текст, { color: сменился ? '#fff' : colors.textSecondary }]}>
        {сменился ? `→ ${имя}` : имя}
      </Text>
    </View>
  );
}

const стили = StyleSheet.create({
  плашка: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, marginTop: 10 },
  /* 15 — не «мелкое»: подпись должна читаться, не приглядываясь. */
  текст: { fontSize: 15, fontWeight: '700' },
});

export default LanguageBadge;
