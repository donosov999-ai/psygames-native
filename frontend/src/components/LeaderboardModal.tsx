// Простой топ-20 лидерборда (v1.116.0, пилот schulte_table_5x5/n_back). Модалка, без
// анимаций — минимальный UI, чтобы проверить ценность механики прежде чем полировать.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchTop, LeaderboardEntry, LeaderboardGameId } from '@/src/services/leaderboard';

interface Props {
  visible: boolean;
  onClose: () => void;
  gameId: LeaderboardGameId;
  language: string;
  colors: any;
  gradient: string[];
  formatScore: (score: number) => string;   // напр. "12.3s" или "7-back"
}

export default function LeaderboardModal({ visible, onClose, gameId, language, colors, gradient, formatScore }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEntries(null);
    fetchTop(gameId, 20).then(setEntries);
  }, [visible, gameId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {language === 'ru' ? '🏆 Топ игроков' : '🏆 Leaderboard'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {entries === null ? (
            <ActivityIndicator color={gradient[0]} style={{ marginVertical: 24 }} />
          ) : entries.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 24 }}>
              {language === 'ru' ? 'Пока пусто — стань первым!' : 'Empty so far — be the first!'}
            </Text>
          ) : (
            <FlatList
              data={entries}
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
});
