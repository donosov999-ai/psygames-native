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

  // CRITICAL: outer <View> with FIXED width+height (renders as <div style="width:Xpx;height:Ypx">
  // in RN Web — rock-solid, ignored by flex distribution). TouchableOpacity and LinearGradient
  // inside use flex:1 to fill exactly. flexBasis/flexShrink alone are unreliable in RN Web.
  return (
    <View style={{
      width: cardWidth,
      height: cardHeight,
      minWidth: cardWidth,
      maxWidth: cardWidth,
      minHeight: cardHeight,
      maxHeight: cardHeight,
      flexShrink: 0,
      flexGrow: 0,
      flexBasis: cardWidth,
      // Per-card margin instead of parent's `gap` (RN Web bug with flex-wrap)
      marginRight: 10,
      marginBottom: 10,
    }}>
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
    flex: 1,                       // fill TouchableOpacity (cardWidth × cardHeight)
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
    // No marginTop:auto: textContainer flex:1 already pushes badge to bottom.
  },
  skillText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    flexShrink: 1,
  },
});
