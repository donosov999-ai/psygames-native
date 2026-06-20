import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getTokens, spendTokens } from '@/src/services/tokens';
import {
  COSMETICS, Cosmetic, getUnlocked, unlockCosmetic, getEquipped, equipCosmetic, unequipCosmetic,
} from '@/src/services/cosmetics';
import { sndToken, sndTap, sndWrong } from '@/src/services/feedback';

export default function ShopScreen() {
  const { colors, refreshCosmeticAccent } = useTheme();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const ru = language === 'ru';

  const [balance, setBalance] = useState(0);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const pid = profile?.id;
    if (!pid) return;
    setBalance(await getTokens(pid));
    setUnlocked(await getUnlocked(pid));
    setEquipped(await getEquipped(pid));
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{ru ? 'Магазин' : 'Shop'}</Text>
        <View style={[styles.balance, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 15 }}>⭐</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{balance}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.section, { color: colors.textSecondary }]}>
          {ru ? 'Акцентные темы — меняют цвет интерфейса. Купи за очки, надень бесплатно.'
              : 'Accent themes — recolor the UI. Buy with tokens, equip for free.'}
        </Text>

        {COSMETICS.map((c) => {
          const owned = unlocked.includes(c.id);
          const on = equipped[c.type] === c.id;
          const canAfford = balance >= c.cost;
          return (
            <View key={c.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: on ? c.value : colors.border, borderWidth: on ? 2 : 1 }]}>
              <View style={[styles.swatch, { backgroundColor: c.value }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{ru ? c.nameRu : c.nameEn}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {owned ? (ru ? 'Куплено' : 'Owned') : `${c.cost} ⭐`}
                </Text>
              </View>
              {owned ? (
                <TouchableOpacity
                  onPress={() => toggleEquip(c)}
                  style={[styles.btn, { backgroundColor: on ? c.value : 'transparent', borderColor: c.value, borderWidth: 1.5 }]}>
                  <Text style={{ color: on ? '#fff' : c.value, fontWeight: '800', fontSize: 13 }}>
                    {on ? (ru ? 'Надето' : 'Equipped') : (ru ? 'Надеть' : 'Equip')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => buy(c)}
                  disabled={!canAfford}
                  style={[styles.btn, { backgroundColor: canAfford ? colors.primary : colors.border, opacity: canAfford ? 1 : 0.6 }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                    {canAfford ? (ru ? 'Купить' : 'Buy') : (ru ? 'Мало очков' : 'Need more')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {ru ? 'Очки копятся за игры, стрики и ачивки. Скоро — рамки карточек, титулы и аватары.'
              : 'Earn tokens from games, streaks and achievements. Coming soon — card frames, titles, avatars.'}
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
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: 92, alignItems: 'center' },
  hint: { fontSize: 12, lineHeight: 1.5 * 12, marginTop: 14, textAlign: 'center' },
});
