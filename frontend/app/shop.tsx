import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getTokens, spendTokens, checkInStreakRepairable, repairCheckInStreak } from '@/src/services/tokens';
import { peekWager, placeWager, WagerState, WAGER_STAKE, WAGER_PRIZE, WAGER_DAYS } from '@/src/services/wager';
import { digitsForStyle, defaultStyleForProfile } from '@/src/constants/digitThemes';
import { themeArtByKey } from '@/src/constants/profileThemes';
import { PROFILE_BACKGROUNDS } from '@/src/constants/profileBackgrounds';
import { PROFILE_BADGES } from '@/src/constants/profileBadges';
import { PROFILES } from '@/src/constants/profiles';
import {
  ABILITIES, Ability, AbilityCounts, buyAbility, getAbilityCounts,
  // Сервисная трата, не хук React: под своим именем линт принимает её за хук внутри колбэка.
  useAbility as spendAbility,
} from '@/src/services/abilities';
import {
  COSMETICS, Cosmetic, getUnlocked, unlockCosmetic, getEquipped, equipCosmetic, unequipCosmetic,
} from '@/src/services/cosmetics';
import { getPetAccessory, setPetAccessory } from '@/src/services/pet';
import { avatarImage } from '@/src/constants/avatars';
import { sndToken, sndTap, sndWrong, sndCorrect, getSoundPack, setSoundPack as applySoundPack } from '@/src/services/feedback';
import { a11yDecor } from '@/src/services/a11y';
import { assetUri, postScreenModel, registerScreenActions } from '@/src/services/hostScreens';

/**
 * ЧТО ПОКАЗЫВАЮТ ДВЕ КНОПКИ КАРТОЧКИ СПОСОБНОСТИ — одним решением на обе.
 *
 * 🔴 ЗАЧЕМ ФУНКЦИЕЙ. Кнопки жили каждая своей жизнью, и недоступность у них
 * выглядела ПО-РАЗНОМУ на одной карточке: «Buy» честно серела (`colors.border`),
 * а «Use» при нуле в кошельке оставалась акцентной — только гасла до 0.5. Она
 * была отключена по-настоящему (`disabled`), но читалась как рабочая, и человек
 * жал по ней, не понимая, почему ничего не происходит.
 *
 * Найдено осмотром 21.08.2026: в кошельке 0 щитов, а «Применить» выглядит живой.
 *
 * ⚠️ ПОЧЕМУ РЕШЕНИЕ ОТДЕЛЬНО ОТ ЦВЕТА. Цвет — это следствие; проверять надо
 * решение. Здесь возвращается СОСТОЯНИЕ каждой кнопки, а экран уже красит по
 * нему, и гейт проверяет таблицу состояний, а не то, какой оттенок подставлен.
 */
export type BuyState = 'buy' | 'need-more' | 'full';
export type UseState = 'ready' | 'empty' | null;

export function abilityButtons(
  { have, max, cost, balance, usable }:
  { have: number; max: number; cost: number; balance: number; usable: boolean },
): { buy: BuyState; use: UseState } {
  const buy: BuyState = have >= max ? 'full' : balance >= cost ? 'buy' : 'need-more';
  return { buy, use: usable ? (have > 0 ? 'ready' : 'empty') : null };
}

/**
 * СОСТОЯНИЕ СТРОКИ КОСМЕТИКИ — одно решение на разметку экрана и на модель оболочки
 * (`shopModel` ниже): куплено ли, надето ли, хватает ли очков, каким цветом рамка и кнопка.
 * ⚠️ Звук-пак и вещь питомца — глобальные (не по профилю), поэтому «надето» у них своё.
 */
