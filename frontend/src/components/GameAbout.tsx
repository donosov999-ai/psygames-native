/**
 * GameAbout — «о игре» свёрнутой строкой, разворачивается по нажатию.
 *
 * ЗАЧЕМ. До игры было ДВА экрана подряд: сначала описание во весь экран, потом
 * настройки. Денис 12.08: «в два клика приложение запускается — надо логичнее».
 * И он прав по существу: описание нужно ОДИН раз, при первом знакомстве, а платят
 * за него все последующие запуски. Человек, который открывает судоку двадцатый раз,
 * двадцать раз пролистывает то, что прочитал в первый.
 *
 * Порядок обратный: сразу настройки, а описание — строкой сверху, которую можно
 * раскрыть. Кто читает, тот раскроет; кто пришёл играть, тот не платит за чтение.
 *
 * ⚠️ ЧТО ЗДЕСЬ НЕ ПОТЕРЯНО. Описание и польза не выброшены и не сокращены — это тот
 * же текст, который показывал полноэкранный экран. Разница только в том, что он
 * ждёт нажатия, а не занимает экран по умолчанию.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

export interface AboutBenefit {
  icon: string;
  textKey: string;
}

export interface GameAboutProps {
  /** Ключ подробного описания — тот же, что уходил в полноэкранное вступление. */
  descriptionKey: string;
  /** Что развивает игра. Пустой список допустим — блок просто не рисуется. */
  benefits?: AboutBenefit[];
  /** Цвет акцента игры (первый цвет её градиента). */
  accent: string;
  /** Раскрыть сразу — для первого знакомства с игрой. */
  defaultOpen?: boolean;
}

export default function GameAbout({ descriptionKey, benefits = [], accent, defaultOpen }: GameAboutProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(!!defaultOpen);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('title_about_game')}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        <Ionicons name="information-circle" size={20} color={accent} />
        <Text style={[styles.headText, { color: colors.text }]}>{t('title_about_game')}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>{t(descriptionKey)}</Text>
          {benefits.map((b) => (
            <View key={b.textKey} style={styles.benefit}>
              <Ionicons name={b.icon as any} size={16} color={accent} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{t(b.textKey)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12, overflow: 'hidden' },
  // Строка-заголовок — полноценная цель для пальца: её жмут, чтобы раскрыть.
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14 },
  headText: { flex: 1, fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  desc: { fontSize: 14, lineHeight: 20 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { flex: 1, fontSize: 13 },
});
