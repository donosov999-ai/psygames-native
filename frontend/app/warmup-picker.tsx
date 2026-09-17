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
// 🔴 Свой тулбар с главной кнопкой обязан стоять НАД полосой вкладок: полоса —
// наложение поверх всего, и без этого отступа она легла бы на «Начать».
import { TAB_BAR_H } from '@/src/services/tabBar';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { isGameAllowed } from '@/src/constants/profiles';
import { useWarmup } from '@/src/contexts/WarmupContext';
import {
  WarmupSlot, currentSlot, isTrainingSlot,
  buildDayPlaylist, buildNightPlaylist, buildEveningWarmupPlaylist,
  buildFixedPlaylist, buildMorningWarmupPlaylist, getCurrentWeekday,
  getFinancialCooldown, длинаВлияет, buildСвояСерия, потокиНаборов, type Длительность,
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
/**
 * 🔴 СВОИ СЕРИИ ИЗ ФАЙЛА — ЗДЕСЬ ЖЕ, А НЕ В НИКУДА.
 *
 * Денис 13.09.2026: «не вижу, как новую серию создать можно?» и следом «режим
 * поток — это же серия вроде». Своя серия («поток» — одно узкое умение подряд)
 * заводится в редакторе и назначается профилю. До этой правки она никуда не
 * приезжала: файл её разбирал, а экранов, читающих поле `наборы`, было НОЛЬ.
 */
type СвояКлюч = `своя:${string}`;
type PickKey = WarmupSlot | SeriesKey | СвояКлюч;

const isСвоя = (k: string): k is СвояКлюч => k.startsWith('своя:');
/** Палитра и значок своих серий — общие: их может быть сколько угодно. */
const СВОЯ_TINT: [string, string] = ['#0ea5e9', '#7c3aed'];

const ICON: Record<WarmupSlot | SeriesKey, keyof typeof Ionicons.glyphMap> = {
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
const TINT_БАЗА: Record<WarmupSlot | SeriesKey, [string, string]> = {
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
const TINT = new Proxy(TINT_БАЗА as Record<string, [string, string]>, {
  get: (о, к: string) => о[к] ?? СВОЯ_TINT,
}) as Record<string, [string, string]>;
const значок = (k: PickKey): keyof typeof Ionicons.glyphMap =>
  isСвоя(k) ? 'flash-outline' : ICON[k as WarmupSlot | SeriesKey];

/** Где помнится выбранная длина каждого слота. Утро — прежним ключом. */
/** Где помнится выбранная длина своих потоков: { <ключ потока>: 5 | 10 | 15 }. */
const КЛЮЧ_ДЛИНЫ_ПОТОКОВ = 'psygames_own_series_length';

const КЛЮЧ_ДЛИНЫ: Record<WarmupSlot, string> = {
  morning: 'psygames_warmup_duration',
  day: 'psygames_warmup_duration_day',
  evening: 'psygames_warmup_duration_evening',
  night: 'psygames_warmup_duration_night',
};

export default function WarmupPicker() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { profile, составИзФайла } = useProfile();
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
  /**
   * 🔴 ДЛИНА — У ВСЕХ ЧЕТЫРЁХ СЛОТОВ, А НЕ ТОЛЬКО У УТРА.
   *
   * Денис 13.09.2026: «выбор длины зарядки нужно добавить во все 4 зарядки — это
   * ошибка, что доступно в приложении только для утра, ещё 3 шт пропущены».
   *
   * Длина запоминается ОТДЕЛЬНО НА КАЖДЫЙ СЛОТ, а не одной цифрой на всё: утром
   * человек берёт пятнадцать, ночью пять, и общая память тут же подсунула бы
   * пятнадцатиминутную ночь. Ключ утра остался прежним — иначе у всех, кто уже
   * выбрал длину, она бы молча сбросилась.
   */
  const [dur, setDur] = React.useState<Record<WarmupSlot, Длительность>>({ morning: 5, day: 5, evening: 5, night: 5 });
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const пары = await Promise.all(
        (Object.keys(КЛЮЧ_ДЛИНЫ) as WarmupSlot[]).map(async (sl) => {
          const v = await AsyncStorage.getItem(КЛЮЧ_ДЛИНЫ[sl]).catch(() => null);
          const n = Number(v);
          return [sl, (n === 10 || n === 15 ? n : 5) as Длительность] as const;
        }),
      );
      if (!alive) return;
      setDur((было) => ({ ...было, ...Object.fromEntries(пары) }));
    })();
    return () => { alive = false; };
  }, []);
  const pickDur = (sl: WarmupSlot, d: Длительность) => {
    setDur((было) => ({ ...было, [sl]: d }));
    AsyncStorage.setItem(КЛЮЧ_ДЛИНЫ[sl], String(d)).catch(() => {});
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

  /** Свои серии, назначенные этому профилю файлом настроек. */
  const мои = React.useMemo(() => {
    const ид = составИзФайла?.профили?.[profile.id]?.наборы ?? [];
    return (составИзФайла?.наборы ?? []).filter((н) => ид.includes(н.id));
  }, [составИзФайла, profile.id]);
  /**
   * 🔴 ПОТОК — ОДНОЙ КАРТОЧКОЙ С ПЕРЕКЛЮЧАТЕЛЕМ ДЛИНЫ (отчёт 5ff162e1, см. `потокиНаборов`).
   * Выбранная длина помнится по потоку: утром человек берёт «Рабочую память» на пятнадцать,
   * и завтра она откроется той же длины.
   */
  const потоки = React.useMemo(() => потокиНаборов(мои), [мои]);
  const [длинаПотока, setДлинаПотока] = React.useState<Record<string, Длительность>>({});
  React.useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(КЛЮЧ_ДЛИНЫ_ПОТОКОВ).then((v) => {
      if (!alive || !v) return;
      try { setДлинаПотока((было) => ({ ...JSON.parse(v), ...было })); } catch {}
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const выбратьДлинуПотока = (ключ: string, d: Длительность) => {
    setДлинаПотока((было) => {
      const стало = { ...было, [ключ]: d };
      AsyncStorage.setItem(КЛЮЧ_ДЛИНЫ_ПОТОКОВ, JSON.stringify(стало)).catch(() => {});
      return стало;
    });
  };
  const потокКарточки = React.useCallback((k: PickKey) => (
    isСвоя(k) ? потоки.find((п) => `своя:${п.ключ}` === k) ?? null : null
  ), [потоки]);
  const своя = React.useCallback((k: PickKey) => {
    const п = потокКарточки(k);
    if (!п) return null;
    return (п.варианты.find((в) => в.длина === длинаПотока[п.ключ]) ?? п.варианты[0]).набор;
  }, [потокКарточки, длинаПотока]);

  /** Сколько шагов и минут в наборе — показываем на карточке, чтобы выбор был осознанным. */
  const metaFor = React.useCallback((slot: PickKey) => {
    const н = своя(slot);
    if (н) return buildСвояСерия(н.название, н.шаги, wd);
    switch (slot) {
      case 'assessment':
      case 'financial':  return seriesPlaylist(slot)!;
      case 'day':   return buildDayPlaylist(wd, (g: string) => isGameAllowed(profile, g), dur.day);
      case 'night': return buildNightPlaylist(wd, dur.night);
      case 'evening': {
        const morning = profile.morning_playlist?.length
          ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, (g: string) => isGameAllowed(profile, g))
          : buildMorningWarmupPlaylist({ duration: 15, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
        return buildEveningWarmupPlaylist({
          weekday: wd,
          excludeGameIds: morning.steps.map((s) => s.game_id),
          profileEvening: profile.evening_playlist,
          duration: dur.evening,
          // ⚠️ Фильтр был потерян ИМЕННО ЗДЕСЬ, в предпросмотре: сам запуск
          // (WarmupContext) его передаёт. Карточка обещала пять шагов, набор
          // шёл из трёх — расхождение читается как поломка счётчика.
          allow: (g: string) => isGameAllowed(profile, g),
        });
      }
      default:
        return profile.morning_playlist?.length
          ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, (g: string) => isGameAllowed(profile, g))
          : buildMorningWarmupPlaylist({ duration: dur.morning, weekday: wd, profilePlaylists: profile.custom_playlists, allow: (g: string) => isGameAllowed(profile, g) });
    }
  }, [wd, profile, dur, своя]);

  /** Назван ли состав слота профилем целиком — тогда длина ничего не меняет. */
  const слотЗафиксирован = React.useCallback((slot: WarmupSlot) => (
    slot === 'morning' ? !!profile.morning_playlist?.length
      : slot === 'evening' ? !!profile.evening_playlist?.length
        : false
  ), [profile]);

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
    if (isСвоя(slot)) return metaFor(slot).steps.length === 0;
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
    const мояСерия = своя(picked);
    if (мояСерия) { warmup.startPlaylist(buildСвояСерия(мояСерия.название, мояСерия.шаги, wd)); return; }
    if ((SERIES_KEYS as readonly string[]).includes(picked)) {
      const plan = launchPlanFor(picked as SeriesKey);
      // Серия блоков — одна игра, её ведёт сам экран игры. `auto=1`, а не `wu=1`:
      // разбор в шапке `services/warmupEntries`.
      if (plan.kind === 'playlist') (warmup[plan.starter] as () => void)();
      else router.push({ pathname: plan.pathname as any, params: plan.params });
      return;
    }
    switch (picked) {
      case 'day':     warmup.startDay(dur.day); break;
      case 'night':   warmup.startNight(dur.night); break;
      case 'evening': warmup.startEvening(dur.evening); break;
      default:        warmup.startWarmup(dur.morning); break;
    }
  };

  /** Заголовок и подпись карточки: у слотов они из словаря слотов, у серий — свои. */
  const cap = (k: WarmupSlot) => 'slot' + k.charAt(0).toUpperCase() + k.slice(1);
  const titleOf = (k: PickKey) => {
    const п = потокКарточки(k);
    if (п) return п.название;
    if (k === 'assessment') return t('complexAssessment');
    if (k === 'financial') return 'FIN BRAIN';
    if (k === 'schulte-blocks') return t('schulteTable');
    if (k === 'proofreading-blocks') return t('proofreading');
    if (k === 'chess-blocks') return t('chessBlind');
    return t(cap(k as WarmupSlot));
  };
  const descOf = (k: PickKey) => {
    if (isСвоя(k)) return t('ownSeriesMeta');
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
          <Ionicons name={значок(slot)} size={narrow ? 20 : 24} color={TINT[slot][0]} />
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
          {/* Длительность — чипы прямо на карточке, у ВСЕХ четырёх слотов.
              Там, где состав назван целиком (фикс-набор профиля или набор слота
              из файла), три длины дали бы один и тот же список — чипов нет, и
              решает это `длинаВлияет`, а не перечень слотов здесь. */}
          {!series && !isСвоя(slot) && on && длинаВлияет(wd, slot as WarmupSlot, слотЗафиксирован(slot as WarmupSlot)) && (
            <View style={styles.durRow}>
              {([5, 10, 15] as const).map((d) => (
                <TouchableOpacity
                  key={d}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: dur[slot as WarmupSlot] === d }}
                  accessibilityLabel={`${d} ${t('unitMin')}`}
                  onPress={() => pickDur(slot as WarmupSlot, d)}
                  style={[styles.durChip, {
                    backgroundColor: dur[slot as WarmupSlot] === d ? TINT[slot][0] : 'transparent',
                    borderColor: dur[slot as WarmupSlot] === d ? TINT[slot][0] : colors.border,
                  }]}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: dur[slot as WarmupSlot] === d ? '#fff' : colors.text }}>
                    {d} {t('unitMin')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Длина ПОТОКА — те же чипы, но выбирают вариант набора, а не длину слота.
              У одиночного набора варианта один — чипов нет (раньше тут стояли чипы
              слота, которые запуск своей серии не читал). */}
          {(() => {
            const п = потокКарточки(slot);
            if (!п || !on || п.варианты.length < 2) return null;
            const выбранный = (п.варианты.find((в) => в.длина === длинаПотока[п.ключ]) ?? п.варианты[0]).длина;
            return (
              <View style={styles.durRow} testID="own-series-length">
                {п.варианты.map(({ длина }) => (
                  <TouchableOpacity
                    key={длина ?? 0}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: выбранный === длина }}
                    accessibilityLabel={`${длина} ${t('unitMin')}`}
                    onPress={() => { if (длина) выбратьДлинуПотока(п.ключ, длина); }}
                    style={[styles.durChip, {
                      backgroundColor: выбранный === длина ? TINT[slot][0] : 'transparent',
                      borderColor: выбранный === длина ? TINT[slot][0] : colors.border,
                    }]}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: выбранный === длина ? '#fff' : colors.text }}>
                      {длина} {t('unitMin')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })()}
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

        {потоки.length > 0 && (
          <View style={styles.groupHead}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{t('ownSeriesGroup')}</Text>
            <Text style={[styles.groupNote, { color: colors.textSecondary }]}>{t('ownSeriesGroupNote')}</Text>
          </View>
        )}
        {потоки.map((п) => renderCard(`своя:${п.ключ}` as PickKey))}
      </ScrollView>

      {/* Нижний тулбар — как на экране «Об игре»: слева справка, справа запуск. */}
      <View style={[styles.bar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 + TAB_BAR_H }]}>
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
                  <Ionicons name={значок(slot)} size={18} color={TINT[slot][0]} />
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