export function cosmeticRow(
  c: Cosmetic,
  s: { unlocked: string[]; soundPack: string | null; petAcc: string | null; equipped: Record<string, string>; balance: number; primary: string },
) {
  const owned = s.unlocked.includes(c.id);
  const isSound = c.type === 'sound';
  const isPet = c.type === 'pet';
  const on = isSound ? s.soundPack === c.value : isPet ? s.petAcc === c.value : s.equipped[c.type] === c.id;
  const canAfford = s.balance >= c.cost;
  // sound value может быть составным "waveform:pitch" — акцент кнопки берём из темы, не парсим цвет из него
  const accent = c.type === 'accent' || c.type === 'frame' ? c.value : s.primary;
  return { owned, isSound, isPet, on, canAfford, accent };
}

/** Значок вещи питомца в квадрате строки. */
export function petAccEmoji(v: string): string {
  return v === 'bow' ? '🎀' : v === 'party_hat' ? '🥳' : v === 'bow_tie' ? '🎩' : '👓';
}

/** Вкладки разделов: тип (null — все), значок, подпись для чтеца. */
const SHOP_CATS = [
  [null, 'apps', 'a11yCatAll'], ['ability', 'flash', 'a11yCatAbility'],
  ['accent', 'color-palette', 'a11yCatAccent'], ['sound', 'musical-notes', 'a11yCatSound'],
  ['frame', 'scan', 'a11yCatFrame'], ['title', 'pricetag', 'a11yCatTitle'], ['avatar', 'person', 'a11yCatAvatar'], ['pet', 'paw', 'a11yCatPet'],
  ['digits', 'calculator', 'a11yCatDigits'], ['theme', 'map', 'a11yCatTheme'], ['background', 'image', 'a11yCatBackground'], ['badge', 'ribbon', 'a11yCatBadge'],
] as const;

/** Косметические разделы по порядку: тип и ключ заголовка. */
const SHOP_SECTIONS = [
  ['accent', 'shopAccentSection'], ['sound', 'shopSoundSection'], ['frame', 'shopFrameSection'],
  ['title', 'shopTitleSection'], ['avatar', 'shopAvatarSection'], ['pet', 'shopPetSection'],
  ['digits', 'shopDigitsSection'], ['theme', 'shopThemeSection'],
  ['background', 'shopBackgroundSection'], ['badge', 'shopBadgeSection'],
] as const;

/** Товары раздела. Свой дефолтный арт профиля не продаётся — он и так применяется бесплатно. */
function shopItems(type: string, profileId: string | undefined): Cosmetic[] {
  return COSMETICS.filter((c) => c.type === type)
    .filter((c) => !(
      ((c.type === 'theme' || c.type === 'background' || c.type === 'badge') && c.value === profileId) ||
      (c.type === 'digits' && c.value === defaultStyleForProfile(profileId))
    ));
}

/** Имя товара: у арта профиля — имя профиля. */
function cosmeticName(c: Cosmetic, t: (k: string) => string): string {
  return (c.type === 'theme' || c.type === 'background' || c.type === 'badge')
    ? (PROFILES.find((p) => p.id === c.value)?.display_name ?? t(c.nameKey))
    : t(c.nameKey);
}

/**
 * 🔴 ВЫХОД В WEB-DEMO — В ОБЁРТКЕ БЕЗ ХУКОВ, А НЕ ПЕРВОЙ СТРОКОЙ ЭКРАНА.
 *
 * Стоял первой строкой, ДО всех хуков: `if (isWebDemo()) return <Redirect/>`.
 * Условный ранний выход перед хуками — это разное их число между рендерами и
 * ошибка React #310. Замер 09.09.2026: `react-hooks/rules-of-hooks` насчитал
 * 53 нарушения по проекту, из них ShopScreen держал свою долю; отчёт
 * тестировщика 6ec1941e — экран «Что-то сломалось» на `/achievements`.
 * Тот же приём применён в `pet.tsx`, `span.tsx` и `sudoku-hub.tsx` 05.09.2026.
 *
 * Обёртка хуков не вызывает вовсе, поэтому возвращать из неё по условию законно.
 */
export default function ShopScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  return <ShopScreenBody />;
}

