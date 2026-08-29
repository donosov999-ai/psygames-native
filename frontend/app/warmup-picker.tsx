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
  getFinancialCooldown,
} from '@/src/services/warmup';
import { getAssessmentStatus } from '@/src/services/assessment';
import { SERIES_KEYS, SeriesKey, seriesPlaylist, seriesProfileFlag, seriesKind, seriesBlockCount, seriesGameId, launchPlanFor } from '@/src/services/warmupEntries';
import { a11yBtn, a11yModal } from '@/src/services/a11y';
import { goBackOrHome } from '@/src/utils/nav';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAMES } from '@/src/constants/games';

const ORDER: WarmupSlot[] = ['morning', 'day', 'evening', 'night'];

/**
 * СЕРИИ — второй раздел этого же экрана (v1.232, решение Дениса 23.08.2026:
 * «перенести в зарядку всё, что идёт сериями»).
 *
 * Почему они здесь, а не отдельными карточками на главной, где жили раньше:
 * «Оценка» и FIN BRAIN — не игры, а ПОСЛЕДОВАТЕЛЬНОСТИ игр с общим прогоном и
 * одним итогом. Это ровно то, чем является зарядка, и крутятся они на том же
 * движке (`WarmupContext`). Два входа в один движок — это не выбор, а лишний
 * вопрос человеку; вход стал один.
 *
 * ⚠️ ЧЕМ СЕРИЯ ОТЛИЧАЕТСЯ ОТ СЛОТА, и это написано на карточке. Слот — разминка
 * по времени суток, состав в нём плавает. Серия — ЗАМЕР: состав фиксирован, и
 * менять его нельзя, иначе замеры разных дней несравнимы.
 */
type PickKey = WarmupSlot | SeriesKey;

const ICON: Record<PickKey, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  day: 'partly-sunny-outline',
  evening: 'moon-outline',
  night: 'bed-outline',
  assessment: 'analytics-outline',
  financial: 'trending-up-outline',
  'schulte-blocks': 'grid-outline',
  'proofreading-blocks': 'text-outline',
  'chess-blocks': 'apps-outline',
};

/** Своя палитра у каждого слота — время суток должно читаться до текста. */
const TINT: Record<PickKey, [string, string]> = {
  morning: ['#f7b733', '#fc4a1a'],
  day:     ['#43cea2', '#185a9d'],
  evening: ['#7b4397', '#dc2430'],
  night:   ['#2c3e50', '#4ca1af'],
  assessment: ['#7c3aed', '#ec4899'],
  financial:  ['#22c55e', '#0d9488'],
  'schulte-blocks':      ['#0ea5e9', '#4338ca'],
  'proofreading-blocks': ['#f59e0b', '#b45309'],
  'chess-blocks':        ['#64748b', '#1e293b'],
};

