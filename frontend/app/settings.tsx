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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSoundEnabled, getHapticEnabled, setSoundEnabled, setHapticEnabled,
} from '@/src/services/feedback';
import type { ProfileDef } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';
// v1.16.0: флаг монетизации + helper «скоро» (раньше UNLOCK_CODES_ENABLED
// использовался без импорта → был undefined → вёл себя как false случайно).
import { UNLOCK_CODES_ENABLED, isComingSoon } from '@/src/services/unlock';

// Telegram-аккаунт владельца для запроса кодов разблокировки.
const OWNER_TG = 'Denis_On999';

/** Emoji-mapping для категории игры (для модалки деталей профиля). */
const CATEGORY_EMOJI: Record<string, string> = {
  memory: '🧠',
  attention: '🎯',
  logic: '🧩',
  action: '⚡',
};

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
  // Profile detail modal state (v1.6.0) — открывается при клике на locked профиль
  const [detailProfile, setDetailProfile] = React.useState<ProfileDef | null>(null);

  /** Открыть Telegram с pre-filled сообщением для запроса кода. */
  const requestCodeViaTelegram = (p: ProfileDef) => {
    const msg = encodeURIComponent(
      `Привет, Денис! Хочу получить код доступа к профилю «${p.display_name}» (${p.emoji}) в PsyGames. Это для меня / для (укажи кому, если в подарок).`
    );
    const url = `https://t.me/${OWNER_TG}?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Не удалось открыть Telegram', `Напиши вручную: @${OWNER_TG}`);
    });
  };

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

  // v1.15.0: Backup / Restore прогресса
  const handleExportBackup = async () => {
    try {
      await downloadBackup('1.15.0');
    } catch (e: any) {
      if (e?.message === 'NATIVE_NO_DOWNLOAD') {
        // Native fallback — показать JSON чтобы скопировать вручную
        const json = await buildBackupJSON('1.15.0');
        Alert.alert(
          'Бэкап (скопируй текст)',
          json.length > 800 ? json.slice(0, 800) + '\n…(обрезано)' : json
        );
      } else {
        Alert.alert('Ошибка экспорта', e?.message || 'Не удалось создать бэкап');
      }
    }
  };
  const handleImportBackup = async () => {
    try {
      const { restored } = await pickAndRestoreBackup();
      Alert.alert(
        'Бэкап восстановлен ✓',
        `Восстановлено ${restored} записей. Перезапусти приложение чтобы данные применились.`
      );
    } catch (e: any) {
      if (e?.message === 'NATIVE_NO_FILEPICKER') {
        Alert.alert('Импорт', 'На этой платформе пока только через web-версию. Открой PsyGames в браузере для импорта.');
      } else {
        Alert.alert('Ошибка импорта', e?.message || 'Не удалось восстановить');
      }
    }
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
          У каждого профиля свой набор тренажёров, свой плейлист зарядки и своя история.
        </Text>
        {/* Personal profiles (v1.3.0: section hidden when no personal profiles exist;
            kept as conditional render in case personal profiles return in the future) */}
        {allProfiles.some(p => !p.group || p.group === 'personal') && (
          <>
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
          </>
        )}

        {/* Themed (commercial) profiles */}
        {allProfiles.some(p => p.group === 'themed') && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
              <Text style={[styles.groupLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                {UNLOCK_CODES_ENABLED
                  ? '🎯 Тематические (9 тренажёров каждый · ODV999 = все 48)'
                  : '🎯 Тематические · 5 открыты бесплатно, остальные скоро'}
              </Text>
              {/* v1.15.0: «Ввести код» скрыт пока UNLOCK_CODES_ENABLED=false */}
              {UNLOCK_CODES_ENABLED && (
                <TouchableOpacity onPress={() => setCodeModalOpen(true)} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>🔑 Ввести код</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.profileGrid}>
              {allProfiles.filter(p => p.group === 'themed').map((p) => {
                const active = p.id === profile.id;
                const accessible = isAccessible(p.id);   // FREE is always accessible; others need unlock
                const locked = !accessible;
                return (
                  <TouchableOpacity
                    key={p.id}
                    // v1.6.0: убрали disabled — теперь locked-карточки кликабельные
                    // и открывают modal с описанием/хуком/инструкцией как получить код
                    style={[styles.profileCard, {
                      backgroundColor: active ? p.color : colors.card,
                      borderColor: active ? p.color : colors.border,
                      borderWidth: 2,
                      opacity: locked ? 0.55 : 1,
                    }]}
                    onPress={() => {
                      if (locked) {
                        // v1.6.0: клик по locked → показать детальную модалку
                        // (с описанием, хуком, играми, кнопками «ввести код» / «получить в TG»)
                        setDetailProfile(p);
                      } else {
                        switchProfile(p.id);
                      }
                    }}
                    onLongPress={() => {
                      // Long press на любой карточке (locked или unlocked) → детали
                      setDetailProfile(p);
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
              Введите код чтобы разблокировать тематический профиль (ODV999, Шахматист, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ, Женщины).
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

      {/* Profile Detail Modal (v1.6.0) — описание, хук, список игр + кнопки */}
      <Modal visible={detailProfile !== null} animationType="slide" transparent onRequestClose={() => setDetailProfile(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
            {detailProfile && (
              <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 30 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 38 }}>{detailProfile.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{detailProfile.display_name}</Text>
                      {detailProfile.audience && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>👥 {detailProfile.audience}</Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setDetailProfile(null)} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Sales hook */}
                {detailProfile.sales_hook && (
                  <View style={{
                    backgroundColor: detailProfile.color + '22',
                    borderLeftWidth: 4,
                    borderLeftColor: detailProfile.color,
                    paddingVertical: 10, paddingHorizontal: 12,
                    borderRadius: 8,
                    marginTop: 8, marginBottom: 14,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.text, lineHeight: 19, fontWeight: '600' }}>
                      {detailProfile.sales_hook}
                    </Text>
                  </View>
                )}

                {/* Long description */}
                {detailProfile.long_description && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 }}>
                    {detailProfile.long_description}
                  </Text>
                )}

                {/* Metadata row */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {detailProfile.session_minutes && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>⏱ {detailProfile.session_minutes}</Text>
                    </View>
                  )}
                  {detailProfile.warmup_enabled && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>☀️ Утренняя Зарядка</Text>
                    </View>
                  )}
                  {detailProfile.financial_brain_day_enabled && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>💰 Financial Brain Day</Text>
                    </View>
                  )}
                  {detailProfile.assessment_enabled && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>📊 G1 Assessment</Text>
                    </View>
                  )}
                </View>

                {/* Games list */}
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 }}>
                  🎮 {detailProfile.allowed_games === 'all' ? 'Все 48 тренажёров' : `${(detailProfile.allowed_games as string[]).length} тренажёров в этом профиле`}
                </Text>
                {detailProfile.allowed_games !== 'all' && (
                  <View style={{ gap: 6, marginBottom: 18 }}>
                    {(detailProfile.allowed_games as string[]).map(gameId => {
                      const game = GAMES.find(g => g.id === gameId);
                      if (!game) return null;
                      return (
                        <View key={gameId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 16 }}>{CATEGORY_EMOJI[game.category] || '•'}</Text>
                          <Text style={{ fontSize: 13, color: colors.text, flex: 1 }}>{t(game.nameKey)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {detailProfile.allowed_games === 'all' && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 18, fontStyle: 'italic' }}>
                    Полная библиотека: 12 памяти · 7 внимания · 14 логики · 15 скорости/торможения. Все 48 — без ограничений.
                  </Text>
                )}

                {/* Action buttons */}
                {!isAccessible(detailProfile.id) && (
                  isComingSoon(detailProfile.id) ? (
                    /* v1.16.0: free-trial этап — кодов нет, профиль откроется после запуска.
                       НЕ показываем код-кнопки (тупик), показываем «Скоро» + что доступно сейчас. */
                    <View style={{ gap: 8, backgroundColor: colors.card, borderRadius: 12, padding: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' }}>🔒 Скоро</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 }}>
                        Этот профиль откроется после запуска. Сейчас бесплатно доступны:{'\n'}💊 NZT-48 · 🌸 Микро-релакс · 🧒 Дети · 👴 50+ · 🎓 Студенты{'\n'}— выбери любой из них.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => { setDetailProfile(null); setCodeModalOpen(true); }}
                        style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>🔑 У меня уже есть код — ввести</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => requestCodeViaTelegram(detailProfile)}
                        style={{ backgroundColor: '#0088cc', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                      >
                        <Ionicons name="paper-plane" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Запросить код у @{OWNER_TG}</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 16 }}>
                        Напиши Денису в Telegram — он выдаст персональный код доступа{'\n'}за 5 минут (рабочие часы Мск).
                      </Text>
                    </View>
                  )
                )}

                {/* Если уже разблокирован — кнопка «Активировать» */}
                {!!isAccessible(detailProfile.id) && detailProfile.id !== profile.id && (
                  <TouchableOpacity
                    onPress={() => { switchProfile(detailProfile.id); setDetailProfile(null); }}
                    style={{ backgroundColor: detailProfile.color, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#000', fontWeight: '800', fontSize: 15 }}>✓ Переключиться на этот профиль</Text>
                  </TouchableOpacity>
                )}
                {detailProfile.id === profile.id && (
                  <View style={{ backgroundColor: detailProfile.color + '33', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>✓ Это твой текущий профиль</Text>
                  </View>
                )}
              </ScrollView>
            )}
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
          <View style={[styles.languageButtons, { flexWrap: 'wrap', justifyContent: 'flex-end' }]}>
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[
                    styles.langButton,
                    active
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => setLanguage(l.code)}
                >
                  <Text style={[styles.langButtonText, { color: active ? '#FFFFFF' : colors.text }]}>
                    {l.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
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

        {/* v1.15.0: Backup / Restore прогресса */}
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={handleExportBackup}>
          <View style={styles.settingInfo}>
            <Ionicons name="cloud-download-outline" size={24} color="#22c55e" />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Сохранить бэкап прогресса</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={handleImportBackup}>
          <View style={styles.settingInfo}>
            <Ionicons name="cloud-upload-outline" size={24} color="#3b82f6" />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Восстановить из бэкапа</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={[styles.appName, { color: colors.textSecondary }]}>PsyGames v1.22.1 · {profile.emoji} {profile.display_name} · 48 валидированных парадигм</Text>
        <Text style={[styles.appVersion, { color: colors.textSecondary }]}>Клик по профилю → детали + запрос кода в Telegram</Text>
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
