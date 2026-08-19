/**
 * Экран выбора зарядки — одна кнопка на главной вместо двух карточек.
 *
 * ЗАЧЕМ (замысел Дениса 02.08). Раньше на главной жили «Утренняя зарядка» и
 * «Вечерний комплекс» рядом, и одна из них всегда была не к месту: утром никто
 * не идёт в вечерний набор. Теперь кнопка одна, подпись меняется по часам, а по
 * тапу открывается этот экран: нужный по времени набор УЖЕ выбран, но остальные
 * видны и берутся одним касанием.
 *
 * Почему именно так, а не переключение молча по часам: если показывать только
 * набор «по времени», человек может никогда не узнать, что существуют другие —
 * а вечерний комплекс появился по прямой просьбе тестировщицы. Предвыбор плюс
 * видимые альтернативы решают обе задачи разом.
 *
 * ЧТО ЗДЕСЬ ОСОБЕННОГО. «Не спится» — не тренировка: у неё нет очков, стрика и
 * итогового экрана, и на карточке это написано прямо. Обещать тренировку тому,
 * кто открыл приложение в три ночи, потому что не может заснуть, — обман.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { isGameAllowed } from '@/src/constants/profiles';
import { useWarmup } from '@/src/contexts/WarmupContext';
import {
  WarmupSlot, currentSlot, isTrainingSlot,
  buildDayPlaylist, buildNightPlaylist, buildEveningWarmupPlaylist,
  buildFixedPlaylist, buildMorningWarmupPlaylist, getCurrentWeekday,
} from '@/src/services/warmup';
import { a11yBtn, a11yModal } from '@/src/services/a11y';
import { goBackOrHome } from '@/src/utils/nav';

const ORDER: WarmupSlot[] = ['morning', 'day', 'evening', 'night'];

const ICON: Record<WarmupSlot, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  day: 'partly-sunny-outline',
  evening: 'moon-outline',
  night: 'bed-outline',
};

/** Своя палитра у каждого слота — время суток должно читаться до текста. */
const TINT: Record<WarmupSlot, [string, string]> = {
  morning: ['#f7b733', '#fc4a1a'],
  day:     ['#43cea2', '#185a9d'],
  evening: ['#7b4397', '#dc2430'],
  night:   ['#2c3e50', '#4ca1af'],
};

