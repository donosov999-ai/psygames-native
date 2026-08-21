import React, { useState, useCallback } from 'react';
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
import {
  ABILITIES, Ability, AbilityCounts, buyAbility, getAbilityCounts, useAbility,
} from '@/src/services/abilities';
import {
  COSMETICS, Cosmetic, getUnlocked, unlockCosmetic, getEquipped, equipCosmetic, unequipCosmetic,
} from '@/src/services/cosmetics';
import { getPetAccessory, setPetAccessory } from '@/src/services/pet';
import { avatarImage } from '@/src/constants/avatars';
import { sndToken, sndTap, sndWrong, sndCorrect, getSoundPack, setSoundPack as applySoundPack } from '@/src/services/feedback';
import { a11yDecor } from '@/src/services/a11y';

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

export default function ShopScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
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

  const reload = useCallback(async () => {
    const pid = profile?.id;
    if (!pid) return;
    setBalance(await getTokens(pid));
    setUnlocked(await getUnlocked(pid));
    setEquipped(await getEquipped(pid));
    setSoundPackState(await getSoundPack());
    setPetAcc(await getPetAccessory());
    setAbilities(await getAbilityCounts(pid));
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const buy = async (c: Cosmetic) => {
    const pid = profile?.id;
    if (!pid) return;
    if (balance < c.cost) { sndWrong(); return; }
    const ok = await spendTokens(pid, c.cost);
    if (ok) { await unlockCosmetic(pid, c.id); sndToken(); await reload(); }
    else sndWrong();
  };

  /**
   * Купить штуку способности. Причина отказа проговаривается: «не хватает очков» и
   * «в кошельке уже максимум» — разные ответы, и кнопка, молчащая на оба, врёт.
   */
  const buyAb = async (a: Ability) => {
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
  };

  /**
   * Применить «Щит серии» прямо из кошелька.
   *
   * ⚠️ СНАЧАЛА СМОТРИМ, ЕСТЬ ЛИ ЧТО ЧИНИТЬ, И ТОЛЬКО ПОТОМ ТРАТИМ. При обратном
   * порядке нажатие на целой серии съедало бы щит впустую — самая обидная из
   * возможных трат: заплатил и ничего не произошло.
   */
  const useShield = async () => {
    const pid = profile?.id;
    if (!pid) return;
    const broken = await checkInStreakRepairable(pid);
    if (!broken) { sndWrong(); setNote(t('abilityStreakIntact')); return; }
    if (!(await useAbility(pid, 'streak_shield'))) { sndWrong(); setNote(t('abilityNoneLeft')); return; }
    const r = await repairCheckInStreak(pid);
    sndToken();
    setNote(r.ok
      ? t('abilityStreakRestored').replace('{n}', String(r.streak))
      : t('abilityStreakStale'));
    await reload();
  };

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
    const owned = unlocked.includes(c.id);
    const isSound = c.type === 'sound';
    const isPet = c.type === 'pet';
    const on = isSound ? soundPack === c.value : isPet ? petAcc === c.value : equipped[c.type] === c.id;
    const canAfford = balance >= c.cost;
    // sound value может быть составным "waveform:pitch" — акцент кнопки берём из темы, не парсим цвет из него
    const accent = c.type === 'accent' || c.type === 'frame' ? c.value : colors.primary;
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
            <Text style={{ fontSize: 20 }}>{c.value === 'bow' ? '🎀' : c.value === 'party_hat' ? '🥳' : c.value === 'bow_tie' ? '🎩' : '👓'}</Text>
          </View>
        ) : (
          <View style={[styles.swatch, { backgroundColor: c.value }]} />
        )}
        {/* minWidth:0 — при крупном шрифте блок с текстом ужимается, а не выдавливает кнопку Купить/Надеть за край */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t(c.nameKey)}</Text>
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
        {([
          [null, 'apps', 'a11yCatAll'], ['ability', 'flash', 'a11yCatAbility'],
          ['accent', 'color-palette', 'a11yCatAccent'], ['sound', 'musical-notes', 'a11yCatSound'],
          ['frame', 'scan', 'a11yCatFrame'], ['title', 'pricetag', 'a11yCatTitle'], ['avatar', 'person', 'a11yCatAvatar'], ['pet', 'paw', 'a11yCatPet'],
        ] as const).map(([c, icon, labelKey]) => {
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
          </>
        ) : null}

        {([
          ['accent', 'shopAccentSection'], ['sound', 'shopSoundSection'], ['frame', 'shopFrameSection'],
          ['title', 'shopTitleSection'], ['avatar', 'shopAvatarSection'], ['pet', 'shopPetSection'],
        ] as const).filter(([type]) => !cat || cat === type).map(([type, sectionKey], i) => (
          <React.Fragment key={type}>
            {/* Первая косметическая секция прижата к верху, только если над ней ничего
                нет: при показе всех разделов выше стоят способности. */}
            <Text style={[styles.section, { color: colors.textSecondary, marginTop: i === 0 && cat && cat !== 'ability' ? 0 : 20 }]}>
              {t(sectionKey)}
            </Text>
            {COSMETICS.filter((c) => c.type === type).map(renderItem)}
          </React.Fragment>
        ))}

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('shopEarnHint')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
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
