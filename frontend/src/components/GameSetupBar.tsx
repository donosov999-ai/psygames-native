/**
 * GameSetupBar — прибитая книзу полоса экрана настройки: «Начать» и «Справка».
 *
 * 🔴 ЗАЧЕМ. Отчёт Дениса 02.09.2026 (set-game): «то бар нижний сделать, в него
 * забить кнопку начать и справку… чтобы он был плавающий снизу, как бы не мотать
 * экран вниз, чтобы запустить приложение каждый раз».
 *
 * На кадре видно, о чём речь: экран настройки — это карточка игры, «Об игре»,
 * карта уровней, примеры правил; кнопка «Начать» лежит НИЖЕ всего этого и в
 * окно не попадает. Значит каждый заход в игру начинается с прокрутки до низа —
 * действие, которое человек делает десятки раз в день и которое не несёт смысла.
 *
 * ⚠️ ЗАЧЕМ ОБЩИЙ КОМПОНЕНТ, А НЕ ПОЛОСА В КАЖДОЙ ИГРЕ. Экранов настройки
 * пятьдесят, и хвост у них разный: где-то «Начать» — последний элемент прокрутки,
 * где-то он внутри карточки уровня. Замер 02.09.2026 двумя разными признаками дал
 * 23 и 25 узнаваемых из 50 — то есть скриптом это не раскатать, разводить придётся
 * руками. Тем важнее, чтобы ВИД и поведение полосы жили в одном месте: иначе к
 * пятидесятому экрану она разъедется, как разъехался боковой отступ (шесть игр
 * держали своё число −16 при отступе каркаса 10).
 *
 * Отступ снизу берём из безопасной зоны: на телефонах с жестовой полосой кнопка
 * иначе встаёт ровно под неё.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';

export interface GameSetupBarProps {
  /** Подпись главного действия — УЖЕ переведённая: `t('start')`, «Уровень 3 — играть». */
  label: string;
  onStart: () => void;
  /** Цвета главной кнопки — акцент игры. По умолчанию синий каркаса. */
  colors?: [string, string];
  /** Цвет текста на градиенте: у светлых акцентов он тёмный. */
  tint?: string;
  disabled?: boolean;
  /** Справка. Нет обработчика — кнопки нет: пустая кнопка хуже её отсутствия. */
  onHelp?: () => void;
  helpLabel?: string;
  /**
   * Своя метка для тестов. Нужна там, где экран уже проверяется по имени кнопки:
   * у «Цифрового ряда» тест жмёт `ds-start`, и метка обязана переехать в полосу
   * вместе с действием — иначе проверка ищет то, чего больше нет.
   */
  testID?: string;
}

export default function GameSetupBar({
  label, onStart, colors: grad, tint = '#ffffff', disabled, onHelp, helpLabel, testID,
}: GameSetupBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const пара: [string, string] = grad ?? ['#3b82f6', '#1d4ed8'];
  return (
    <View
      testID="game-setup-bar"
      style={[styles.bar, {
        backgroundColor: colors.background,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 10),
      }]}
    >
      {onHelp ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={helpLabel}
          onPress={onHelp}
          activeOpacity={0.85}
          style={[styles.help, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="help-circle-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onStart}
        activeOpacity={0.85}
        style={[styles.startWrap, disabled ? { opacity: 0.45 } : null]}
      >
        <LinearGradient colors={пара} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.start}>
          <Ionicons name="play" size={20} color={tint} />
          <Text numberOfLines={1} style={[styles.startText, { color: tint }]}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Полоса перекрывает содержимое прокрутки — под ней ничего не должно теряться,
    // поэтому экраны настройки добирают нижний отступ (см. `SETUP_BAR_SPACE`).
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, bottom: 0 } : null),
  },
  help: {
    width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  // 🔴 Главная кнопка занимает ВСЮ оставшуюся ширину: она здесь одна главная,
  // и мельче делать её незачем — по ней стучат при каждом заходе в игру.
  startWrap: { flex: 1, minWidth: 0 },
  start: {
    minHeight: 52, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16,
  },
  startText: { fontSize: 17, fontWeight: '900' },
});

/**
 * Сколько места оставить снизу в прокрутке экрана настройки, чтобы полоса ничего
 * не накрыла. Число здесь, а не в каждой игре: полоса и отступ обязаны меняться
 * вместе.
 */
export const SETUP_BAR_SPACE = 76;
