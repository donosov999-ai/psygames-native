import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { WarmupProvider } from '@/src/contexts/WarmupContext';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import UnlockToast from '@/src/components/UnlockToast';
import WelcomeModal from '@/src/components/WelcomeModal';
import UpdateGate from '@/src/components/UpdateGate';
import GameHelpOverlay from '@/src/components/GameHelpOverlay';

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
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
