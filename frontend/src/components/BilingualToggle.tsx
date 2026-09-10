/* psygames-bilingual-toggle · VER 1 · 10.09.2026 */
/**
 * 🔴 ПЕРЕКЛЮЧАТЕЛЬ «ДВА ЯЗЫКА СРАЗУ» — ОДИН НА ВСЕ УПРАЖНЕНИЯ.
 *
 * Компонент общий, а не четыре копии: в этом проекте копии расходятся при
 * первой же правке — так уже было с высотой полки, правилом уровня и карточкой
 * зарядки. Здесь расхождение было бы особенно дорогим: подпись объясняет, ЧТО
 * именно включается, и разные формулировки на четырёх экранах читались бы как
 * четыре разных режима.
 *
 * ⚠️ ПОДПИСЬ НЕ НАЗЫВАЕТ ЯЗЫКИ ТЕКСТОМ СЛОВАРЯ. Пара считается от интерфейса
 * (`параЯзыков`), и на английской локали она другая — написать «английский и
 * испанский» значило бы соврать половине пользователей.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { hasVocab } from '@/src/constants/translationVocab';
import { WORD_LANG_LABEL } from '@/src/services/wordLanguage';
import { textOn } from '@/src/services/onGradientText';

export function BilingualToggle({ включён, переключить, accent, первый, второй, выбратьВторой }: {
  включён: boolean;
  переключить: () => void;
  /** Цвет упражнения — чтобы включённый режим читался тем же акцентом, что и остальной экран. */
  accent: string;
  /** Первый язык — тот, что выбран в пикере экрана. */
  первый: string;
  /** Второй язык пары. */
  второй: string;
  выбратьВторой: (код: string) => void;
}) {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as { t: (k: string) => string; language: string };
  const подпись = t('bilingualModeDesc')
    .replace('{a}', WORD_LANG_LABEL[первый] ?? первый)
    .replace('{b}', WORD_LANG_LABEL[второй] ?? второй);
  /**
   * 🔴 ВТОРОЙ ЯЗЫК ВЫБИРАЕТСЯ, А НЕ НАВЯЗЫВАЕТСЯ.
   *
   * 📍 ОТЧЁТ ТЕСТИРОВЩИКА `2aa5892c` на v2.53.0: «Как выбрать второй язык-то для
   * двух языков сразу». Справедливо: первая редакция считала пару от ЯЗЫКА
   * ИНТЕРФЕЙСА и молча отменяла выбор в пикере — человек ставил немецкий,
   * включал режим и получал английский с испанским.
   *
   * ⚠️ Свой язык и первый язык из списка убраны: цель, совпавшая с ними, дала бы
   * «переведи русский на русский», а пара из одного языка — не пара.
   */
  const выбор = LANGUAGES
    .filter((l) => l.code !== language && l.code !== первый && hasVocab(l.code))
    .slice(0, 6);

  return (
    <View style={[стили.карточка, { backgroundColor: colors.surface }]}>
      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{ checked: включён }}
        accessibilityLabel={t('bilingualMode')}
        testID="bilingual-toggle"
        onPress={переключить}
        style={[
          стили.кнопка,
          включён
            ? { backgroundColor: accent }
            : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        ]}
      >
        <Text style={[стили.кнопкаТекст, { color: включён ? textOn(accent) : colors.text }]}>
          {включён ? '✓ ' : ''}{t('bilingualMode')}
        </Text>
      </TouchableOpacity>
      <Text style={[стили.подпись, { color: colors.textSecondary }]}>{подпись}</Text>
      {включён && (
        <View style={стили.ряд}>
          {выбор.map((l) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: второй === l.code }}
              key={l.code}
              onPress={() => выбратьВторой(l.code)}
              style={[
                стили.язык,
                второй === l.code
                  ? { backgroundColor: accent }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text style={[стили.языкТекст, { color: второй === l.code ? textOn(accent) : colors.text }]}>
                {l.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const стили = StyleSheet.create({
  карточка: { borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  // 44 — норма цели нажатия: переключатель жмут пальцем.
  кнопка: { minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  кнопкаТекст: { fontSize: 15, fontWeight: '700' },
  подпись: { fontSize: 13, lineHeight: 18 },
  ряд: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 44 — норма цели нажатия: выбор языка жмут пальцем.
  язык: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  языкТекст: { fontSize: 14, fontWeight: '600' },
});

export default BilingualToggle;
