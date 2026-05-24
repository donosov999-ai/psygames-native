import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Alert,
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
  const {
    profile, switchProfile, allProfiles,
    unlockedThemed, redeemCode, resetUnlocks, isAccessible,
  } = useProfile();
  const router = useRouter();
  // Unlock-code modal state
  const [codeModalOpen, setCodeModalOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState<string | null>(null);

  const tryRedeem = async () => {
    setCodeError(null);
    const id = await redeemCode(codeInput);
    if (id) {
      setCodeModalOpen(false);
      setCodeInput('');
    } else {
      setCodeError('Неверный код. Проверь и попробуй ещё раз.');
    }
  };
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
              <Text style={[styles.groupLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                🎯 Тематические (9 игр каждый)
              </Text>
              <TouchableOpacity onPress={() => setCodeModalOpen(true)} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>🔑 Ввести код</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.profileGrid}>
              {allProfiles.filter(p => p.group === 'themed').map((p) => {
                const active = p.id === profile.id;
                const accessible = isAccessible(p.id);   // FREE is always accessible; others need unlock
                const locked = !accessible;
                return (
                  <TouchableOpacity
                    key={p.id}
                    disabled={locked}
                    style={[styles.profileCard, {
                      backgroundColor: active ? p.color : colors.card,
                      borderColor: active ? p.color : colors.border,
                      borderWidth: 2,
                      opacity: locked ? 0.55 : 1,
                    }]}
                    onPress={() => {
                      if (locked) {
                        setCodeModalOpen(true);
                      } else {
                        switchProfile(p.id);
                      }
                    }}
                  >
                    <Text style={styles.profileEmoji}>{p.emoji}{locked && '🔒'}</Text>
                    <Text style={[styles.profileName, { color: active ? '#000' : colors.text }]}>
                      {p.display_name}
                    </Text>
                    <Text style={[styles.profileDesc, { color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary }]}
                      numberOfLines={2}>
                      {p.description}
                    </Text>
                    {p.session_minutes && (
                      <Text style={{ fontSize: 9, color: active ? 'rgba(0,0,0,0.55)' : colors.textSecondary, marginTop: 2, fontFamily: 'monospace' }}>
                        ⏱ {p.session_minutes}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {unlockedThemed.size > 0 && (
              <TouchableOpacity onPress={() => {
                Alert.alert(
                  'Сбросить разблокировки?',
                  'Все ранее введённые коды забудутся. Чтобы вернуть профили — нужно будет снова ввести коды.',
                  [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Сбросить', style: 'destructive', onPress: () => resetUnlocks() },
                  ]
                );
              }} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Разблокировано: {unlockedThemed.size} · 🗑 Сбросить
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Unlock-code modal */}
      <Modal visible={codeModalOpen} animationType="fade" transparent onRequestClose={() => setCodeModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 22, gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>🔑 Код доступа</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
              Введите код чтобы разблокировать тематический профиль (Шахматист, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ).
            </Text>
            <TextInput
              value={codeInput}
              onChangeText={(t) => { setCodeInput(t); setCodeError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="например, CHESS-NZT-2026"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: codeError ? '#ef4444' : colors.border,
                borderRadius: 10,
                padding: 12,
                fontSize: 16,
                color: colors.text,
                fontFamily: 'monospace',
              }}
              onSubmitEditing={tryRedeem}
            />
            {codeError && <Text style={{ fontSize: 12, color: '#ef4444' }}>{codeError}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => { setCodeModalOpen(false); setCodeInput(''); setCodeError(null); }}
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={tryRedeem}
                style={{ paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#10b981', borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Разблокировать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
        <Text style={[styles.appName, { color: colors.textSecondary }]}>PsyGames v1.2.4 · {profile.emoji} {profile.display_name}</Text>
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