const isSeries = (k: PickKey): k is SeriesKey => (SERIES_KEYS as readonly string[]).includes(k);

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
  const [picked, setPickedRaw] = React.useState<PickKey>(() => currentSlot());
  /**
   * З1 (29.08.2026): выбор длительности утра вернулся. Селектор 5/10/15 пропал
   * при схлопывании карточек в одну кнопку (setDuration остался без вызовов), и
   * кнопка всегда запускала 5 минут — а при 5 утро выдаёт только ядро-снимок,
   * то есть недельная сетка тренировок была недостижима из приложения.
   * Выбор запоминается: завтра зарядка стартует той же длины без лишнего тапа.
   */
  const [mDur, setMDur] = React.useState<5 | 10 | 15>(5);
  React.useEffect(() => {
    AsyncStorage.getItem('psygames_warmup_duration')
      .then((v) => { const n = Number(v); if (n === 10 || n === 15) setMDur(n as 10 | 15); })
      .catch(() => {});
  }, []);
  const pickDur = (d: 5 | 10 | 15) => {
    setMDur(d);
    AsyncStorage.setItem('psygames_warmup_duration', String(d)).catch(() => {});
  };
  const [helpOpen, setHelpOpen] = React.useState(false);
  // Состояние серий приехало сюда вместе с карточками с главной.
  const [finCooldown, setFinCooldown] = React.useState<{ ready: boolean; daysLeft: number }>({ ready: true, daysLeft: 0 });
  const [assessDays, setAssessDays] = React.useState<number | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const fc = await getFinancialCooldown().catch(() => null);
      const as = await getAssessmentStatus().catch(() => null);
      if (!alive) return;
      if (fc) setFinCooldown({ ready: fc.ready, daysLeft: fc.daysLeft });
      if (as) setAssessDays(as.hasAssessment ? as.daysSince : null);
    })();
    return () => { alive = false; };
  }, []);

  /** Какие серии доступны профилю. Гейт тот же, что был на главной. */
  const seriesShown = React.useMemo(
    () => SERIES_KEYS.filter((k) => {
      const flag = seriesProfileFlag(k);
      // Серия блоков — обычная игра, своего флага у неё нет; спрашиваем каталог профиля.
      if (!flag) { const id = seriesGameId(k); return id ? isGameAllowed(profile, id) : false; }
      return Boolean((profile as any)[flag]);
    }),
    [profile.assessment_enabled, profile.financial_brain_day_enabled],
  );

  const wd = getCurrentWeekday();

  /** Сколько шагов и минут в наборе — показываем на карточке, чтобы выбор был осознанным. */
  const metaFor = React.useCallback((slot: PickKey) => {
    switch (slot) {
      case 'assessment':
      case 'financial':  return seriesPlaylist(slot)!;
      case 'day':   return buildDayPlaylist(wd, (g: string) => isGameAllowed(profile, g));
      case 'night': return buildNightPlaylist(wd);
      case 'evening': {
        const morning = profile.morning_playlist?.length
          ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, (g: string) => isGameAllowed(profile, g))
          : buildMorningWarmupPlaylist({ duration: 15, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
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
          : buildMorningWarmupPlaylist({ duration: mDur, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
    }
  }, [wd, profile, mDur]);

  // Пустой набор — не выбор. Среда у нас день отдыха, и утренний плейлист в этот
  // день пуст; предвыбранное по часам «Утро» показывало бы «0 игр», а «Начать»
  // уводило бы сразу на экран завершения. Пустые слоты гасим и не даём выбрать,
  // а предвыбор при необходимости сдвигаем на ближайший непустой.
  //
  // ⚠️ У СЕРИИ «ПУСТО» ЗНАЧИТ ДРУГОЕ. Набор оценки и финансовой батареи задан
  // жёстко и пустым не бывает — недоступной серию делает ОСТЫВАНИЕ: FIN BRAIN
  // повторяют не раньше чем через положенный срок, иначе замер меряет память о
  // прошлом прогоне, а не решения. Внешне это то же самое: карточка гаснет и не
  // берётся, а на ней написано, сколько ждать.
  const isEmpty = React.useCallback((slot: PickKey) => {
    if (slot === 'financial') return !finCooldown.ready;
    if (slot === 'assessment') return false;
    if (isSeries(slot)) return false;   // серия блоков всегда доступна: остывания у неё нет
    return metaFor(slot).steps.length === 0;
  }, [metaFor, finCooldown.ready]);
  const setPicked = (slot: PickKey) => { if (!isEmpty(slot)) setPickedRaw(slot); };

  React.useEffect(() => {
    if (!isEmpty(picked)) return;
    const fallback = ORDER.find((sl) => !isEmpty(sl));
    if (fallback) setPickedRaw(fallback);
  }, [picked, isEmpty]);

  const launch = () => {
    if (isEmpty(picked)) return;   // страховка: кнопка и так заблокирована
    /**
     * 🔴 СЕРИИ РАЗБИРАЮТСЯ ПО РЕЕСТРУ, А НЕ СПИСКОМ `case`. Здесь стояли ровно два
     * ключа серий блоков — `schulte-blocks` и `proofreading-blocks`, — а в реестре
     * их три. Третья, `chess-blocks`, проваливалась в `default` и запускала обычную
     * зарядку из пяти игр вместо серии. Репорт Дениса 23.08.2026: «серия не
     * запускается по кнопке, слепые шахматы запускает [не то]».
     * ⚠️ Список `case` — ручная копия реестра, и расходится она молча. Теперь
     * ветка выбирается по `seriesKind`, и новая серия работает без правки экрана.
     */
    if ((SERIES_KEYS as readonly string[]).includes(picked)) {
      const plan = launchPlanFor(picked as SeriesKey);
      // Серия блоков — одна игра, её ведёт сам экран игры. `auto=1`, а не `wu=1`:
      // разбор в шапке `services/warmupEntries`.
      if (plan.kind === 'playlist') (warmup[plan.starter] as () => void)();
      else router.push({ pathname: plan.pathname as any, params: plan.params });
      return;
    }
    switch (picked) {
      case 'day':     warmup.startDay(); break;
      case 'night':   warmup.startNight(); break;
      case 'evening': warmup.startEvening(); break;
      default:        warmup.startWarmup(mDur); break;
    }
  };

  /** Заголовок и подпись карточки: у слотов они из словаря слотов, у серий — свои. */
  const cap = (k: WarmupSlot) => 'slot' + k.charAt(0).toUpperCase() + k.slice(1);
  const titleOf = (k: PickKey) => {
    if (k === 'assessment') return t('complexAssessment');
    if (k === 'financial') return 'FIN BRAIN';
    if (k === 'schulte-blocks') return t('schulteTable');
    if (k === 'proofreading-blocks') return t('proofreading');
    if (k === 'chess-blocks') return t('chessBlind');
    return t(cap(k as WarmupSlot));
  };
  const descOf = (k: PickKey) => {
    if (k === 'assessment') return t('assessmentMeta');
    if (k === 'financial') return t('finBrainMeta');
    if (isSeries(k) && seriesKind(k) === 'blocks') return t('seriesBlocksMeta');
    return t(cap(k as WarmupSlot) + 'Desc');
  };

  const narrow = width < 380;

  const renderCard = (slot: PickKey) => {
    const on = picked === slot;
    const meta = isSeries(slot) && seriesKind(slot) === 'blocks' ? { steps: [], est_total_sec: 0 } as any : metaFor(slot);
    const off = isEmpty(slot);
    const mins = Math.max(1, Math.round(meta.est_total_sec / 60));
    const series = isSeries(slot);
    return (
      <TouchableOpacity
        key={slot}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${titleOf(slot)}. ${descOf(slot)}`}
        onPress={() => setPicked(slot)}
        disabled={off}
        activeOpacity={0.85}
        style={[styles.card, {
          opacity: off ? 0.45 : 1,
          backgroundColor: colors.surface,
          borderColor: on ? TINT[slot][0] : colors.border,
          borderWidth: on ? 2 : 1,
        }]}
      >
        <View style={[styles.icon, { backgroundColor: TINT[slot][0] + '22' }]}>
          <Ionicons name={ICON[slot]} size={narrow ? 20 : 24} color={TINT[slot][0]} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{titleOf(slot)}</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{descOf(slot)}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {slot === 'financial' && !finCooldown.ready
              ? `${t('ctaWait')}: ${finCooldown.daysLeft}${t('unitDayShort')}`
              : series && seriesKind(slot as SeriesKey) === 'blocks'
                ? `${t('seriesBlocksCount')}: ${seriesBlockCount(slot as SeriesKey)}`
                : off
                  ? t('restDay')
                  : `${t('unitGames')}: ${meta.steps.length} · ~${mins} ${t('unitMin')}`}
          </Text>
          {/* Пишем это на самой карточке, а не мелким шрифтом внизу экрана:
              человек должен понимать до запуска, что стрик тут не растёт. */}
          {!series && !isTrainingSlot(slot as WarmupSlot) && (
            <Text style={[styles.cardNote, { color: TINT[slot][1] }]}>{t('slotNightNote')}</Text>
          )}
          {/* У серии своя приписка: состав фиксирован, иначе замеры разных дней
              несравнимы. Это не оговорка мелким шрифтом, а условие, на котором
              вся серия держится. */}
          {series && (
            <Text style={[styles.cardNote, { color: TINT[slot][1] }]}>
              {slot === 'assessment' && assessDays !== null ? `${t('seriesFixedNote')} · ${assessDays}${t('unitDayShort')}` : t('seriesFixedNote')}
            </Text>
          )}
          {/* З1: длительность утра — чипы прямо на карточке. Фикс-набору профиля
              длительность не управляется, там чипов нет. */}
          {slot === 'morning' && on && !profile.morning_playlist?.length && (
            <View style={styles.durRow}>
              {([5, 10, 15] as const).map((d) => (
                <TouchableOpacity
                  key={d}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: mDur === d }}
                  accessibilityLabel={`${d} ${t('unitMin')}`}
                  onPress={() => pickDur(d)}
                  style={[styles.durChip, {
                    backgroundColor: mDur === d ? TINT.morning[0] : 'transparent',
                    borderColor: mDur === d ? TINT.morning[0] : colors.border,
                  }]}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: mDur === d ? '#fff' : colors.text }}>
                    {d} {t('unitMin')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* З6: состав набора виден ДО старта. Только на выбранной карточке —
              иначе экран превращается в четыре простыни. Серии блоков без списка:
              их ведёт сама игра. */}
          {on && !off && !(series && seriesKind(slot as SeriesKey) === 'blocks') && meta.steps.length > 0 && (
            <View style={styles.stepsList}>
              {meta.steps.map((st: { game_id: string; est_duration_sec: number }, i: number) => {
                const g = GAMES.find((x) => x.id === st.game_id);
                return (
                  <Text key={`${st.game_id}-${i}`} style={[styles.stepLine, { color: colors.textSecondary }]} numberOfLines={1}>
                    {i + 1}. {g ? t(g.nameKey) : st.game_id} · ~{Math.max(1, Math.round(st.est_duration_sec / 60))} {t('unitMin')}
                  </Text>
                );
              })}
            </View>
          )}
        </View>
        {on && <Ionicons name="checkmark-circle" size={22} color={TINT[slot][0]} />}
      </TouchableOpacity>
    );
  };

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
        {ORDER.map(renderCard)}

        {seriesShown.length > 0 && (
          <View style={styles.groupHead}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{t('seriesGroup')}</Text>
            <Text style={[styles.groupNote, { color: colors.textSecondary }]}>{t('seriesGroupNote')}</Text>
          </View>
        )}
        {seriesShown.map(renderCard)}
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
  groupHead: { paddingTop: 18, paddingBottom: 6, gap: 2 },
  groupTitle: { fontSize: 15, fontWeight: '700' },
  groupNote: { fontSize: 12, lineHeight: 17 },
  cardNote: { fontSize: 11.5, fontWeight: '700', marginTop: 3, lineHeight: 15 },
  durRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  // 44 — минимум попадания пальцем (тап-таргет гейт поймал 34 на v2.7.0 и был прав)
  durChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepsList: { marginTop: 7, gap: 2 },
  stepLine: { fontSize: 11.5, lineHeight: 15.5 },
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