function ShopScreenBody() {
  const { colors, refreshCosmeticAccent } = useTheme();
  const { t, language } = useLanguage();   // language — только для RTL-зеркала стрелки «назад»
  const { profile } = useProfile();

  const [balance, setBalance] = useState(0);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [soundPack, setSoundPackState] = useState<string | null>(null);   // SND-P: текущий звук-пак (глобально)
  const [petAcc, setPetAcc] = useState<string | null>(null);              // аксессуар питомца (глобально, как скин)
  const [cat, setCat] = useState<string | null>(null);                    // v1.155: фильтр категорий (null = все) — магазин был длинной лентой (аудит)
  const [abilities, setAbilities] = useState<AbilityCounts>({});          // расходуемые способности: сколько штук в кошельке
  // Что произошло с последней покупкой/тратой. ⚠️ Молча списывать нельзя: очки уходят,
  // а на экране меняется только число в углу — этого мало, чтобы понять, что случилось.
  const [note, setNote] = useState<string | null>(null);
  const [wager, setWager] = useState<WagerState>({ kind: 'none' });   // ставка «всё или ничего»
  /**
   * 🔴 ОДНА ТРАТА ЗА РАЗ (задача 9424da3a: «быстрое двойное нажатие не списывает дважды»).
   * Проверка «хватает ли очков» смотрит на баланс из состояния, а он обновляется только после
   * `reload()`. Второе нажатие, пришедшее раньше, видело старый баланс и списывало ещё раз —
   * с кнопки оболочки два действия прилетают быстрее, чем веб успевает перерисоваться.
   * Пока трата идёт, следующие нажатия молча отбрасываются.
   */
  const spending = useRef(false);
  const once = useCallback(async (fn: () => Promise<void>) => {
    if (spending.current) return;
    spending.current = true;
    try { await fn(); } finally { spending.current = false; }
  }, []);

  const reload = useCallback(async () => {
    const pid = profile?.id;
    if (!pid) return;
    setBalance(await getTokens(pid));
    setUnlocked(await getUnlocked(pid));
    setEquipped(await getEquipped(pid));
    setSoundPackState(await getSoundPack());
    setPetAcc(await getPetAccessory());
    setAbilities(await getAbilityCounts(pid));
    setWager(await peekWager(pid));
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const buy = (c: Cosmetic) => once(async () => {
    const pid = profile?.id;
    if (!pid) return;
    if (balance < c.cost) { sndWrong(); return; }
    const ok = await spendTokens(pid, c.cost);
    if (ok) { await unlockCosmetic(pid, c.id); sndToken(); await reload(); }
    else sndWrong();
  });

  /**
   * Купить штуку способности. Причина отказа проговаривается: «не хватает очков» и
   * «в кошельке уже максимум» — разные ответы, и кнопка, молчащая на оба, врёт.
   */
  const buyAb = (a: Ability) => once(async () => {
    const pid = profile?.id;
    if (!pid) return;
    const r = await buyAbility(pid, a.id);
    if (r.ok) {
      sndToken();
      setNote(`${t('abilitySpentNote').replace('{n}', String(a.cost))} · ${t(a.nameKey)} ×${r.count}`);
    } else {
      sndWrong();
      setNote(r.reason === 'full' ? t('abilityFull') : t('needMoreTokens'));
    }
    await reload();
  });

  /**
   * Применить «Щит серии» прямо из кошелька.
   *
   * ⚠️ СНАЧАЛА СМОТРИМ, ЕСТЬ ЛИ ЧТО ЧИНИТЬ, И ТОЛЬКО ПОТОМ ТРАТИМ. При обратном
   * порядке нажатие на целой серии съедало бы щит впустую — самая обидная из
   * возможных трат: заплатил и ничего не произошло.
   */
  const useShield = () => once(async () => {
    const pid = profile?.id;
    if (!pid) return;
    const broken = await checkInStreakRepairable(pid);
    if (!broken) { sndWrong(); setNote(t('abilityStreakIntact')); return; }
    if (!(await spendAbility(pid, 'streak_shield'))) { sndWrong(); setNote(t('abilityNoneLeft')); return; }
    const r = await repairCheckInStreak(pid);
    sndToken();
    setNote(r.ok
      ? t('abilityStreakRestored').replace('{n}', String(r.streak))
      : t('abilityStreakStale'));
    await reload();
  });

  const toggleEquip = async (c: Cosmetic) => {
    const pid = profile?.id;
    if (!pid) return;
    const isOn = equipped[c.type] === c.id;
    if (isOn) await unequipCosmetic(pid, c.type);
    else await equipCosmetic(pid, c.type, c.id);
    sndTap();
    await reload();
    refreshCosmeticAccent();   // мгновенно перекрасить интерфейс под новый акцент
  };

  // SND-P: звук-пак — глобальный (форма волны), надевание сразу слышно.
  const toggleSound = async (c: Cosmetic) => {
    const next = soundPack === c.value ? null : c.value;
    await applySoundPack(next);
    setSoundPackState(next);
    if (next) sndCorrect(); else sndTap();
  };

  // Аксессуар питомца — глобальный (питомец один на устройство, как скин).
  const togglePetAcc = async (c: Cosmetic) => {
    const next = petAcc === c.value ? null : (c.value as any);
    await setPetAccessory(next);
    setPetAcc(next);
    sndTap();
  };

  /**
   * Строка расходуемой способности.
   *
   * ⚠️ ОСТАТОК ПОКАЗЫВАЕТСЯ ВСЕГДА, В ТОМ ЧИСЛЕ НУЛЕВОЙ. Строка вида
   * `{count > 0 && <Text>…</Text>}` выглядит в исходнике живой, а на экране её нет
   * ровно у того, кто ещё ничего не купил, — то есть у всех, кому она и нужна.
   */
  const placeWagerNow = () => once(async () => {
    const pid = profile?.id;
    if (!pid) return;
    const ok = await placeWager(pid);
    if (ok) {
      sndCorrect();
      setNote(`${t('wagerTitle')}: −${WAGER_STAKE} ⭐ · ${t('wagerDay').replace('{d}', '1').replace('{t}', String(WAGER_DAYS))}`);
    }
    await reload();
  });

  const renderAbility = (a: Ability) => {
    const have = abilities[a.id] ?? 0;
    const usable = a.id === 'streak_shield';   // единственная, что применяется здесь; остальные тратятся в партии
    const st = abilityButtons({ have, max: a.max, cost: a.cost, balance, usable });
    const canAfford = st.buy === 'buy';
    const full = st.buy === 'full';
    const useReady = st.use === 'ready';
    return (
      <View key={a.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
        <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name={a.icon as any} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t(a.nameKey)}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{t(a.descKey)}</Text>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 3 }}>
            {`${a.cost} ⭐ · ${t('abilityInWallet').replace('{n}', String(have))}`}
          </Text>
        </View>
        <View style={{ gap: 6, flexShrink: 0 }}>
          <TouchableOpacity
            accessibilityRole="button" onPress={() => buyAb(a)} disabled={!canAfford || full}
            style={[styles.btn, { backgroundColor: canAfford && !full ? colors.primary : colors.border, opacity: canAfford && !full ? 1 : 0.6 }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              {full ? t('abilityFull') : canAfford ? t('buy') : t('needMoreTokens')}
            </Text>
          </TouchableOpacity>
          {usable ? (
            <TouchableOpacity
              accessibilityRole="button" onPress={useShield} disabled={!useReady}
              style={[styles.btn, {
                backgroundColor: 'transparent',
                // Недоступна — серым, как и «Buy» рядом: акцентный цвет на одной
                // карточке не может означать и «можно», и «нельзя».
                borderColor: useReady ? colors.primary : colors.border,
                borderWidth: 1.5, opacity: useReady ? 1 : 0.6,
              }]}>
              <Text style={{ color: useReady ? colors.primary : colors.textSecondary, fontWeight: '800', fontSize: 13 }}>{t('abilityUse')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderItem = (c: Cosmetic) => {
    const { owned, isSound, isPet, on, canAfford, accent } = cosmeticRow(c, { unlocked, soundPack, petAcc, equipped, balance, primary: colors.primary });
    return (
      <View key={c.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: on ? accent : colors.border, borderWidth: on ? 2 : 1 }]}>
        {c.type === 'sound' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="musical-notes" size={22} color={accent} />
          </View>
        ) : c.type === 'frame' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, borderWidth: 3, borderColor: c.value, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={16} color={colors.textSecondary} />
          </View>
        ) : c.type === 'title' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 20 }}>{c.value}</Text>
          </View>
        ) : c.type === 'avatar' ? (
          <Image {...a11yDecor} source={avatarImage(c.value)} style={[styles.swatch, { backgroundColor: colors.background }]} resizeMode="cover" />
        ) : c.type === 'pet' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 20 }}>{petAccEmoji(c.value)}</Text>
          </View>
        ) : c.type === 'digits' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Image {...a11yDecor} source={digitsForStyle(c.value as any)[5]} style={{ width: 34, height: 34 }} resizeMode="contain" />
          </View>
        ) : c.type === 'theme' ? (
          <Image {...a11yDecor} source={themeArtByKey(c.value)} style={[styles.swatch, { backgroundColor: colors.background }]} resizeMode="cover" />
        ) : c.type === 'background' ? (
          <Image {...a11yDecor} source={PROFILE_BACKGROUNDS[c.value]} style={[styles.swatch, { backgroundColor: colors.background }]} resizeMode="cover" />
        ) : c.type === 'badge' ? (
          <Image {...a11yDecor} source={PROFILE_BADGES[c.value]} style={[styles.swatch, { backgroundColor: colors.background }]} resizeMode="cover" />
        ) : (
          <View style={[styles.swatch, { backgroundColor: c.value }]} />
        )}
        {/* minWidth:0 — при крупном шрифте блок с текстом ужимается, а не выдавливает кнопку Купить/Надеть за край */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
            {cosmeticName(c, t)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{t(c.descKey)}</Text>
          <Text style={{ color: owned ? colors.textSecondary : colors.text, fontSize: 13, fontWeight: '700', marginTop: 3 }}>
            {owned ? t('ownedBadge') : `${c.cost} ⭐`}
          </Text>
        </View>
        {owned ? (
          <TouchableOpacity
            accessibilityRole="button" onPress={() => (isSound ? toggleSound(c) : isPet ? togglePetAcc(c) : toggleEquip(c))}
            style={[styles.btn, { backgroundColor: on ? accent : 'transparent', borderColor: accent, borderWidth: 1.5 }]}>
            <Text style={{ color: on ? '#fff' : accent, fontWeight: '800', fontSize: 13 }}>
              {on ? t('equipped') : t('equip')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            accessibilityRole="button" onPress={() => buy(c)} disabled={!canAfford}
            style={[styles.btn, { backgroundColor: canAfford ? colors.primary : colors.border, opacity: canAfford ? 1 : 0.6 }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              {canAfford ? t('buy') : t('needMoreTokens')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  /**
   * 🔴 ПОД ОБОЛОЧКОЙ «МАГАЗИН» РИСУЕТ FLUTTER (задача 9424da3a, `services/hostScreens.ts`).
   * Модель — те же решения, что у разметки ниже: `abilityButtons`, `cosmeticRow`, `shopItems`,
   * `cosmeticName`, `SHOP_CATS`/`SHOP_SECTIONS`. Покупки и надевание — те же функции экрана.
   */
  const shopKey = JSON.stringify(shopModel({
    balance, unlocked, equipped, soundPack, petAcc, cat, abilities, note, wager,
    profileId: profile?.id, rtl: isRTLLang(language),
  }, t, colors));
  useEffect(() => { postScreenModel('/shop', JSON.parse(shopKey)); }, [shopKey]);
  const shopActs = useRef({ buy, buyAb, useShield, placeWagerNow, toggleSound, togglePetAcc, toggleEquip });
  useEffect(() => { shopActs.current = { buy, buyAb, useShield, placeWagerNow, toggleSound, togglePetAcc, toggleEquip }; });
  useEffect(() => registerScreenActions('/shop', {
    back: () => goBackOrHome(),
    cat: (id: string | null) => {
      if (id === null || SHOP_CATS.some(([c]) => c === id)) setCat(id);
    },
    buyAbility: (id: string) => {
      const a = ABILITIES.find((x) => x.id === id);
      if (a) shopActs.current.buyAb(a);
    },
    useShield: () => { shopActs.current.useShield(); },
    wager: () => { shopActs.current.placeWagerNow(); },
    buy: (id: string) => {
      const c = COSMETICS.find((x) => x.id === id);
      if (c) shopActs.current.buy(c);
    },
    toggle: (id: string) => {
      const c = COSMETICS.find((x) => x.id === id);
      if (!c) return;
      const a = shopActs.current;
      if (c.type === 'sound') a.toggleSound(c); else if (c.type === 'pet') a.togglePetAcc(c); else a.toggleEquip(c);
    },
  }), []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.iconBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('shop')}</Text>
        <View style={[styles.balance, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 15 }}>⭐</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{balance}</Text>
        </View>
      </View>

      {/* v1.155: фильтр-категории (иконки, без новых i18n-ключей) — магазин был
          длинной лентой без навигации (аудит). null = показать все секции. */}
      <View style={styles.catRow}>
        {SHOP_CATS.map(([c, icon, labelKey]) => {
          const on = cat === c;
          return (
            <TouchableOpacity key={String(c)} onPress={() => setCat(c)} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={t(labelKey)} accessibilityState={{ selected: on }}
              style={[styles.catChip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}>
              <Ionicons name={icon as any} size={18} color={on ? '#fff' : colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: FAB_CLEARANCE }} showsVerticalScrollIndicator={false}>
        {/* Отчёт о последней покупке/трате. Держится до следующего действия — списание
            очков человек обязан увидеть словами, а не догадаться по числу в углу. */}
        {note ? (
          <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Text style={{ color: colors.text, fontSize: 13, lineHeight: 1.5 * 13 }}>{note}</Text>
          </View>
        ) : null}

        {/* СПОСОБНОСТИ — расходники, идут первыми: их берут ради партии, а не ради вида.
            Секция рисуется БЕЗУСЛОВНО (фильтр решает только показ), чтобы кошелёк
            нельзя было потерять из виду, пока в нём пусто. */}
        {(!cat || cat === 'ability') ? (
          <>
            <Text style={[styles.section, { color: colors.textSecondary, marginTop: 0 }]}>{t('shopAbilitySection')}</Text>
            {ABILITIES.map(renderAbility)}
            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 4, marginBottom: 6 }]}>
              {t('shopAbilityHint')}
            </Text>

            {/* СТАВКА «ВСЁ ИЛИ НИЧЕГО» — недельный риск-контракт (С3 экономики).
                Сгоревшая ставка показывается словами один раз (peek честно отдаёт lost),
                дальше карточка возвращается к предложению новой. */}
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: wager.kind === 'active' ? colors.primary : colors.border, borderWidth: wager.kind === 'active' ? 2 : 1 }]}>
              <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="flame" size={22} color={wager.kind === 'active' ? '#f59e0b' : colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t('wagerTitle')}</Text>
                {wager.kind === 'active' ? (
                  <>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 3 }}>
                      {t('wagerDay').replace('{d}', String(wager.daysDone)).replace('{t}', String(wager.daysTotal))} · +{wager.prize} ⭐
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 3, letterSpacing: 2 }}>
                      {'●'.repeat(wager.daysDone)}{'○'.repeat(Math.max(0, wager.daysTotal - wager.daysDone))}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                    {wager.kind === 'lost' ? t('wagerLostMsg') + ' ' : ''}
                    {t('wagerDesc').replace('{stake}', String(WAGER_STAKE)).replace('{prize}', String(WAGER_PRIZE))}
                  </Text>
                )}
              </View>
              {wager.kind !== 'active' ? (
                <View style={{ gap: 6, flexShrink: 0 }}>
                  <TouchableOpacity
                    accessibilityRole="button" onPress={placeWagerNow} disabled={balance < WAGER_STAKE}
                    style={[styles.btn, { backgroundColor: balance >= WAGER_STAKE ? colors.primary : colors.border, opacity: balance >= WAGER_STAKE ? 1 : 0.6 }]}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                      {balance >= WAGER_STAKE ? t('wagerPlace').replace('{n}', String(WAGER_STAKE)) : t('needMoreTokens')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {SHOP_SECTIONS.filter(([type]) => !cat || cat === type).map(([type, sectionKey], i) => (
          <React.Fragment key={type}>
            {/* Первая косметическая секция прижата к верху, только если над ней ничего
                нет: при показе всех разделов выше стоят способности. */}
            <Text style={[styles.section, { color: colors.textSecondary, marginTop: i === 0 && cat && cat !== 'ability' ? 0 : 20 }]}>
              {t(sectionKey)}
            </Text>
            {shopItems(type, profile?.id).map(renderItem)}
          </React.Fragment>
        ))}

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('shopEarnHint')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type ShopState = {
  balance: number;
  unlocked: string[];
  equipped: Record<string, string>;
  soundPack: string | null;
  petAcc: string | null;
  cat: string | null;
  abilities: AbilityCounts;
  note: string | null;
  wager: WagerState;
  profileId: string | undefined;
  rtl: boolean;
};

/** Квадрат-образец товара — то же ветвление по типу, что у разметки строки. */
function swatchOf(c: Cosmetic, accent: string): object {
  switch (c.type) {
    case 'sound': return { kind: 'icon', icon: 'musical-notes', color: accent };
    case 'frame': return { kind: 'frame', color: c.value };
    case 'title': return { kind: 'text', text: c.value };
    case 'avatar': return { kind: 'image', uri: assetUri(avatarImage(c.value)) };
    case 'pet': return { kind: 'text', text: petAccEmoji(c.value) };
    case 'digits': return { kind: 'digits', uri: assetUri(digitsForStyle(c.value as any)[5]) };
    case 'theme': return { kind: 'image', uri: assetUri(themeArtByKey(c.value)) };
    case 'background': return { kind: 'image', uri: assetUri(PROFILE_BACKGROUNDS[c.value]) };
    case 'badge': return { kind: 'image', uri: assetUri(PROFILE_BADGES[c.value]) };
    default: return { kind: 'color', color: c.value };
  }
}

/** Модель «Магазина» для оболочки: строки готовы, решения — общие с разметкой. */
function shopModel(s: ShopState, t: (key: string) => string, colors: { primary: string }) {
  const w = s.wager;
  return {
    v: 1,
    title: t('shop'), back: t('a11yBack'), backIcon: s.rtl ? 'arrow-forward' : 'arrow-back',
    primary: colors.primary, balance: String(s.balance),
    cats: SHOP_CATS.map(([id, icon, labelKey]) => ({ id, icon, label: t(labelKey), on: s.cat === id })),
    note: s.note,
    abilities: !s.cat || s.cat === 'ability' ? {
      title: t('shopAbilitySection'),
      rows: ABILITIES.map((a) => {
        const have = s.abilities[a.id] ?? 0;
        const usable = a.id === 'streak_shield';
        const st = abilityButtons({ have, max: a.max, cost: a.cost, balance: s.balance, usable });
        return {
          id: a.id, icon: a.icon, name: t(a.nameKey), desc: t(a.descKey),
          price: `${a.cost} ⭐ · ${t('abilityInWallet').replace('{n}', String(have))}`,
          buy: {
            label: st.buy === 'full' ? t('abilityFull') : st.buy === 'buy' ? t('buy') : t('needMoreTokens'),
            enabled: st.buy === 'buy',
          },
          use: usable ? { label: t('abilityUse'), ready: st.use === 'ready' } : null,
        };
      }),
      hint: t('shopAbilityHint'),
      wager: w.kind === 'active'
        ? {
          active: true, title: t('wagerTitle'),
          day: `${t('wagerDay').replace('{d}', String(w.daysDone)).replace('{t}', String(w.daysTotal))} · +${w.prize} ⭐`,
          dots: `${'●'.repeat(w.daysDone)}${'○'.repeat(Math.max(0, w.daysTotal - w.daysDone))}`,
          btn: null,
        }
        : {
          active: false, title: t('wagerTitle'),
          desc: (w.kind === 'lost' ? t('wagerLostMsg') + ' ' : '')
            + t('wagerDesc').replace('{stake}', String(WAGER_STAKE)).replace('{prize}', String(WAGER_PRIZE)),
          btn: {
            label: s.balance >= WAGER_STAKE ? t('wagerPlace').replace('{n}', String(WAGER_STAKE)) : t('needMoreTokens'),
            enabled: s.balance >= WAGER_STAKE,
          },
        },
    } : null,
    sections: SHOP_SECTIONS.filter(([type]) => !s.cat || s.cat === type).map(([type, sectionKey]) => ({
      type,
      title: t(sectionKey),
      // Первый раздел прижат к верху, только когда над ним нет способностей.
      first: !!s.cat && s.cat !== 'ability',
      items: shopItems(type, s.profileId).map((c) => {
        const r = cosmeticRow(c, { unlocked: s.unlocked, soundPack: s.soundPack, petAcc: s.petAcc, equipped: s.equipped, balance: s.balance, primary: colors.primary });
        return {
          id: c.id, name: cosmeticName(c, t), desc: t(c.descKey),
          price: r.owned ? t('ownedBadge') : `${c.cost} ⭐`,
          owned: r.owned, on: r.on, accent: r.accent,
          swatch: swatchOf(c, r.accent),
          btn: r.owned
            ? { label: r.on ? t('equipped') : t('equip'), enabled: true }
            : { label: r.canAfford ? t('buy') : t('needMoreTokens'), enabled: r.canAfford },
        };
      }),
    })),
    earnHint: t('shopEarnHint'),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  catRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12, flexWrap: 'wrap' },
  // 40×40 — ниже минимума 44; вкладки разделов жмут часто и мимо.
  catChip: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 44, borderRadius: 22, borderWidth: 1 },
  section: { fontSize: 13, lineHeight: 1.5 * 13, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14, marginBottom: 10 },
  swatch: { width: 38, height: 38, borderRadius: 12 },
  // flexShrink:0 — кнопка действия сохраняет размер при крупном шрифте, не сплющивается текстом слева
  // Замер 12.08 нашёл здесь 19 одинаковых кнопок «Мало очков» высотой 36 точек при
  // минимуме 44: paddingVertical:10 плюс шрифт 13 в сумме столько и дают. Радиус 999 —
  // скруглённые углы, единые по приложению.
  btn: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 48, justifyContent: 'center', borderRadius: 16, minWidth: 92, alignItems: 'center', flexShrink: 0 },
  hint: { fontSize: 12, lineHeight: 1.5 * 12, marginTop: 14, textAlign: 'center' },
  note: { borderRadius: 14, borderWidth: 1.5, padding: 12, marginBottom: 14 },
});
