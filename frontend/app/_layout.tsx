import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext';
import { LanguageProvider, useLanguage } from '@/src/contexts/LanguageContext';
import { applyRTL, isRTLLang } from '@/src/services/rtl';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';
import { Platform } from 'react-native';
import { vibrate } from '@/src/services/feedback';
import * as Notifications from 'expo-notifications';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NativeInsetBridge from '@/src/components/NativeInsetBridge';
import { pickSupabaseBase } from '@/src/services/supabase';
import { flushFeedbackQueue } from '@/src/services/appFeedback';
import { startSessionCloudSync } from '@/src/services/api';
import { warmLevelCache } from '@/src/services/levelCache';
import UnlockToast from '@/src/components/UnlockToast';
import AppErrorBoundary from '@/src/components/AppErrorBoundary';
import UpdateGate from '@/src/components/UpdateGate';
import GameHelpOverlay from '@/src/components/GameHelpOverlay';
import OrientationGuard from '@/src/components/OrientationGuard';
import FeedbackWidget from '@/src/components/FeedbackWidget';
import WalkingPet from '@/src/components/pet/WalkingPet';
import { repairWarmupHistoryOnce, loadWarmupHistory } from '@/src/services/warmup';
import { grantWarmupCompensationOnce } from '@/src/services/tokens';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getSessions } from '@/src/services/api';

/** Тап по локальному напоминанию → запуск комплекса (натив-only). */
function NotificationTapHandler() {
  const warmup = useWarmup();
  const { profile } = useProfile();

  // Разовый возврат очков за сорванные зарядки (решение Дениса 13.08.2026).
  // Очки живут только на устройстве — начислить снаружи некуда, поэтому возврат
  // происходит здесь, один раз, и только там, где зарядки действительно делались.
  React.useEffect(() => {
    const pid = (profile as any)?.id;
    if (!pid) return;
    grantWarmupCompensationOnce(pid, async () => (await loadWarmupHistory()).length > 0)
      .then((n) => { if (n) console.log(`возврат очков за сорванные зарядки: +${n}`); })
      .catch(() => {});
  }, [profile]);
  // Разовое восстановление отметок календаря: история зарядок могла быть стёрта
  // целиком (пустой список сохранялся поверх накопленного при сбое чтения). Дни
  // восстанавливаются из СОБСТВЕННЫХ сессий человека — ничего не выдумывается.
  // Идёт один раз, дальше флаг в хранилище.
  React.useEffect(() => {
    repairWarmupHistoryOnce(getSessions)
      .then((n) => { if (n) console.log(`восстановлено дней в календаре: ${n}`); })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const launch = (type?: string) => {
      if (type === 'morning') warmup.startWarmup(10);
      else if (type === 'evening') warmup.startEvening();
    };
    // cold-start (апп открыт тапом по уведомлению)
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        const t = resp?.notification?.request?.content?.data?.type as string | undefined;
        if (t) setTimeout(() => launch(t), 900); // дать роутеру смонтироваться
      })
      .catch(() => {});
    // тап при работающем/фоновом аппе
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      launch(resp?.notification?.request?.content?.data?.type as string | undefined);
    });
    return () => sub.remove();
  }, [warmup]);
  return null;
}

