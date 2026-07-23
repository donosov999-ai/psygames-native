import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getTokens, spendTokens } from '@/src/services/tokens';
import {
  COSMETICS, Cosmetic, getUnlocked, unlockCosmetic, getEquipped, equipCosmetic, unequipCosmetic,
} from '@/src/services/cosmetics';
import { getPetAccessory, setPetAccessory } from '@/src/services/pet';
import { avatarImage } from '@/src/constants/avatars';
import { sndToken, sndTap, sndWrong, sndCorrect, getSoundPack, setSoundPack as applySoundPack } from '@/src/services/feedback';

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

  const reload = useCallback(async () => {
    const pid = profile?.id;
    if (!pid) return;
    setBalance(await getTokens(pid));
    setUnlocked(await getUnlocked(pid));
    setEquipped(await getEquipped(pid));
    setSoundPackState(await getSoundPack());
    setPetAcc(await getPetAccessory());
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
          <Image source={avatarImage(c.value)} style={[styles.swatch, { backgroundColor: colors.background }]} resizeMode="cover" />
        ) : c.type === 'pet' ? (
          <View style={[styles.swatch, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 20 }}>{c.value === 'bow' ? '🎀' : c.value === 'party_hat' ? '🥳' : '👓'}</Text>
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
          <TouchableOpacity onPress={() => (isSound ? toggleSound(c) : isPet ? togglePetAcc(c) : toggleEquip(c))}
            style={[styles.btn, { backgroundColor: on ? accent : 'transparent', borderColor: accent, borderWidth: 1.5 }]}>
            <Text style={{ color: on ? '#fff' : accent, fontWeight: '800', fontSize: 13 }}>
              {on ? t('equipped') : t('equip')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => buy(c)} disabled={!canAfford}
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
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('shop')}</Text>
        <View style={[styles.balance, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 15 }}>⭐</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{balance}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.section, { color: colors.textSecondary }]}>
          {t('shopAccentSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'accent').map(renderItem)}

        <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
          {t('shopSoundSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'sound').map(renderItem)}

        <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
          {t('shopFrameSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'frame').map(renderItem)}

        <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
          {t('shopTitleSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'title').map(renderItem)}

        <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
          {t('shopAvatarSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'avatar').map(renderItem)}

        <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
          {t('shopPetSection')}
        </Text>
        {COSMETICS.filter((c) => c.type === 'pet').map(renderItem)}

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
  iconBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 44, borderRadius: 22, borderWidth: 1 },
  section: { fontSize: 13, lineHeight: 1.5 * 13, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14, marginBottom: 10 },
  swatch: { width: 38, height: 38, borderRadius: 12 },
  // flexShrink:0 — кнопка действия сохраняет размер при крупном шрифте, не сплющивается текстом слева
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: 92, alignItems: 'center', flexShrink: 0 },
  hint: { fontSize: 12, lineHeight: 1.5 * 12, marginTop: 14, textAlign: 'center' },
});
