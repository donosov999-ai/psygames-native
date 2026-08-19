// Простой топ-20 лидерборда (v1.116.0). Модалка, без анимаций — минимальный UI, чтобы
// проверить ценность механики прежде чем полировать.
//
// 🔴 ПУСТАЯ ТАБЛИЦА ЧИТАЕТСЯ КАК ПОЛОМКА. Строка «Пока пусто — стань первым!» честна
// ровно в одном случае: сервер ответил и в таблице действительно никого. Но `fetchTop`
// возвращает пустой массив ЕЩЁ И при отсутствии сети, при заблокированном домене
// (в РФ supabase.co режется — см. шапку services/supabase.ts) и при игре, которую
// серверная RPC пока не знает. Во всех этих случаях человек, у которого рекорд ЕСТЬ,
// видел бы пустоту и решал, что сломалось. Поэтому личный рекорд читается ВСЕГДА и
// подставляется, как только чужих результатов не пришло.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchTop, getPersonalBest, leaderboardView, LeaderboardEntry, LeaderboardGameId } from '@/src/services/leaderboard';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { a11yModal } from '@/src/services/a11y';

interface Props {
  visible: boolean;
  onClose: () => void;
  gameId: LeaderboardGameId;
  language: string;
  colors: any;
  gradient: string[];
  formatScore: (score: number) => string;   // напр. "12.3s" или "7-back"
}

export default function LeaderboardModal({ visible, onClose, gameId, colors, gradient, formatScore }: Props) {
  const { t } = useLanguage();   // язык из контекста; проп language остался в Props для совместимости
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [personalBest, setPersonalBest] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEntries(null);
    setPersonalBest(null);
    // Личный рекорд лежит в AsyncStorage и приходит быстрее сети — но ждём оба, иначе
    // на секунду мелькнёт «пусто», а это ровно то сообщение, от которого мы уходим.
    Promise.all([fetchTop(gameId, 20), getPersonalBest(gameId)]).then(([top, own]) => {
      setPersonalBest(own);
      setEntries(top);
    });
  }, [visible, gameId]);

  // Само правило «что показать» — в services/leaderboard.ts (чистая функция, её гоняет гейт).
  const view = leaderboardView(entries, personalBest);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View {...a11yModal} style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('leaderboardTitle')}
            </Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {view.kind === 'loading' ? (
            <ActivityIndicator color={gradient[0]} style={{ marginVertical: 24 }} />
          ) : view.kind === 'empty' ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 24 }}>
              {t('leaderboardEmpty')}
            </Text>
          ) : view.kind === 'personal' ? (
            <View style={{ marginVertical: 24, alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                {t('leaderboardPersonalOnly')}
              </Text>
              <Text style={[styles.personalScore, { color: gradient[0] }]}>{formatScore(view.score)}</Text>
            </View>
          ) : (
            <FlatList
              data={view.entries}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 360 }}
              renderItem={({ item, index }) => (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rank, { color: colors.textSecondary }]}>{index + 1}</Text>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.player_name}</Text>
                  <Text style={[styles.score, { color: gradient[0] }]}>{formatScore(item.score)}</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  rank: { width: 24, fontSize: 13, fontWeight: '700' },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  score: { fontSize: 14, fontWeight: '700' },
  personalScore: { fontSize: 26, fontWeight: '800' },
});
