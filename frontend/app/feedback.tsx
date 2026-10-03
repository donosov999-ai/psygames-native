import React from 'react';
import { DeviceEventEmitter, Pressable, Text, View } from 'react-native';
import { FEEDBACK_OPEN_EVENT } from '@/src/services/appFeedback';
import { useLanguage } from '@/src/contexts/LanguageContext';

// The root FeedbackWidget opens itself for this route and owns the shared form.
export default function FeedbackScreen() {
  const { t } = useLanguage();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Pressable onPress={() => DeviceEventEmitter.emit(FEEDBACK_OPEN_EVENT)}
      accessibilityRole="button" style={{ padding: 20 }}>
      <Text>{t('feedbackFabLabel')}</Text>
    </Pressable>
  </View>;
}
