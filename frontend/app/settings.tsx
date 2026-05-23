import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSoundEnabled, getHapticEnabled, setSoundEnabled, setHapticEnabled,
} from '@/src/services/feedback';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { profile, switchProfile, allProfiles } = useProfile();
  const router = useRouter();
  const [soundOn, setSoundOn] = React.useState(true);
  const [hapticOn, setHapticOn] = React.useState(true);
  React.useEffect(() => {
    (async () => {
      setSoundOn(await getSoundEnabled());
      setHapticOn(await getHapticEnabled());
    })();
  }, []);
  const toggleSound = async () => { const v = !soundOn; setSoundOn(v); await setSoundEnabled(v); };
  const toggleHaptic = async () => { const v = !hapticOn; setHapticOn(v); await setHapticEnabled(v); };
  const replayOnboarding = async () => {
    try { await AsyncStorage.removeItem('psygames_onboarded'); } catch {}
    router.push('/onboarding' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
      {/* Profile Selector (E1) */}
      <View style={[styles.profileSection, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          👤 Профиль
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          У каждого профиля свой набор игр, свой плейлист зарядки и своя история.
        </Text>
        {/* Personal profiles */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>👥 Личные</Text>
        <View style={styles.profileGrid}>
          {allProfiles.filter(p => !p.group || p.group === 'personal').map((p) => {
            const active = p.id === profile.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.profileCard, {
                  backgroundColor: active ? p.color : colors.card,
                  borderColor: active ? p.color : colors.border,
                  borderWidth: 2,
                }]}
                onPress={() => switchProfile(p.id)}
              >
                <Text style={styles.profileEmoji}>{p.emoji}</Text>
                <Text style={[styles.profileName, { color: active ? '#000' : colors.text }]}>
                  {p.display_name}
                </Text>
                <Text style={[styles.profileDesc, { color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary }]}
                  numberOfLines={2}>
                  {p.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Themed (commercial) profiles */}
        {allProfiles.some(p => p.group === 'themed') && (
          <>
            <Text style={[styles.groupLabel, { color: colors.textSecondary, marginTop: 16 }]}>
              🎯 Тематические (9 игр каждый)
            </Text>
            <View style={styles.profileGrid}>
              {allProfiles.filter(p => p.group === 'themed').map((p) => {
                const active = p.id === profile.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.profileCard, {
                      backgroundColor: active ? p.color : colors.card,
                      borderColor: active ? p.color : colors.border,
                      borderWidth: 2,
                    }]}
                    onPress={() => switchProfile(p.id)}
                  >
                    <Text style={styles.profileEmoji}>{p.emoji}</Text>
                    <Text style={[styles.profileName, { color: active ? '#000' : colors.text }]}>
                      {p.display_name}
                    </Text>
                    <Text style={[styles.profileDesc, { color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary }]}
                      numberOfLines={2}>
                      {p.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Settings List */}
      <View style={styles.settingsList}>
        {/* Dark Theme */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny'}
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('darkTheme')}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Sound */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Звук</Text>
          </View>
          <Switch value={soundOn} onValueChange={toggleSound} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* Haptic */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="phone-portrait-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Вибрация</Text>
          </View>
          <Switch value={hapticOn} onValueChange={toggleHaptic} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>

        {/* Language */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="language" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('language')}
            </Text>
          </View>
          <View style={styles.languageButtons}>
            <TouchableOpacity
              style={[
                styles.langButton,
                language === 'ru' && { backgroundColor: colors.primary },
                language !== 'ru' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setLanguage('ru')}
            >
              <Text
                style={[
                  styles.langButtonText,
                  { color: language === 'ru' ? '#FFFFFF' : colors.text },
                ]}
              >
                RU
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.langButton,
                language === 'en' && { backgroundColor: colors.primary },
                language !== 'en' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setLanguage('en')}
            >
              <Text
                style={[
                  styles.langButtonText,
                  { color: language === 'en' ? '#FFFFFF' : colors.text },
                ]}
              >
                EN
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Achievements + Tutorial actions */}
      <View style={[styles.settingsList, { gap: 8 }]}>
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={() => router.push('/achievements' as any)}>
          <View style={styles.settingInfo}>
            <Ionicons name="trophy" size={24} color="#fbbf24" />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Достижения</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={replayOnboarding}>
          <View style={styles.settingInfo}>
            <Ionicons name="play-circle-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Показать туториал заново</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={[styles.appName, { color: colors.textSecondary }]}>PsyGames · Активный профиль: {profile.emoji} {profile.display_name}</Text>
        <Text style={[styles.appVersion, { color: colors.textSecondary }]}>v1.1.0 · 5 профилей</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  placeholder: {
    width: 44,
  },
  settingsList: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  languageButtons: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  langButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  langButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  appInfo: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
  },
  appVersion: {
    fontSize: 12,
    marginTop: 4,
  },
  profileSection: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  profileCard: {
    width: '31%',
    minWidth: 100,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  profileEmoji: { fontSize: 32 },
  profileName: { fontSize: 14, fontWeight: '700' },
  profileDesc: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
});
