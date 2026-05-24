import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

interface GameCardProps {
  nameKey: string;
  descKey: string;
  skillKey: string;
  gradient: string[];
  icon: string;
  onPress: () => void;
  /**
   * v1.6.1: width теперь может быть number (px, для native) или string ('100%' для web grid).
   * Если string → используется как есть. Если number → fixed px width.
   */
  width?: number | string;
  /** Только number (на web используется aspectRatio вместо явной height). */
  height?: number;
}

export default function GameCard({
  nameKey, descKey, skillKey, gradient, icon, onPress, width, height,
}: GameCardProps) {
  useTheme();
  const { t } = useLanguage();
  const { width: winWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  // Fallback (когда GameCard используется ВНЕ index.tsx grid) — 2 столбца fluid
  const fallbackWidth = Math.min((winWidth - 48) / 2, 180);
  const cardWidth = width ?? fallbackWidth;
  // На web используем aspectRatio (1.2 = высота / ширина) — высота сама подгонится
  // под фактическую ширину grid-ячейки. На native — явная height в px.
  const cardHeight = height ?? (typeof cardWidth === 'number' ? cardWidth * 1.2 : undefined);

  // ─── WEB: контейнер с width:100% (или переданная %) + aspectRatio ──────
  // Это рендерится как <div style="width:100%;aspect-ratio:1/1.2"> в HTML.
  // Grid parent (gridTemplateColumns: repeat(auto-fill, minmax(170px, 1fr)))
  // гарантирует одинаковую ширину между секциями.
  //
  // ─── NATIVE: фиксированные пиксельные width+height ────────────────────
  // Для iOS/Android RN, flex-wrap parent. На native flex стабилен.
  const wrapperStyle: any = isWeb
    ? {
        width: cardWidth,            // обычно '100%' от index.tsx
        aspectRatio: 1 / 1.2,        // высота автоматом по ширине
      }
    : {
        width: cardWidth,
        height: cardHeight,
        minWidth: cardWidth,
        maxWidth: cardWidth,
        minHeight: cardHeight,
        maxHeight: cardHeight,
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: cardWidth,
        marginRight: 10,
        marginBottom: 10,
      };

  return (
    <View style={wrapperStyle}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
        {/* Icon — top, fixed position */}
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={28} color="#FFFFFF" />
        </View>
        {/* Title + desc — middle, flex:1 fills available space */}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{t(nameKey)}</Text>
          <Text style={styles.description} numberOfLines={2}>{t(descKey)}</Text>
        </View>
        {/* Badge — pinned to bottom (after flex:1 textContainer) */}
        <View style={styles.skillBadge}>
          <Ionicons name="fitness-outline" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={styles.skillText} numberOfLines={1}>{t(skillKey)}</Text>
        </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,                       // fill wrapper
    borderRadius: 20,
    padding: 14,
    flexDirection: 'column',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,                       // fills space between icon and badge
    marginTop: 12,
    gap: 4,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  description: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 14,
  },
  skillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  skillText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    flexShrink: 1,
  },
});
