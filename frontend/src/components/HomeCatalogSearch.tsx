import React from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { catalogSearchRoute } from '@/src/services/catalogSearchRoute';

/** The home screen opens the shared catalog, not a second partial game list. */
export default function HomeCatalogSearch() {
  const [query, setQuery] = React.useState('');
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const open = () => router.push(catalogSearchRoute(query) as any);
  return (
    <View style={{ marginBottom: 16, gap: 8 }}>
      <TextInput
        testID="home-catalog-search"
        accessibilityLabel={t('catalogSearch')}
        placeholder={t('catalogSearch')}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={open}
        returnKeyType="search"
        style={{ minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 12, color: colors.text, backgroundColor: colors.surface }}
      />
      <Pressable
        testID="home-catalog-search-open"
        accessibilityRole="button"
        onPress={open}
        style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface }}
      >
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('tabGames')} · {t('catalogFilter')}</Text>
      </Pressable>
    </View>
  );
}
