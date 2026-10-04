import React from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceEventEmitter, Pressable, Text, View } from 'react-native';
import { FEEDBACK_OPEN_EVENT } from '@/src/services/appFeedback';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useTheme } from '@/src/contexts/ThemeContext';

// The root FeedbackWidget opens itself for this route and owns the shared form.
export default function FeedbackScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('back')}
      style={{ padding: 20, alignSelf: 'flex-start' }}
      onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}>
      <Text style={{ color: colors.text }}>← {t('back')}</Text>
    </Pressable>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Pressable onPress={() => DeviceEventEmitter.emit(FEEDBACK_OPEN_EVENT)}
      accessibilityRole="button" style={{ padding: 20 }}>
      <Text style={{ color: colors.text }}>{t('feedbackFabLabel')}</Text>
    </Pressable>
    </View>
  </SafeAreaView>;
}
