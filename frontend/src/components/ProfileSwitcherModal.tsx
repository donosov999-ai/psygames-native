/**
 * ProfileSwitcherModal (v1.7.0)
 *
 * Bottom-sheet modal со всеми 11 профилями. Используется и в Settings, и
 * в Home — единая точка переключения профиля и запроса кода.
 *
 * Логика клика:
 *  - Уже активный профиль → закрывает модалку (ничего не меняет)
 *  - Разблокированный неактивный → switchProfile + закрывает
 *  - Locked → открывает inline ProfileDetailModal с описанием + хуком +
 *    кнопками «Ввести код» / «Запросить в Telegram»
 */

import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, Alert, Linking, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import type { ProfileDef } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';

const OWNER_TG = 'Denis_On999';

const CATEGORY_EMOJI: Record<string, string> = {
  memory: '🧠',
  attention: '🎯',
  logic: '🧩',
  action: '⚡',
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileSwitcherModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const {
    profile, allProfiles, switchProfile, redeemCode, isAccessible, unlockedThemed,
  } = useProfile();

  // States
  const [detailProfile, setDetailProfile] = React.useState<ProfileDef | null>(null);
  const [codeModalOpen, setCodeModalOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState<string | null>(null);

  const tryRedeem = async () => {
    setCodeError(null);
    const id = await redeemCode(codeInput);
    if (id) {
      setCodeModalOpen(false);
      setCodeInput('');
      setDetailProfile(null);
      onClose();
    } else {
      setCodeError('Неверный код. Проверь и попробуй ещё раз.');
    }
  };

  const requestCodeViaTelegram = (p: ProfileDef) => {
    const msg = encodeURIComponent(
      `Привет, Денис! Хочу получить код доступа к профилю «${p.display_name}» (${p.emoji}) в PsyGames. Это для меня / для (укажи кому, если в подарок).`
    );
    const url = `https://t.me/${OWNER_TG}?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Не удалось открыть Telegram', `Напиши вручную: @${OWNER_TG}`);
    });
  };

  const handleProfileClick = (p: ProfileDef) => {
    if (p.id === profile.id) {
      // Уже активный → просто закрыть
      onClose();
      return;
    }
    if (!isAccessible(p.id)) {
      // Locked → открыть детали + способ получить код
      setDetailProfile(p);
      return;
    }
    // Доступный → переключить и закрыть
    switchProfile(p.id);
    onClose();
  };

  return (
    <>
      {/* === Main switcher modal === */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
            <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 30 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text }}>👤 Сменить профиль</Text>
                <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 18 }}>
                У каждого профиля свой набор игр и плейлист зарядки. Тематические открываются мастер-кодом — нажми на закрытый профиль чтобы узнать детали и получить код в Telegram.
              </Text>

              {/* Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
                {allProfiles.map((p) => {
                  const active = p.id === profile.id;
                  const accessible = isAccessible(p.id);
                  const locked = !accessible;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={{
                        width: '31%', minWidth: 100,
                        backgroundColor: active ? p.color : colors.card,
                        borderColor: active ? p.color : colors.border,
                        borderWidth: 2,
                        padding: 12, borderRadius: 12,
                        alignItems: 'center',
                        opacity: locked ? 0.65 : 1,
                      }}
                      onPress={() => handleProfileClick(p)}
                    >
                      <Text style={{ fontSize: 32 }}>{p.emoji}{locked && '🔒'}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#000' : colors.text, marginTop: 4, textAlign: 'center' }}>
                        {p.display_name}
                      </Text>
                      <Text numberOfLines={2} style={{ fontSize: 10, color: active ? 'rgba(0,0,0,0.7)' : colors.textSecondary, textAlign: 'center', marginTop: 2, lineHeight: 13 }}>
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

              {/* Inline code button at bottom */}
              <TouchableOpacity
                onPress={() => setCodeModalOpen(true)}
                style={{ marginTop: 18, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>🔑 У меня уже есть код — ввести</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* === Detail modal (clicked on locked profile) === */}
      <Modal visible={detailProfile !== null} animationType="slide" transparent onRequestClose={() => setDetailProfile(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
            {detailProfile && (
              <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 30 }}>
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

                {detailProfile.sales_hook && (
                  <View style={{
                    backgroundColor: detailProfile.color + '22',
                    borderLeftWidth: 4, borderLeftColor: detailProfile.color,
                    paddingVertical: 10, paddingHorizontal: 12,
                    borderRadius: 8, marginTop: 8, marginBottom: 14,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.text, lineHeight: 19, fontWeight: '600' }}>
                      {detailProfile.sales_hook}
                    </Text>
                  </View>
                )}

                {detailProfile.long_description && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 }}>
                    {detailProfile.long_description}
                  </Text>
                )}

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

                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 }}>
                  🎮 {detailProfile.allowed_games === 'all' ? 'Все 47 игр' : `${(detailProfile.allowed_games as string[]).length} игр в этом профиле`}
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

                {!isAccessible(detailProfile.id) && (
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
                )}
                {isAccessible(detailProfile.id) && detailProfile.id !== profile.id && (
                  <TouchableOpacity
                    onPress={() => { switchProfile(detailProfile.id); setDetailProfile(null); onClose(); }}
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

      {/* === Code input modal === */}
      <Modal visible={codeModalOpen} animationType="fade" transparent onRequestClose={() => setCodeModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 22, gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>🔑 Код доступа</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
              Введи код чтобы разблокировать тематический профиль. Если кода нет — нажми «Запросить в Telegram» на странице профиля.
            </Text>
            <TextInput
              value={codeInput}
              onChangeText={(t) => { setCodeInput(t); setCodeError(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="например, CHESS-NZT-2026 или EXC-260822-A4F2-1B8C3D"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: codeError ? '#ef4444' : colors.border,
                borderRadius: 10, padding: 12, fontSize: 16,
                color: colors.text, fontFamily: 'monospace',
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
    </>
  );
}
