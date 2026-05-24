import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
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
  width?: number;   // explicit width from parent grid; falls back to fluid
  height?: number;  // explicit height
}

export default function GameCard({
  nameKey, descKey, skillKey, gradient, icon, onPress, width, height,
}: GameCardProps) {
  useTheme();
  const { t } = useLanguage();
  const { width: winWidth } = useWindowDimensions();

  // If no explicit width provided, fall back to a fluid 2-column layout (used when
  // GameCard is placed somewhere outside the grouped grid).
  const cardWidth = width ?? Math.min((winWidth - 48) / 2, 180);
  const cardHeight = height ?? cardWidth * 1.2;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ width: cardWidth }}>
      <LinearGradient
        colors={gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { width: cardWidth, height: cardHeight }]}
      >
        {/* Icon — top, fixed position */}
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={28} color="#FFFFFF" />
        </View>
        {/* Title + desc — middle, fixed offset from icon (not space-between!) */}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{t(nameKey)}</Text>
          <Text style={styles.description} numberOfLines={2}>{t(descKey)}</Text>
        </View>
        {/* Badge — bottom, pinned via marginTop:auto */}
        <View style={styles.skillBadge}>
          <Ionicons name="fitness-outline" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={styles.skillText} numberOfLines={1}>{t(skillKey)}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    // No justifyContent: items stack from top with explicit margins below.
    // Removed `space-between` to avoid empty-gap shifting when desc is short.
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
    marginTop: 12,
    gap: 4,
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
    marginTop: 'auto',   // pin to bottom of card regardless of desc length
  },
  skillText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    flexShrink: 1,
  },
});
