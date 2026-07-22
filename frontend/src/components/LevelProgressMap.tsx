import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getLevelStars, StarsMap } from '@/src/services/levelStars';
import { useLanguage } from '@/src/contexts/LanguageContext';

/**
 * LevelProgressMap — компактный бейдж на экране конфига: «Уровень X/Y» + звёзды
 * по окну уровней вокруг текущего (не вся лесенка целиком — компактно).
 * Звёзды читаются из levelStars (пишет LevelCleared при каждом чистом уровне).
 */
interface Props {
  gameId: string;
  currentLevel: number;   // usePersistentLevel(...).level
  maxLevel?: number;      // по умолчанию 15 (программа «≥15 уровней»)
  colors: any;
  language: string;
}

const WINDOW = 5;

export default function LevelProgressMap({ gameId, currentLevel, maxLevel = 15, colors }: Props) {
  const { t } = useLanguage();   // язык из контекста; проп language остался в Props для совместимости
  const { profile } = useProfile();
  const [stars, setStars] = useState<StarsMap>({});

  useEffect(() => {
    let alive = true;
    if (profile?.id) getLevelStars(gameId, profile.id).then((m) => { if (alive) setStars(m); });
    return () => { alive = false; };
  }, [gameId, profile?.id, currentLevel]);

  const reached = Math.min(Math.max(1, currentLevel), maxLevel);
  const from = Math.max(1, Math.min(reached - Math.floor(WINDOW / 2), maxLevel - WINDOW + 1));
  const to = Math.min(maxLevel, from + WINDOW - 1);
  const levels: number[] = [];
  for (let l = from; l <= to; l++) levels.push(l);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('levelOfMax').replace('{n}', String(reached)).replace('{max}', String(maxLevel))}
      </Text>
      <View style={styles.row}>
        {levels.map((l) => {
          const s = stars[l] || 0;
          const isCurrent = l === reached;
          return (
            <View key={l} style={styles.cell}>
              <Text style={[styles.lvlNum, { color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: isCurrent ? '800' : '600' }]}>{l}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3].map((i) => (
                  <Ionicons key={i} name={i <= s ? 'star' : 'star-outline'} size={9}
                    color={i <= s ? '#FFD93B' : colors.border} />
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12, gap: 8 },
  title: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 3 },
  lvlNum: { fontSize: 11 },
  starsRow: { flexDirection: 'row', gap: 1 },
});