export default function WarmupPicker() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const warmup = useWarmup();

  // Предвыбор по часам. Считаем ОДИН раз при открытии: если человек сидит на
  // экране в 17:59, переключать выбор у него под пальцем нельзя.
  const [picked, setPickedRaw] = React.useState<WarmupSlot>(() => currentSlot());
  const [helpOpen, setHelpOpen] = React.useState(false);

  const wd = getCurrentWeekday();

  /** Сколько шагов и минут в наборе — показываем на карточке, чтобы выбор был осознанным. */
  const metaFor = React.useCallback((slot: WarmupSlot) => {
    switch (slot) {
      case 'day':   return buildDayPlaylist(wd, (g: string) => isGameAllowed(profile, g));
      case 'night': return buildNightPlaylist(wd);
      case 'evening': {
        const morning = profile.morning_playlist?.length
          ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, (g: string) => isGameAllowed(profile, g))
          : buildMorningWarmupPlaylist({ duration: 5, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
        return buildEveningWarmupPlaylist({
          weekday: wd,
          excludeGameIds: morning.steps.map((s) => s.game_id),
          profileEvening: profile.evening_playlist,
          // ⚠️ Фильтр был потерян ИМЕННО ЗДЕСЬ, в предпросмотре: сам запуск
          // (WarmupContext) его передаёт. Карточка обещала пять шагов, набор
          // шёл из трёх — расхождение читается как поломка счётчика.
          allow: (g: string) => isGameAllowed(profile, g),
        });
      }
      default:
        return profile.morning_playlist?.length
          ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, (g: string) => isGameAllowed(profile, g))
          : buildMorningWarmupPlaylist({ duration: 5, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
    }
  }, [wd, profile]);

  // Пустой набор — не выбор. Среда у нас день отдыха, и утренний плейлист в этот
  // день пуст; предвыбранное по часам «Утро» показывало бы «0 игр», а «Начать»
  // уводило бы сразу на экран завершения. Пустые слоты гасим и не даём выбрать,
  // а предвыбор при необходимости сдвигаем на ближайший непустой.
  const isEmpty = React.useCallback((slot: WarmupSlot) => metaFor(slot).steps.length === 0, [metaFor]);
  const setPicked = (slot: WarmupSlot) => { if (!isEmpty(slot)) setPickedRaw(slot); };

  React.useEffect(() => {
    if (!isEmpty(picked)) return;
    const fallback = ORDER.find((sl) => !isEmpty(sl));
    if (fallback) setPickedRaw(fallback);
  }, [picked, isEmpty]);

  const launch = () => {
    if (isEmpty(picked)) return;   // страховка: кнопка и так заблокирована
    switch (picked) {
      case 'day':     warmup.startDay(); break;
      case 'night':   warmup.startNight(); break;
      case 'evening': warmup.startEvening(); break;
      default:        warmup.startWarmup(5); break;
    }
  };

  const narrow = width < 380;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <TouchableOpacity {...a11yBtn(t('a11yBack'))} onPress={goBackOrHome} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('warmupPickerTitle')}</Text>
        <View style={styles.backBtn} />
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('warmupPickerHint')}</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {ORDER.map((slot) => {
          const on = picked === slot;
          const meta = metaFor(slot);
          const empty = meta.steps.length === 0;
          const mins = Math.max(1, Math.round(meta.est_total_sec / 60));
          return (
            <TouchableOpacity
              key={slot}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1))}. ${t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1) + 'Desc')}`}
              onPress={() => setPicked(slot)}
              disabled={empty}
              activeOpacity={0.85}
              style={[styles.card, {
                opacity: empty ? 0.45 : 1,
                backgroundColor: colors.surface,
                borderColor: on ? TINT[slot][0] : colors.border,
                borderWidth: on ? 2 : 1,
              }]}
            >
              <View style={[styles.icon, { backgroundColor: TINT[slot][0] + '22' }]}>
                <Ionicons name={ICON[slot]} size={narrow ? 20 : 24} color={TINT[slot][0]} />
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1))}
                </Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                  {t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1) + 'Desc')}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  {empty ? t('restDay') : `${t('unitGames')}: ${meta.steps.length} · ~${mins} ${t('unitMin')}`}
                </Text>
                {/* Пишем это на самой карточке, а не мелким шрифтом внизу экрана:
                    человек должен понимать до запуска, что стрик тут не растёт. */}
                {!isTrainingSlot(slot) && (
                  <Text style={[styles.cardNote, { color: TINT[slot][1] }]}>{t('slotNightNote')}</Text>
                )}
              </View>
              {on && <Ionicons name="checkmark-circle" size={22} color={TINT[slot][0]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Нижний тулбар — как на экране «Об игре»: слева справка, справа запуск. */}
      <View style={[styles.bar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        {/* Справка — модалкой, а НЕ отдельным маршрутом. Новый экран пришлось бы
            заводить в роутере, и промах в адресе даёт «Unmatched Route» вместо
            справки — этим уже обожглись на совете Синапса (v1.174). */}
        <TouchableOpacity
          {...a11yBtn(t('btn_help'))}
          onPress={() => setHelpOpen(true)}
          style={[styles.helpBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="help-circle-outline" size={18} color={colors.text} />
          <Text style={[styles.helpText, { color: colors.text }]}>{t('btn_help')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          {...a11yBtn(t('start'))}
          onPress={launch}
          disabled={metaFor(picked).steps.length === 0}
          style={[styles.startBtn, {
            backgroundColor: TINT[picked][0],
            opacity: metaFor(picked).steps.length === 0 ? 0.5 : 1,
          }]}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.startText}>{t('start')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <View {...a11yModal} style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('warmupPickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {ORDER.map((slot) => (
                <View key={slot} style={styles.sheetRow}>
                  <Ionicons name={ICON[slot]} size={18} color={TINT[slot][0]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.sheetName, { color: colors.text }]}>
                      {t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1))}
                    </Text>
                    <Text style={[styles.sheetDesc, { color: colors.textSecondary }]}>
                      {t('slot' + slot.charAt(0).toUpperCase() + slot.slice(1) + 'Desc')}
                      {!isTrainingSlot(slot) ? ' — ' + t('slotNightNote') : ''}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>{t('warmupPickerHint')}</Text>
            </ScrollView>
            <TouchableOpacity {...a11yBtn(t('setGotIt'))} onPress={() => setHelpOpen(false)}
              style={[styles.sheetBtn, { backgroundColor: TINT[picked][0] }]}>
              <Text style={styles.startText}>{t('setGotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  backBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  hint: { fontSize: 12.5, textAlign: 'center', paddingHorizontal: 24, marginTop: 2, marginBottom: 10, lineHeight: 17 },
  list: { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 15.5, fontWeight: '800' },
  cardDesc: { fontSize: 12.5, lineHeight: 17 },
  cardMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  cardNote: { fontSize: 11.5, fontWeight: '700', marginTop: 3, lineHeight: 15 },
  bar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1 },
  helpBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1 },
  helpText: { fontSize: 14, fontWeight: '700' },
  startBtn: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 16 },
  startText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 460, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sheetRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 },
  sheetName: { fontSize: 14, fontWeight: '800' },
  sheetDesc: { fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  sheetHint: { fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' },
  sheetBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 14 },
});
