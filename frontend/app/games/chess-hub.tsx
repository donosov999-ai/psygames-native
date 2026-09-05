/* psygames-game-chess-hub · VER 2 · 06.09.2026 */
/**
 * Развилка «Шахматы» — просьба Дениса 05.09.2026, дословно: «надо все
 * упражнения по шахматам заказать в хаб шахматы».
 *
 * Повод конкретный: в тот день шахматных упражнений стало два, и они разъехались
 * по разным местам меню. «Доска в уме» лежала под «Зрительной памятью», «Детский
 * мат» — отдельной карточкой в «Памяти». Человек, который пришёл тренировать
 * шахматы, обязан был знать оба названия заранее.
 *
 * ⚠️ ЧТО У НИХ ОБЩЕЕ И ЧТО РАЗНОЕ. Общая — доска и обозначения полей: e4, конь,
 * ферзь. Навыки РАЗНЫЕ, и это не мелочь, а причина держать их двумя входами, а
 * не одним экраном с переключателем:
 *   · «Доска в уме» — позицию ДЕРЖАТ В ГОЛОВЕ и ходят медленно;
 *   · «Детский мат» — позиция НА ВИДУ, и всё решает скорость узнавания узора.
 * Слить их значило бы получить упражнение, у которого нет одной цифры роста.
 *
 * 🔴 VER 2: НАД ВЫБОРОМ ПОЯВИЛАСЬ ЗАРЯДКА ИЗ ОБОИХ. Отчёт Дениса 05.09.2026,
 * дословно: «Надо стерео типа зарядки собрать и с обоих этих штук и чтобы они
 * типа потекли по уровням и желательно чтобы можно было задавать время типа как
 * в режиме потока». Это НЕ противоречит абзацу выше: зарядка не сливает
 * упражнения в одно, а ставит их подряд — у каждого остаётся своя цифра роста и
 * своя лестница. Устройство и пробы — `services/chessWarmup.ts`.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HubScreen from '@/src/components/HubScreen';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { buildChessWarmup, chessWarmupSteps, type ChessWarmupMinutes } from '@/src/services/chessWarmup';

const ГРАДИЕНТ: [string, string] = ['#8e5b2f', '#2f2a24'];
const ДЛИТЕЛЬНОСТИ: ChessWarmupMinutes[] = [5, 10, 15];

/**
 * ⚠️ ИМЯ ЛАТИНИЦЕЙ, И ЭТО НЕ ПРИХОТЬ. Разбор React-правил считает компонентом
 * функцию, чьё имя начинается с ЗАГЛАВНОЙ ЛАТИНСКОЙ буквы; кириллическую «Ш»
 * он заглавной не признаёт и объявляет каждый хук нарушением. Тот же класс, что
 * у гейта, разбиравшего условия по `[A-Za-z]`.
 */
function ChessWarmupCard() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { startPlaylist } = useWarmup();
  /** Уровни берутся из СОБСТВЕННЫХ лестниц игр — «чтобы они потекли по уровням». */
  const мат = usePersistentLevel('scholars_mate');
  const доска = usePersistentLevel('chess_blind');
  const [минут, setМинут] = React.useState<ChessWarmupMinutes>(10);

  const шагов = chessWarmupSteps({ minutes: минут, blindLevel: доска.level, mateLevel: мат.level }).length;
  const готово = мат.loaded && доска.loaded;

  return (
    <View style={[стили.карточка, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={стили.строка}>
        <Ionicons name="flash" size={20} color={ГРАДИЕНТ[0]} />
        <Text style={[стили.заголовок, { color: colors.text }]}>{t('chessWarmupTitle')}</Text>
      </View>
      <Text style={[стили.подпись, { color: colors.textSecondary }]}>{t('chessWarmupDesc')}</Text>

      <View style={стили.кнопки}>
        {ДЛИТЕЛЬНОСТИ.map((м) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: минут === м }}
            key={м}
            onPress={() => setМинут(м)}
            style={[стили.минута, минут === м
              ? { backgroundColor: ГРАДИЕНТ[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          >
            <Text style={[стили.минутаТекст, { color: минут === м ? '#fff' : colors.text }]}>{м} {t('unitMin')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[стили.мелко, { color: colors.textSecondary }]}>
        {t('chessWarmupPlan')
          .replace('{n}', String(шагов))
          .replace('{mate}', String(мат.level))
          .replace('{blind}', String(доска.level))}
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !готово }}
        disabled={!готово}
        onPress={() => startPlaylist(buildChessWarmup({ minutes: минут, blindLevel: доска.level, mateLevel: мат.level }))}
        style={[стили.старт, { backgroundColor: ГРАДИЕНТ[0], opacity: готово ? 1 : 0.5 }]}
      >
        <Ionicons name="play" size={18} color="#fff" />
        <Text style={стили.стартТекст}>{t('start')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ChessHub() {
  return (
    <HubScreen
      hubRoute="/games/chess-hub"
      titleKey="chessGroup"
      descKey="chessGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="chessGroupFootnote"
      icon="grid"
      gradient={ГРАДИЕНТ}
      headerSlot={<ChessWarmupCard />}
    />
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
