/**
 * ProfileSwitcherModal (v1.7.0)
 *
 * Bottom-sheet modal со всеми профилями. Используется и в Settings, и в Home — единая точка
 * переключения профиля.
 *
 * Логика клика:
 *  - Уже активный профиль → закрывает модалку (ничего не меняет)
 *  - Любой другой → switchProfile + закрывает
 *
 * 🔴 21.10.2026, решение Дениса (d5e5814a): монетизации нет. Замков, ярусов, цен, кодов доступа и
 * покупки в Telegram больше нет — все профили открыты всем на всех платформах.
 */

import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import type { ProfileDef } from '@/src/constants/profiles';
import { profileBadge } from '@/src/constants/profileBadges';
import { a11yDecor, a11yModal } from '@/src/services/a11y';
import { getTokens } from '@/src/services/tokens';
import { assetUri, postScreenModel, registerScreenActions } from '@/src/services/hostScreens';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileSwitcherModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { profile, allProfiles, switchProfile } = useProfile();

  // v1.163 (репорт Вали «когда я перехожу в другой профиль, теряются все очки — обидно,
  // и я уже не хочу менять профиль»): очки НЕ теряются, у каждой программы свой счёт —
  // это нигде не было написано, и переключение читалось как обнуление. Показываем счёт
  // прямо на карточке, чтобы смена программы не выглядела наказанием.
  const [wallets, setWallets] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!visible) return;
    let alive = true;
    Promise.all(allProfiles.map((pr) => getTokens(pr.id).then((v) => [pr.id, v] as const)))
      .then((pairs) => { if (alive) setWallets(Object.fromEntries(pairs)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [visible, allProfiles]);

  /**
   * 🔴 ПОД ОБОЛОЧКОЙ ПЕРЕКЛЮЧАТЕЛЬ РИСУЕТ FLUTTER (задача 5b3513bd, `services/hostScreens.ts`).
   * Модель листа Dart считает сам (`switcher_model.dart`); эта модель — запасная, если своя не
   * собралась: профили с кошельками и подписями — ровно то, что рисует разметка ниже.
   */
  // Кошельки для листа оболочки — без ожидания `visible`: лист открывает оболочка, не этот компонент.
  const [allWallets, setAllWallets] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    let alive = true;
    Promise.all(allProfiles.map((pr) => getTokens(pr.id).then((v) => [pr.id, v] as const)))
      .then((pairs) => { if (alive) setAllWallets(Object.fromEntries(pairs)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [allProfiles, profile.id]);
  React.useEffect(() => {
    postScreenModel('#switcher', {
      v: 1,
      activeId: profile.id,
      title: `👤 ${t('a11ySwitchProfile')}`,
      intro: t('switcherIntro'),
      closeLabel: t('close'),
      profiles: allProfiles.map((p) => {
        const wallet = wallets[p.id] ?? allWallets[p.id] ?? 0;
        return {
          id: p.id,
          name: t('profileName_' + p.id),
          desc: t('profileDesc_' + p.id),
          minutes: p.session_minutes ? `⏱ ${p.session_minutes.replace('мин', t('unitMin'))}` : null,
          wallet: wallet > 0 ? `⭐ ${wallet}` : null,
          badge: assetUri(profileBadge(p.id)),
          emoji: p.emoji,
          color: p.color,
          active: p.id === profile.id,
        };
      }),
    });
  }, [allProfiles, profile.id, wallets, allWallets, t]);
  React.useEffect(() => registerScreenActions('#switcher', {
    switch: (id: string) => { if (id !== profile.id && allProfiles.some((p) => p.id === id)) switchProfile(id as ProfileDef['id']); },
  }), [allProfiles, profile.id, switchProfile]);

  const handleProfileClick = (p: ProfileDef) => {
    // Уже активный → просто закрыть; любой другой → переключить и закрыть.
    if (p.id !== profile.id) switchProfile(p.id);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View {...a11yModal} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
          {/* C3b v1.122.1: уплотнено (padding/marginBottom/gap/card-padding урезаны),
              чтобы все профили влезали в один экран без прокрутки. */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text }}>👤 {t('a11ySwitchProfile')}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 16, marginBottom: 10 }}>
              {t('switcherIntro')}
            </Text>

            {/* Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start', maxWidth: '100%' }}>
              {allProfiles.map((p) => {
                const active = p.id === profile.id;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={p.id}
                    style={{
                      width: '31.5%', minWidth: 92,
                      backgroundColor: active ? p.color : colors.card,
                      borderColor: active ? p.color : colors.border,
                      borderWidth: 2,
                      padding: 9, borderRadius: 12,
                      alignItems: 'center',
                    }}
                    onPress={() => handleProfileClick(p)}
                  >
                    {profileBadge(p.id) ? (
                      <Image {...a11yDecor} source={profileBadge(p.id)} style={{ width: 46, height: 46, borderRadius: 13 }} />
                    ) : (
                      <Text style={{ fontSize: 32 }}>{p.emoji}</Text>
                    )}
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#000' : colors.text, marginTop: 4, textAlign: 'center' }}>
                      {t('profileName_' + p.id)}
                    </Text>
                    <Text numberOfLines={2} style={{ fontSize: 10, color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary, textAlign: 'center', marginTop: 2, lineHeight: 13 }}>
                      {t('profileDesc_' + p.id)}
                    </Text>
                    {p.session_minutes && (
                      <Text style={{ fontSize: 9, color: active ? 'rgba(0,0,0,0.55)' : colors.textSecondary, marginTop: 2, fontFamily: 'monospace' }}>
                        ⏱ {p.session_minutes.replace('мин', t('unitMin'))}
                      </Text>
                    )}
                    {(wallets[p.id] ?? 0) > 0 && (
                      <Text style={{ fontSize: 10, fontWeight: '800', marginTop: 3, color: active ? 'rgba(0,0,0,0.75)' : colors.textSecondary }}>
                        ⭐ {wallets[p.id]}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
