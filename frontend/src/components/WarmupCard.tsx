/* psygames-warmup-card · VER 1 · 06.09.2026 */
/**
 * 🔴 КАРТОЧКА ТЕМАТИЧЕСКОЙ ЗАРЯДКИ — ОДНА НА ВСЕ РАЗВИЛКИ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026: «надо зарядку по словам собрать на 5–10 минут;
 * надо по идее выбор сделать в зарядках по времени, чтобы понять, какую серию
 * запускают». Второе — про то, что человек ДО запуска должен видеть, из чего
 * состоит серия и сколько она займёт; отсюда строка плана под кнопками времени.
 *
 * Компонент общий, а не копия шахматного: две карточки разошлись бы при первой
 * же правке — в этом проекте так уже случалось с высотой полки и правилом
 * уровня.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { ДЛИТЕЛЬНОСТИ, собратьТемуЗарядки, темаШаги, type ТемаЗарядки, type WarmupMinutes } from '@/src/services/chessWarmup';

export interface WarmupCardProps {
  /** Упражнения темы по порядку чередования. */
  темы: readonly ТемаЗарядки[];
  titleKey: string;
  descKey: string;
  /** Подпись серии в статистике зарядок. */
  ярлык: string;
  accent: string;
  /** Уровни ещё читаются из хранилища — кнопка ждёт. */
  loading?: boolean;
}

export function WarmupCard({ темы, titleKey, descKey, ярлык, accent, loading }: WarmupCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { startPlaylist } = useWarmup();
  const [минут, setМинут] = React.useState<WarmupMinutes>(10);

  const шаги = темаШаги(темы, минут);
  const готово = !loading && шаги.length > 0;

  /**
   * 🔴 ЧТО ИМЕННО ЗАПУСКАЕТСЯ — ВИДНО ДО НАЖАТИЯ. Это и есть просьба «чтобы
   * понять, какую серию запускают»: не только сколько минут, но и из чего.
   */
  const состав = шаги.reduce<string[]>((acc, ш) => {
    const имя = t(`${ш.game_id}` as never) || ш.game_id;
    if (acc.indexOf(имя) < 0) acc.push(имя);
    return acc;
  }, []);

  return (
    <View style={[стили.карточка, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={стили.строка}>
        <Ionicons name="flash" size={20} color={accent} />
        <Text style={[стили.заголовок, { color: colors.text }]}>{t(titleKey)}</Text>
      </View>
      <Text style={[стили.подпись, { color: colors.textSecondary }]}>{t(descKey)}</Text>

      <View style={стили.кнопки}>
        {ДЛИТЕЛЬНОСТИ.map((м) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: минут === м }}
            accessibilityLabel={`${м} ${t('unitMin')}`}
            key={м}
            onPress={() => setМинут(м)}
            style={[стили.минута, минут === м
              ? { backgroundColor: accent }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          >
            <Text style={[стили.минутаТекст, { color: минут === м ? '#fff' : colors.text }]}>{м} {t('unitMin')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[стили.мелко, { color: colors.textSecondary }]}>
        {t('warmupPlanCount').replace('{n}', String(шаги.length))}{состав.length ? ` · ${состав.join(' · ')}` : ''}
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('start')}
        accessibilityState={{ disabled: !готово }}
        disabled={!готово}
        onPress={() => startPlaylist(собратьТемуЗарядки(темы, минут, ярлык))}
        style={[стили.старт, { backgroundColor: accent, opacity: готово ? 1 : 0.5 }]}
      >
        <Ionicons name="play" size={18} color="#fff" />
        <Text style={стили.стартТекст}>{t('start')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const стили = StyleSheet.create({
  карточка: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, marginBottom: 4 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  заголовок: { fontSize: 17, fontWeight: '700' },
  подпись: { fontSize: 13, lineHeight: 18 },
  кнопки: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  // 44 — норма цели нажатия: выбор длительности жмут пальцем.
  минута: { minHeight: 44, minWidth: 72, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  минутаТекст: { fontSize: 15, fontWeight: '700' },
  мелко: { fontSize: 12 },
  старт: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  стартТекст: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default WarmupCard;
