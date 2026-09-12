/**
 * Global toast listener for level-unlock events.
 *
 * Listens for `psygames:level-unlocked` CustomEvent on the window (fired
 * by level-unlocks service after every threshold pass). Shows a temporary
 * floating banner at the top.
 *
 * Mounted once at the root layout, so it works no matter which screen
 * the user finishes a game on.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Animated, StyleSheet, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { announce } from '@/src/services/a11y';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

interface UnlockEventDetail {
  gameId: string;
  levelKey: string;
  label: string;
  labelEn?: string;
}

/**
 * 🔴 ВТОРОЕ СОБЫТИЕ — ОТВЕТ ЗАПЕРТОЙ КНОПКИ («откроется на уровне N»).
 *
 * Раньше этот ответ рисовался ПЛАШКОЙ ВНУТРИ самой кнопки (`GameAuxAction`), и
 * человек его не видел. Замер 12.09.2026 на собранном бандле, окно 403×873,
 * пять игр — ответ дошёл до глаз ровно в одной:
 *   water-sort   ✅ виден
 *   proofreading 🔴 перекрыт полем игры
 *   anagrams     🔴 перекрыт строкой правил
 *   hanoi        🔴 нарисован на 868…910 при высоте окна 873 — за нижним краем
 * Две разные причины, итог один: жмёшь — ничего не происходит. Отчёт
 * тестировщика 19eaaa3a: «Подсказки не работают».
 *
 * Плашке внутри кнопки всплыть было НЕЧЕМ: у слота шапки собственный контекст
 * наложения (`game-header-actions`, z-index 0), и `zIndex: 20` изнутри работает
 * только в его границах. Поэтому ответ переехал сюда — в корневой слой, где
 * тост уже лежит над всем экраном (z-index 9999) и не зависит ни от вёрстки
 * игры, ни от места кнопки на экране.
 */
interface LockEventDetail {
  /** Готовая фраза «Откроется на уровне N» — склеена там, где известен порог. */
  text: string;
}

type ToastState =
  | { kind: 'unlock'; detail: UnlockEventDetail }
  | { kind: 'lock'; text: string };

export default function UnlockToast() {
  const { language, t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ToastState | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-50)).current;
  /**
   * Настройка нужна ВНУТРИ обработчика события, а он живёт в эффекте с пустыми
   * зависимостями (подписка ставится один раз на всё приложение). Поэтому
   * значение держим в ref: переподписываться на каждое переключение системного
   * тумблера — потерять событие, пришедшее ровно между отпиской и подпиской.
   */
  const reduced = useReducedMotion();
  const reducedRef = React.useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    // Cross-platform event bus (RN DeviceEventEmitter — native iOS/Android + web/Tauri).
    const показать = (следующее: ToastState, вслух: string) => {
      setState(следующее);
      setVisible(true);
      announce(вслух);
      /**
       * Щадящий режим: плашка остаётся, выезд сверху исчезает.
       *
       * Сообщение «открылся новый уровень» — это награда, ради которой человек
       * и играл; убрать её значит отнять смысл достижения. А вот наезд полосы
       * от -50 точек с пружинным доскоком поверх игрового поля — чистая
       * подача: то же самое читается стоя на месте. Держится плашка те же
       * 4.5 секунды и уходит так же мгновенно, как пришла.
       */
      if (reducedRef.current) {
        opacity.setValue(1);
        translateY.setValue(0);
      } else {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
      // Auto-dismiss after 4.5s
      setTimeout(() => {
        const hide = () => { setVisible(false); setState(null); };
        if (reducedRef.current) {
          opacity.setValue(0);
          translateY.setValue(-50);
          hide();
          return;
        }
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -50, duration: 250, useNativeDriver: true }),
        ]).start(hide);
      }, 4500);
    };

    const наОткрытие = (d: UnlockEventDetail) => показать(
      { kind: 'unlock', detail: d },
      `${t('label_unlocked')}: ${language === 'en' && d.labelEn ? d.labelEn : d.label}`,
    );
    /** Ответ запертой кнопки. Тот же носитель — про ту же лестницу открытия. */
    const наЗамок = (d: LockEventDetail) => показать({ kind: 'lock', text: d.text }, d.text);

    const subUnlock = DeviceEventEmitter.addListener('psygames:level-unlocked', наОткрытие);
    const subLock = DeviceEventEmitter.addListener('psygames:ladder-locked', наЗамок);
    return () => { subUnlock.remove(); subLock.remove(); };
  }, [opacity, translateY]);

  if (!visible || !state) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, {
      opacity, transform: [{ translateY }],
    }]}>
      <Ionicons
        name={state.kind === 'lock' ? 'lock-closed' : 'trophy'}
        size={20}
        color="#fbbf24"
      />
      <View style={{ flex: 1 }}>
        {state.kind === 'lock' ? (
          /* У замка одна строка: сама фраза «Откроется на уровне N» и есть
             сообщение целиком — заголовок над ней был бы водой. */
          <Text style={styles.toastSub}>{state.text}</Text>
        ) : (
          <>
            <Text style={styles.toastTitle}>{t('toast_new_level_unlocked')}</Text>
            <Text style={styles.toastSub}>
              {language === 'ru' ? state.detail.label : (state.detail.labelEn ?? state.detail.label)}
            </Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  toastTitle: { color: '#fbbf24', fontSize: 14, fontWeight: '800' },
  toastSub: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
});
