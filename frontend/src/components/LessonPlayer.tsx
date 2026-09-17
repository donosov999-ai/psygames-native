/* psygames-lesson-player · VER 1 · 17.09.2026 */
/**
 * 🔴 РАЗБОР ПО ШАГАМ НА ВЕСЬ ЭКРАН — «КАК ИНТЕРАКТИВНЫЙ РОЛИК».
 *
 * 📍 Денис 17.09.2026, глядя на первую сборку пилота (карточка над доской): «я думал обучение
 * сделать в полноэкранном режиме, чтобы ближе было к ролику интерактивному». Поэтому плеер:
 * окно на весь экран, доска крупно, объяснение крупным шрифтом, полоса хода и три кнопки —
 * назад, пауза, вперёд. Открылся — шаги идут САМИ, как видео; любое ручное «назад/вперёд»
 * ставит на паузу, чтобы человек разглядывал столько, сколько ему нужно.
 *
 * ⚠️ ПЛЕЕР НЕ ЗНАЕТ ИГРЫ. Доску рисует экран (`renderBoard`), шаги и тексты считает экран,
 * плеер только показывает и ведёт время. Так пример раскатывается на другие игры без копии
 * плеера: каждой игре — свои шаги и своя доска, плеер один. Первый носитель — «Чёт-нечет»
 * (`app/games/puzzles.tsx`, приёмы в `tatham-bridge/unruly-teach.ts`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useScreenSize } from '@/src/hooks/useScreenWidth';

const ФИОЛЕТОВЫЙ = '#6C5CE7';

/**
 * Сколько держать шаг на экране при самостоятельном показе: время на чтение плюс секунда
 * на то, чтобы глаз нашёл рамки на доске. 15 знаков в секунду — спокойное чтение с экрана.
 */
export function длительностьШага(текст: string): number {
  return Math.min(9000, Math.max(2600, 1200 + (текст.length / 15) * 1000));
}

interface Props {
  visible: boolean;
  /** Номер текущей карточки с нуля и число шагов без итоговой. */
  индекс: number;
  шагов: number;
  текст: string;
  /** Сноска первой карточки: партия с разбором не засчитывается. */
  сноска?: string;
  /** Итоговая карточка: доска решена. */
  готово: boolean;
  /** Идёт ход по доске — кнопки ждут. */
  занят: boolean;
  /**
   * Сколько держать шаг при самостоятельном показе, мс. Экран знает, видел ли человек этот
   * приём раньше: первый показ — время на чтение (`длительностьШага`), повтор — коротко.
   */
  длительность?: number;
  renderBoard: (сторона: number) => React.ReactNode;
  onДальше: () => void;
  onНазад: () => void;
  onЗакрыть: () => void;
  onНовая?: () => void;
}

