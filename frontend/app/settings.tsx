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
  PanResponder,
  DeviceEventEmitter,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { useProfile } from '@/src/contexts/ProfileContext';
import { ScrollView } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSoundEnabled, getHapticEnabled, setSoundEnabled, setHapticEnabled,
  getMusicEnabled, setMusicEnabled,
} from '@/src/services/feedback';
import { getDevChatVisible, setDevChatVisible } from '@/src/services/appFeedback';
import {
  getPetVisible, setPetVisible, getPetScale, setPetScale,
  PET_SCALE_MIN, PET_SCALE_MAX, PET_SCALE_EVENT, PET_VISIBLE_EVENT, DEVCHAT_VISIBLE_EVENT,
} from '@/src/services/pet';
import { exportProgress, importProgress } from '@/src/services/dataTransfer';
import type { ProfileDef } from '@/src/constants/profiles';
import { MONETIZATION_ENABLED, CODE_ENTRY_ENABLED } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';
// v1.16.0: флаг монетизации + helper «скоро» (раньше UNLOCK_CODES_ENABLED
// использовался без импорта → был undefined → вёл себя как false случайно).
import { UNLOCK_CODES_ENABLED, isComingSoon } from '@/src/services/unlock';
// v1.24.3 fix: функции бэкапа использовались без импорта → ReferenceError при тапе
// на «Экспорт/Импорт бэкапа» (тот же класс бага, что был с UNLOCK_CODES_ENABLED выше).
import { buildBackupJSON, restoreBackupJSON, downloadBackup, pickAndRestoreBackup } from '@/src/services/backup';
// v1.26.0: локальные напоминания (зарядка/перед сном) — натив-only.
import { loadReminderSettings, saveReminderSettings, applyReminders, requestReminderPermission, ReminderSettings, DEFAULT_REMINDERS } from '@/src/services/reminders';

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
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  const { colors, isDark, toggleTheme, colorblind, setColorblind } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const {
    profile, switchProfile, allProfiles,
    unlockedThemed, redeemCode, resetUnlocks, isAccessible,
  } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Адаптивная сетка профилей: узкий экран (телефон) → 2 колонки, широкий (планшет/web/desktop) → 3.
  const profileCardWidth = width >= 520 ? '31%' : '48%';
  // Unlock-code modal state
  const [codeModalOpen, setCodeModalOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState<string | null>(null);
  // Profile detail modal state (v1.6.0) — открывается при клике на locked профиль
  const [detailProfile, setDetailProfile] = React.useState<ProfileDef | null>(null);

  /** Открыть Telegram с pre-filled сообщением для запроса кода. */
  const requestCodeViaTelegram = (p: ProfileDef) => {
    const msg = encodeURIComponent(
      t('tgRequestCodeMsg').replace('{name}', p.display_name).replace('{emoji}', p.emoji)
    );
    const url = `https://t.me/${OWNER_TG}?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(
        t('alert_telegram_open_failed'),
        t('messageManually').replace('{tg}', OWNER_TG)
      );
    });
  };

  const tryRedeem = async () => {
    setCodeError(null);
    const id = await redeemCode(codeInput);
    if (id) {
      setCodeModalOpen(false);
      setCodeInput('');
    } else {
      setCodeError(t('msg_invalid_code'));
    }
  };
  const [soundOn, setSoundOn] = React.useState(true);
  const [hapticOn, setHapticOn] = React.useState(true);
  const [musicOn, setMusicOnState] = React.useState(false);
  const [devChatOn, setDevChatOn] = React.useState(true);   // v1.125: кнопка «Чат с разработчиками»
  const [petOn, setPetOn] = React.useState(true);           // гуляющий питомец «Синапс» (независим от чата)
  const [petScale, setPetScaleState] = React.useState(1);
  React.useEffect(() => {
    (async () => {
      setSoundOn(await getSoundEnabled());
      setHapticOn(await getHapticEnabled());
      setMusicOnState(await getMusicEnabled());
      setDevChatOn(await getDevChatVisible());
      setPetOn(await getPetVisible());
      setPetScaleState(await getPetScale());
    })();
  }, []);
  // Ползунок размера питомца: значение шлётся живьём (питомец гуляет прямо на
  // этом экране — меняется под пальцем), в хранилище пишем на отпускание.
  const petTrackW = React.useRef(1);
  const petScaleRef = React.useRef(1);
  petScaleRef.current = petScale;
  const applyPetScale = (v: number) => {
    const clamped = Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, v));
    // ref — сразу (не через рендер): Release при тапе идёт в том же тике,
    // до ре-рендера, и иначе записал бы в хранилище прошлое значение.
    petScaleRef.current = clamped;
    setPetScaleState(clamped);
    DeviceEventEmitter.emit(PET_SCALE_EVENT, clamped);
    return clamped;
  };
  const petDragStart = React.useRef(1);
  const petPan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        // Тап по треку — прыгаем сразу в точку тапа (locationX от трека).
        const ratio = Math.min(1, Math.max(0, evt.nativeEvent.locationX / petTrackW.current));
        petDragStart.current = applyPetScale(PET_SCALE_MIN + ratio * (PET_SCALE_MAX - PET_SCALE_MIN));
      },
      onPanResponderMove: (_evt, g) => {
        // Дальше ведём относительно точки старта (dx стабилен на web и нативе).
        applyPetScale(petDragStart.current + (g.dx / petTrackW.current) * (PET_SCALE_MAX - PET_SCALE_MIN));
      },
      onPanResponderRelease: () => { setPetScale(petScaleRef.current); },
      onPanResponderTerminate: () => { setPetScale(petScaleRef.current); },
    })
  ).current;
  const toggleSound = async () => { const v = !soundOn; setSoundOn(v); await setSoundEnabled(v); };
  const toggleHaptic = async () => { const v = !hapticOn; setHapticOn(v); await setHapticEnabled(v); };
  const toggleMusic = async () => { const v = !musicOn; setMusicOnState(v); await setMusicEnabled(v); };
  // v1.148: тумблеры применяются ЖИВЬЁМ (событие) — раньше питомец/кнопка чата
  // оставались на экране до смены роута (репорт Rulon «переключатели не работают»).
  const toggleDevChat = async () => {
    const v = !devChatOn; setDevChatOn(v);
    DeviceEventEmitter.emit(DEVCHAT_VISIBLE_EVENT, v);
    await setDevChatVisible(v);
  };
  const togglePet = async () => {
    const v = !petOn; setPetOn(v);
    DeviceEventEmitter.emit(PET_VISIBLE_EVENT, v);
    await setPetVisible(v);
  };
  // v1.127.0: перенос прогресса между установками (веб/старый APK/Play — разные хранилища)
  const [transferMode, setTransferMode] = React.useState<'none' | 'export' | 'import'>('none');
  const [exportCode, setExportCode] = React.useState('');
  const [importText, setImportText] = React.useState('');
  const openExport = async () => { setExportCode(await exportProgress()); setTransferMode('export'); };
  const copyExport = async () => {
    try { await (navigator as any)?.clipboard?.writeText(exportCode); Alert.alert(t('copied')); }
    catch { Alert.alert(t('copyManually')); }
  };
  const doImport = async () => {
    const r = await importProgress(importText);
    if (r.ok) {
      Alert.alert(
        t('storyDone'),
        t('importDoneMsg').replace('{n}', String(r.count))
      );
      setTransferMode('none'); setImportText('');
    } else {
      // Код причины в скобках — по скрину алерта сразу видно класс проблемы
      // (empty / bad-format / no-keys / исключение декодера).
      Alert.alert(t('importFailedTitle'), `${t('importFailedBody')}\n(${r.error || '?'})`);
    }
  };
  // v1.26.0: локальные напоминания
  const [reminders, setReminders] = React.useState<ReminderSettings>(DEFAULT_REMINDERS);
  React.useEffect(() => { loadReminderSettings().then(setReminders); }, []);
  const applyAndSaveReminders = async (next: ReminderSettings) => {
    setReminders(next); await saveReminderSettings(next); await applyReminders(next, language);
  };
  const toggleReminder = async (slot: 'morning' | 'evening') => {
    const turningOn = !reminders[slot];
    if (turningOn && !(await requestReminderPermission())) {
      Alert.alert(
        t('alert_permission_needed'),
        t('msg_allow_notifications')
      );
      return;
    }
    await applyAndSaveReminders({ ...reminders, [slot]: turningOn });
  };
  const setReminderHour = (slot: 'morning' | 'evening', hour: number) =>
    applyAndSaveReminders({ ...reminders, [slot === 'morning' ? 'morningHour' : 'eveningHour']: hour });
  const replayOnboarding = async () => {
    try { await AsyncStorage.removeItem('psygames_onboarded'); } catch {}
    router.push('/onboarding' as any);
  };

  // v1.15.0: Backup / Restore прогресса.
  // v1.30.7: в Tauri-webview (Android/Mac/Win) blob-скачивание и <input type=file> молча НЕ
  // работают (вебвью без download-менеджера → кнопка «ничего не делает»). Там идём через
  // буфер обмена: экспорт = копируем весь JSON, импорт = читаем из буфера. Браузер — как раньше.
  const inTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const handleExportBackup = async () => {
    try {
      const json = await buildBackupJSON('1.15.0');
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      // 1. Web Share с файлом — надёжно на Android (системный «Поделиться» → Файлы/Drive/почта).
      //    Именно поэтому кнопка «молчала» на телефоне: blob-скачивание в Android-вебвью не срабатывает.
      try {
        const file = new File([json], 'psygames-backup.json', { type: 'application/json' });
        if (nav?.canShare && nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: 'PsyGames backup' });
          return;
        }
      } catch (e: any) { if (e?.name === 'AbortError') return; }   // юзер закрыл шит — это ок
      // 2. Десктоп-браузер — скачивание файла .json (как раньше).
      const isMobileUA = /Android|iPhone|iPad|iPod/i.test(nav?.userAgent || '');
      if (Platform.OS === 'web' && !inTauri && !isMobileUA) {
        await downloadBackup('1.15.0');
        return;
      }
      // 3. Резерв — буфер обмена.
      let copied = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(json);
          copied = true;
        }
      } catch {}
      Alert.alert(
        copied ? t('alert_backup_copied')
               : t('alert_backup'),
        copied
          ? t('msg_backup_copied_full')
          : t('msg_clipboard_copy_failed')
      );
    } catch (e: any) {
      Alert.alert(
        t('alert_export_error'),
        e?.message || t('msg_backup_create_failed')
      );
    }
  };
  const handleImportBackup = async () => {
    const okMsg = (restored: number) => Alert.alert(
      t('alert_backup_restored'),
      t('backupRestoredMsg').replace('{n}', String(restored))
    );
    try {
      if (Platform.OS === 'web' && !inTauri) {
        const { restored } = await pickAndRestoreBackup();
        okMsg(restored);
        return;
      }
      // Tauri/native → восстановление из буфера обмена (парно к экспорту-в-буфер)
      let text = '';
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) text = await navigator.clipboard.readText();
      } catch {}
      if (!text || !text.trim()) {
        Alert.alert(
          t('alert_restore_from_clipboard'),
          t('msg_paste_backup_json')
        );
        return;
      }
      const { restored } = await restoreBackupJSON(text);
      okMsg(restored);
    } catch (e: any) {
      Alert.alert(
        t('alert_import_error'),
        e?.message || t('msg_restore_failed')
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('settings')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
      {/* Profile Selector (E1) */}
      <View style={[styles.profileSection, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          👤 {t('label_profile')}
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          {t('desc_profile_section')}
        </Text>
        {/* Personal profiles (v1.3.0: section hidden when no personal profiles exist;
            kept as conditional render in case personal profiles return in the future) */}
        {allProfiles.some(p => !p.group || p.group === 'personal') && (
          <>
            <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>👥 {t('label_personal')}</Text>
            <View style={styles.profileGrid}>
              {allProfiles.filter(p => !p.group || p.group === 'personal').map((p) => {
                const active = p.id === profile.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.profileCard, {
                      width: profileCardWidth,
                      backgroundColor: active ? p.color : colors.card,
                      borderColor: active ? p.color : colors.border,
                      borderWidth: 2,
                    }]}
                    onPress={() => switchProfile(p.id)}
                  >
                    <Text style={styles.profileEmoji}>{p.emoji}</Text>
                    <Text style={[styles.profileName, { color: active ? '#000' : colors.text }]}>
                      {t('profileName_' + p.id)}
                    </Text>
                    <Text style={[styles.profileDesc, { color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary }]}
                      numberOfLines={2}>
                      {t('profileDesc_' + p.id)}
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
            {/* flexWrap: при системном крупном шрифте кнопка «Ввести код» не влезала в ряд
                с длинным лейблом → уезжала за край; перенос вместо выдавливания */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 4 }}>
              <Text style={[styles.groupLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0, flexShrink: 1, minWidth: 0 }]}>
                {UNLOCK_CODES_ENABLED
                  ? t('label_themed_codes_on')
                  : t('label_themed_codes_off')}
              </Text>
              {/* v1.15.0: «Ввести код» скрыт пока UNLOCK_CODES_ENABLED=false.
                  + App Store 3.1.1: на iOS скрыт всегда (CODE_ENTRY_ENABLED). */}
              {UNLOCK_CODES_ENABLED && CODE_ENTRY_ENABLED && (
                <TouchableOpacity onPress={() => setCodeModalOpen(true)} style={{ flexShrink: 0, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>🔑 {t('btn_enter_code')}</Text>
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
                      width: profileCardWidth,
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
                      {t('profileName_' + p.id)}
                    </Text>
                    <Text style={[styles.profileDesc, { color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary }]}
                      numberOfLines={2}>
                      {t('profileDesc_' + p.id)}
                    </Text>
                    {p.session_minutes && (
                      <Text style={{ fontSize: 9, color: active ? 'rgba(0,0,0,0.55)' : colors.textSecondary, marginTop: 2, fontFamily: 'monospace' }}>
                        ⏱ {p.session_minutes.replace('мин', t('unitMin'))}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {unlockedThemed.size > 0 && (
              <TouchableOpacity onPress={() => {
                Alert.alert(
                  t('alert_reset_unlocks'),
                  t('msg_reset_unlocks_confirm'),
                  [
                    { text: t('btn_cancel'), style: 'cancel' },
                    { text: t('btn_reset'), style: 'destructive', onPress: () => resetUnlocks() },
                  ]
                );
              }} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  {t('label_unlocked')}: {unlockedThemed.size} · 🗑 {t('btn_reset')}
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
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>🔑 {t('title_access_code')}</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
              {t('desc_enter_code')}
            </Text>
            <TextInput
              value={codeInput}
              onChangeText={(t) => { setCodeInput(t); setCodeError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('ph_code_example')}
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
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('btn_cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={tryRedeem}
                style={{ paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#10b981', borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('welcomeUnlock')}</Text>
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
                      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t('profileName_' + detailProfile.id)}</Text>
                      {detailProfile.audience && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>👥 {language === 'ru' ? detailProfile.audience : (detailProfile.audience_en ?? detailProfile.audience)}</Text>
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
                      {language === 'ru' ? detailProfile.sales_hook : (detailProfile.sales_hook_en ?? detailProfile.sales_hook)}
                    </Text>
                  </View>
                )}

                {/* Long description */}
                {detailProfile.long_description && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 }}>
                    {language === 'ru' ? detailProfile.long_description : (detailProfile.long_description_en ?? detailProfile.long_description)}
                  </Text>
                )}

                {/* Metadata row */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {detailProfile.session_minutes && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>⏱ {language === 'ru' ? detailProfile.session_minutes : detailProfile.session_minutes.replace('мин', 'min')}</Text>
                    </View>
                  )}
                  {detailProfile.warmup_enabled && (
                    <View style={{ backgroundColor: colors.card, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }}>
                      <Text style={{ fontSize: 11, color: colors.text }}>☀️ {t('badge_morning_warmup')}</Text>
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
                  🎮 {detailProfile.allowed_games === 'all'
                    ? t('label_all_48_games')
                    : t('exercisesInProfile').replace('{n}', String((detailProfile.allowed_games as string[]).length))}
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
                    {t('desc_full_library')}
                  </Text>
                )}

                {/* Action buttons */}
                {!isAccessible(detailProfile.id) && (
                  isComingSoon(detailProfile.id) ? (
                    /* v1.16.0: free-trial этап — кодов нет, профиль откроется после запуска.
                       НЕ показываем код-кнопки (тупик), показываем «Скоро» + что доступно сейчас. */
                    <View style={{ gap: 8, backgroundColor: colors.card, borderRadius: 12, padding: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' }}>🔒 {t('label_coming_soon')}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 }}>
                        {t('comingSoonBody')}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {/* App Store 3.1.1: на iOS ввод кода скрыт (CODE_ENTRY_ENABLED) */}
                      {CODE_ENTRY_ENABLED && (
                      <TouchableOpacity
                        onPress={() => { setDetailProfile(null); setCodeModalOpen(true); }}
                        style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>🔑 {t('btn_already_have_code')}</Text>
                      </TouchableOpacity>
                      )}
                      {/* v1.30.2: запрос кода в Telegram скрыт в App-Store-режиме (anti-steering). */}
                      {MONETIZATION_ENABLED && (
                        <>
                          <TouchableOpacity
                            onPress={() => requestCodeViaTelegram(detailProfile)}
                            style={{ backgroundColor: '#0088cc', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                          >
                            <Ionicons name="paper-plane" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('requestCodeFrom').replace('{tg}', OWNER_TG)}</Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 16 }}>
                            {t('requestCodeHint')}
                          </Text>
                        </>
                      )}
                    </View>
                  )
                )}

                {/* Если уже разблокирован — кнопка «Активировать» */}
                {!!isAccessible(detailProfile.id) && detailProfile.id !== profile.id && (
                  <TouchableOpacity
                    onPress={() => { switchProfile(detailProfile.id); setDetailProfile(null); }}
                    style={{ backgroundColor: detailProfile.color, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#000', fontWeight: '800', fontSize: 15 }}>✓ {t('btn_switch_to_profile')}</Text>
                  </TouchableOpacity>
                )}
                {detailProfile.id === profile.id && (
                  <View style={{ backgroundColor: detailProfile.color + '33', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>✓ {t('label_current_profile')}</Text>
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
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('label_sound')}</Text>
          </View>
          <Switch value={soundOn} onValueChange={toggleSound} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* Music (S1) — мягкая фоновая музыка меню, opt-in */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name={musicOn ? 'musical-notes' : 'musical-notes-outline'} size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('music')}</Text>
          </View>
          <Switch value={musicOn} onValueChange={toggleMusic} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* Haptic */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="phone-portrait-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('label_vibration')}</Text>
          </View>
          <Switch value={hapticOn} onValueChange={toggleHaptic} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* A1: колор-блайнд режим — игры с цвет-идентичностью берут различимую палитру */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="eye-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('colorblindMode')}</Text>
          </View>
          <Switch value={colorblind} onValueChange={setColorblind} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* v1.125.0: галочка «Чат с разработчиками» — тестировщик может скрыть плавающую
            кнопку фидбека, если мешает в игре (репорт «кнопка мешается»). */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('devChatToggle')}</Text>
          </View>
          <Switch value={devChatOn} onValueChange={toggleDevChat} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* Гуляющий питомец «Синапс» — паттерн тот же, что у чата (кому-то
            любое движение на экране мешает), но тумблер НЕЗАВИСИМЫЙ:
            прячет только прогулки, экран /pet и аватар в шапке остаются */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="paw-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('petSynapse')}</Text>
          </View>
          <Switch value={petOn} onValueChange={togglePet} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
        {/* Ползунок размера гуляющего питомца (0.6×..1.8×). Живое превью:
            питомец гуляет прямо на этом экране и меняется под пальцем;
            в хранилище значение уходит на отпускание. Свой мини-слайдер на
            PanResponder — зависимость ради одного ползунка не тащим. */}
        {petOn && (
          <View style={[styles.settingItem, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
            <View style={[styles.settingInfo, { justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="resize-outline" size={24} color={colors.primary} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>{t('petSize')}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {Math.round(petScale * 100)}%
              </Text>
            </View>
            <View
              {...petPan.panHandlers}
              onLayout={(e) => { petTrackW.current = Math.max(1, e.nativeEvent.layout.width); }}
              style={{ height: 32, justifyContent: 'center' }}
            >
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }} />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                  width: `${((petScale - PET_SCALE_MIN) / (PET_SCALE_MAX - PET_SCALE_MIN)) * 100}%`,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: `${((petScale - PET_SCALE_MIN) / (PET_SCALE_MAX - PET_SCALE_MIN)) * 100}%`,
                  marginLeft: -11,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: colors.primary,
                  borderWidth: 2.5,
                  borderColor: '#FFFFFF',
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 3,
                }}
              />
            </View>
          </View>
        )}
        {/* v1.127.0: перенос прогресса между установками (веб / старый APK / Play —
            изолированные хранилища). Экспорт-код на старом → импорт на новом. */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text, flexShrink: 1 }]}>{t('transferProgress')}</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }}>
            {t('transferProgressHint')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={openExport} style={{ flexGrow: 1, minWidth: 0, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('exportGetCode')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTransferMode('import')} style={{ flexGrow: 1, minWidth: 0, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('importPasteCode')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reminders — local notifications (native only; web/Tauri can't schedule) */}
        {Platform.OS !== 'web' && (
          <View style={[styles.settingItem, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch', gap: 12 }]}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications-outline" size={24} color={colors.primary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('label_reminders')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {/* flexShrink+minWidth: длинная подпись при крупном шрифте не выталкивает Switch */}
              <Text style={{ color: colors.text, fontSize: 15, flexShrink: 1, minWidth: 0 }}>{t('label_reminder_warmup')}</Text>
              <Switch value={reminders.morning} onValueChange={() => toggleReminder('morning')} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
            </View>
            {reminders.morning && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[7, 8, 9, 10].map((h) => (
                  <TouchableOpacity key={h} onPress={() => setReminderHour('morning', h)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: reminders.morningHour === h ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: reminders.morningHour === h ? '#FFF' : colors.text, fontWeight: '700' }}>{('0' + h).slice(-2)}:00</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {/* flexShrink+minWidth: длинная подпись при крупном шрифте не выталкивает Switch */}
              <Text style={{ color: colors.text, fontSize: 15, flexShrink: 1, minWidth: 0 }}>{t('label_reminder_sleep')}</Text>
              <Switch value={reminders.evening} onValueChange={() => toggleReminder('evening')} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
            </View>
            {reminders.evening && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[21, 22, 23].map((h) => (
                  <TouchableOpacity key={h} onPress={() => setReminderHour('evening', h)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: reminders.eveningHour === h ? colors.primary : colors.background, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: reminders.eveningHour === h ? '#FFF' : colors.text, fontWeight: '700' }}>{h}:00</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Language */}
        <View style={[styles.settingItem, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={styles.settingInfo}>
            <Ionicons name="language" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('language')}
            </Text>
          </View>
          <View style={[styles.languageButtons, { flexWrap: 'wrap', gap: 8 }]}>
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
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('a11yAchievements')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        {/* v1.148: история версий + проверка обновлений (запрос Дениса) */}
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={() => router.push('/whats-new' as any)}>
          <View style={styles.settingInfo}>
            <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('versionHistory')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={replayOnboarding}>
          <View style={styles.settingInfo}>
            <Ionicons name="play-circle-outline" size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('btn_replay_tutorial')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* v1.15.0: Backup / Restore прогресса */}
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={handleExportBackup}>
          <View style={styles.settingInfo}>
            <Ionicons name="cloud-download-outline" size={24} color="#22c55e" />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('btn_save_backup')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.surface }]} onPress={handleImportBackup}>
          <View style={styles.settingInfo}>
            <Ionicons name="cloud-upload-outline" size={24} color="#3b82f6" />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('btn_restore_backup')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={[styles.appName, { color: colors.textSecondary }]}>PsyGames v{Constants.expoConfig?.version ?? ''} · {profile.emoji} {t('profileName_' + profile.id)} · {t('label_validated_paradigms')}</Text>
        <Text style={[styles.appVersion, { color: colors.textSecondary }]}>{MONETIZATION_ENABLED
          ? t('hint_profile_tap_telegram')
          : t('hint_profile_tap_unlock')}</Text>
      </View>
      </ScrollView>

      {/* v1.127.0: модалка переноса прогресса (экспорт-код / импорт-код) */}
      <Modal visible={transferMode !== 'none'} animationType="fade" transparent onRequestClose={() => setTransferMode('none')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 18, padding: 20, gap: 14 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
              {transferMode === 'export'
                ? t('progressCodeTitle')
                : t('pasteCodeTitle')}
            </Text>
            {transferMode === 'export' ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }}>
                  {t('exportCodeHint')}
                </Text>
                <TextInput
                  value={exportCode}
                  editable={false}
                  multiline
                  selectTextOnFocus
                  style={{ color: colors.text, backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 11, maxHeight: 180, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={copyExport} style={{ flexGrow: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('copy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTransferMode('none')} style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{t('close')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  value={importText}
                  onChangeText={setImportText}
                  multiline
                  placeholder={t('pasteCodePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={{ color: colors.text, backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 11, minHeight: 100, maxHeight: 180, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={doImport} style={{ flexGrow: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('apply')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setTransferMode('none'); setImportText(''); }} style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{t('btn_cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    // v1.148: зазор иконка↔текст (репорт Rulon «текст прилипает к иконкам»)
    gap: 12,
    // при системном крупном шрифте длинная подпись выдавливала Switch за край —
    // flexShrink+minWidth даёт блоку с текстом ужаться, а не толкать переключатель
    flexShrink: 1,
    minWidth: 0,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
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
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 28,
    paddingHorizontal: 20,
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
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  profileEmoji: { fontSize: 32 },
  profileName: { fontSize: 14, fontWeight: '700' },
  profileDesc: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
});
