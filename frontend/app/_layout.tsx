import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import UnlockToast from '@/src/components/UnlockToast';
import AppErrorBoundary from '@/src/components/AppErrorBoundary';
import WelcomeModal from '@/src/components/WelcomeModal';
import UpdateGate from '@/src/components/UpdateGate';
import GameHelpOverlay from '@/src/components/GameHelpOverlay';
import OrientationGuard from '@/src/components/OrientationGuard';
import FeedbackWidget from '@/src/components/FeedbackWidget';

/** Тап по локальному напоминанию → запуск комплекса (натив-only). */
function NotificationTapHandler() {
  const warmup = useWarmup();
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

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
      {/* Global level-unlock toast (themed profiles only) */}
      <UnlockToast />
      {/* First-run welcome modal (FREE vs Code choice) */}
      <WelcomeModal />
      {/* Desktop-only авто-апдейтер (Tauri). На web/Android — no-op. */}
      <UpdateGate />
      {/* Глобальная «?»-справка игр (сама прячется вне /games/* через HELP_MAP) */}
      <GameHelpOverlay />
      {/* Тап по локальному напоминанию → запуск зарядки/вечернего комплекса */}
      <NotificationTapHandler />
      {/* Портретный лок: в телефонном landscape сетки игр (судоку 9×9 и др.) схлопываются → просим повернуть */}
      <OrientationGuard />
      {/* Кнопка фидбека тестировщиков (закрытый тест). Гейт: FEEDBACK_ENABLED */}
      <FeedbackWidget />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Снаружи провайдеров: ловит краши и экранов, и самих провайдеров */}
      <AppErrorBoundary>
        <SafeAreaProvider>
          <ProfileProvider>
            <ThemeProvider>
              <LanguageProvider>
                <WarmupProvider>
                  <RootLayoutNav />
                </WarmupProvider>
              </LanguageProvider>
            </ThemeProvider>
          </ProfileProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