function RootLayoutNav() {
  const { isDark, colors } = useTheme();
  const reducedMotion = useReducedMotion();
  // RTL-заход (арабский): при смене языка ставим dir/lang на корень документа
  // (web; RN Web I18nManager — заглушка, работает именно document.dir) и флаг
  // I18nManager на нативе. LanguageContext не трогаем — подписка живёт здесь.
  const { language } = useLanguage();
  const rtl = isRTLLang(language);
  React.useEffect(() => { applyRTL(language); }, [language]);

  /**
   * Отклик на нажатие кнопок — одним слушателем на весь документ.
   *
   * Просьба Rulon голосом (v1.171): «стоит добавить вибрацию на нажатие кнопки».
   * Расставлять вызов по местам нажатий бессмысленно — их сотни в 62 играх, и
   * половину неизбежно забудешь. Android-сборка это WebView, RN Web рисует
   * тачаблы как элементы с role="button", поэтому одна подписка на click
   * покрывает всё приложение сразу и ничего не требует от новых экранов.
   *
   * Именно click, а НЕ pointerdown: click не стреляет на прокрутке и свайпах —
   * иначе телефон дрожал бы при каждом пролистывании списка.
   */
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onTap = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[role="button"],[role="switch"],[role="tab"],button')) vibrate(12);
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          /**
           * Проезд экрана — движение СМЫСЛОВОЕ: он показывает, что ты ушёл
           * вглубь, а не оказался на другом экране случайно, и что кнопка
           * «назад» вернёт по тому же пути. В RTL направление зеркалится:
           * «вперёд» для арабского — влево.
           *
           * В щадящем режиме этот смысл не выбрасываем, а сообщаем мгновенно.
           * `'none'` у Stack — это НЕ «без перехода»: переход происходит, просто
           * новый экран встаёт на место сразу, без проезда всей плоскости
           * поперёк поля зрения. Именно проезд полноэкранного слоя и укачивает,
           * а «где я оказался» человеку по-прежнему говорят заголовок и стрелка
           * «назад». Плюс на каждый переход остаются отклик кнопки и звук.
           */
          animation: reducedMotion ? 'none' : (rtl ? 'slide_from_left' : 'slide_from_right'),
        }}
      />
      {/* Global level-unlock toast (themed profiles only) */}
      <UnlockToast />
      {/* v1.121: экран выбора «FREE vs код» убран — приложение бесплатное,
          первый запуск сразу стартует на FREE (см. ProfileContext). */}
      {/* Desktop-only авто-апдейтер (Tauri). На web/Android — no-op. */}
      <UpdateGate />
      {/* Глобальная «?»-справка игр (сама прячется вне /games/* через HELP_MAP) */}
      <GameHelpOverlay />
      {/* Тап по локальному напоминанию → запуск зарядки/вечернего комплекса */}
      <NotificationTapHandler />
      {/* НЕ лок: ориентацией рулит система. Подсказка только на /games/*, где доска
          считается от высоты экрана и в телефонном landscape схлопывается; закрывается кнопкой */}
      <OrientationGuard />
      {/* Кнопка фидбека тестировщиков (закрытый тест). Гейт: FEEDBACK_ENABLED */}
      <FeedbackWidget />
      {/* Питомец «Синапс» гуляет по низу экрана (сам прячется в играх и на /pet;
          тумблер в настройках). Тап по нему — экран /pet */}
      <WalkingPet />
    </>
  );
}

export default function RootLayout() {
  // Expo resets its static font registry before every route render, so this
  // must run inside the root render (module-level registration is discarded).
  // It is synchronous on the server and makes SSR/client icon markup identical.
  if (Platform.OS === 'web' && typeof window === 'undefined') {
    void Ionicons.loadFont().catch(() => {});
  }

  // Cloud не участвует в критическом пути старта. Сначала монтируем локальные
  // экраны/игры, затем выбираем direct/relay и только после этого запускаем
  // migration + две outbox-очереди. Ни один из промисов не блокирует UI.
  /**
   * ⚠️ УРОВНИ ЧИТАЕМ СРАЗУ, БЕЗ ЗАДЕРЖКИ. Это не фон, а критический путь: пока
   * уровни не прочитаны, любой автостарт («Вызов дня», онбординг) видит первый
   * уровень вместо достигнутого. Одно пакетное чтение на весь запуск.
   */
  React.useEffect(() => { void warmLevelCache(); }, []);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      pickSupabaseBase()
        .then(() => {
          if (cancelled) return;
          startSessionCloudSync();
          void flushFeedbackQueue();
        })
        .catch(() => {});
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Снаружи провайдеров: ловит краши и экранов, и самих провайдеров */}
      <AppErrorBoundary>
        <SafeAreaProvider>
          {/* v1.162: инсеты Android приходят из нативного слоя — env() в WebView
              знает только про вырез экрана, но не про статус-бар и навигацию. */}
          <NativeInsetBridge>
          <ProfileProvider>
            <ThemeProvider>
              <LanguageProvider>
                <WarmupProvider>
                  <RootLayoutNav />
                </WarmupProvider>
              </LanguageProvider>
            </ThemeProvider>
          </ProfileProvider>
          </NativeInsetBridge>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