export default function LessonPlayer({
  visible, индекс, шагов, текст, сноска, готово, занят, длительность, renderBoard, onДальше, onНазад, onЗакрыть, onНовая,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { w, h } = useScreenSize();
  const [играет, setИграет] = useState(true);
  // Новое открытие плеера — снова «воспроизведение».
  const былоОткрыто = useRef(false);
  useEffect(() => {
    if (visible && !былоОткрыто.current) setИграет(true);
    былоОткрыто.current = visible;
  }, [visible]);

  /** Сам ведёт шаги, пока играет: показал — выждал — «дальше». */
  useEffect(() => {
    if (!visible || !играет || готово || занят) return;
    const таймер = setTimeout(onДальше, длительность ?? длительностьШага(текст));
    return () => clearTimeout(таймер);
  }, [visible, играет, готово, занят, индекс, текст, длительность, onДальше]);

  /**
   * Доска — самый крупный квадрат, который помещается между шапкой и низом: ширина экрана
   * минус поля и не больше 55 % высоты, чтобы под доской остался текст и кнопки.
   */
  const сторона = Math.max(200, Math.min(w - 32, (h - insets.top - insets.bottom) * 0.55));
  const доля = шагов > 0 ? Math.min(1, (готово ? шагов : индекс) / шагов) : 0;

  const вручную = (действие: () => void) => () => { setИграет(false); действие(); };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onЗакрыть} statusBarTranslucent>
      <View testID="lesson-player" style={[styles.окно, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.шапка}>
          <Text style={[styles.заголовок, { color: colors.text }]} numberOfLines={1}>{t('teachTitle')}</Text>
          <Text testID="lesson-player-count" style={[styles.счёт, { color: colors.textSecondary }]}>
            {готово ? '' : t('teachStepOf').replace('{i}', String(индекс + 1)).replace('{n}', String(шагов))}
          </Text>
          <Pressable
            testID="lesson-player-close" accessibilityRole="button" accessibilityLabel={t('close')}
            onPress={onЗакрыть} hitSlop={10} style={[styles.закрыть, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.полоса, { backgroundColor: colors.border }]}>
          <View style={[styles.полосаХод, { width: `${доля * 100}%` }]} />
        </View>

        <View style={styles.доска}>{renderBoard(сторона)}</View>

        <View style={styles.низ}>
          <View style={styles.слова}>
            <Text testID="lesson-player-text" style={[styles.текст, { color: colors.text }]}>{текст}</Text>
            {сноска ? <Text style={[styles.сноска, { color: colors.textSecondary }]}>{сноска}</Text> : null}
          </View>
          {готово ? (
            <View style={styles.ряд}>
              <Pressable
                testID="lesson-player-back" accessibilityRole="button" accessibilityLabel={t('back')}
                onPress={вручную(onНазад)} style={[styles.круг, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="play-back" size={24} color={colors.text} />
              </Pressable>
              {onНовая ? (
                <Pressable
                  testID="lesson-player-new" accessibilityRole="button"
                  onPress={onНовая} style={[styles.широкая, { backgroundColor: ФИОЛЕТОВЫЙ }]}
                >
                  <Ionicons name="refresh" size={20} color="#FFF" />
                  <Text style={styles.широкаяТекст}>{t('teachNewBoard')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.ряд}>
              <Pressable
                testID="lesson-player-back" accessibilityRole="button" accessibilityLabel={t('back')}
                accessibilityState={{ disabled: индекс === 0 || занят }} disabled={индекс === 0 || занят}
                onPress={вручную(onНазад)}
                style={[styles.круг, { backgroundColor: colors.surface, borderColor: colors.border, opacity: индекс === 0 ? 0.4 : 1 }]}
              >
                <Ionicons name="play-back" size={24} color={colors.text} />
              </Pressable>
              <Pressable
                testID="lesson-player-play" accessibilityRole="button"
                accessibilityLabel={играет ? t('teachPause') : t('teachPlay')}
                onPress={() => setИграет((v) => !v)}
                style={[styles.кругГлавный, { backgroundColor: ФИОЛЕТОВЫЙ }]}
              >
                <Ionicons name={играет ? 'pause' : 'play'} size={30} color="#FFF" />
              </Pressable>
              <Pressable
                testID="lesson-player-next" accessibilityRole="button" accessibilityLabel={t('puzzleNextStep')}
                accessibilityState={{ disabled: занят }} disabled={занят}
                onPress={вручную(onДальше)}
                style={[styles.круг, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {занят ? <ActivityIndicator color={colors.text} /> : <Ionicons name="play-forward" size={24} color={colors.text} />}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  окно: { flex: 1, paddingHorizontal: 16, gap: 12 },
  шапка: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  заголовок: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  счёт: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700' },
  // 44 — пол площади нажатия для служебной кнопки шапки (`tap-target-audit`, проход маршрутов).
  закрыть: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  полоса: { height: 4, borderRadius: 2, overflow: 'hidden' },
  полосаХод: { height: 4, borderRadius: 2, backgroundColor: ФИОЛЕТОВЫЙ },
  доска: { alignItems: 'center', justifyContent: 'center' },
  низ: { flex: 1, justifyContent: 'space-between', gap: 10 },
  слова: { gap: 8 },
  текст: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  сноска: { fontSize: 13, fontWeight: '600' },
  ряд: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  круг: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  кругГлавный: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  широкая: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingHorizontal: 22, borderRadius: 28 },
  широкаяТекст: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
