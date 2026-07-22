import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, useWindowDimensions, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { gameIcon } from '@/src/constants/gameIcons';
import { gameThumb, gameThumbOpacity } from '@/src/constants/gameThumbs';

interface GameCardProps {
  id?: string;
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
  /** v1.108.0: прогресс уровней «⭐ X/15» (авто-поток). Нет данных → бейдж не рисуем. */
  starsInfo?: { completed: number };
}

/** Перцептивная яркость градиента: светлый → тёмный текст, тёмный → белый.
 *  Фикс читаемости карточек со светлыми градиентами (корректура/анаграммы/счёт/
 *  мишени и т.п.) — особенно заметно на светлых темах профилей. */
function gradientIsLight(grad: string[]): boolean {
  const lum = (hex: string) => {
    const h = (hex || '').replace('#', '');
    if (h.length < 6) return 0.5;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const avg = grad.reduce((s, c) => s + lum(c), 0) / Math.max(1, grad.length);
  return avg > 0.62;
}

export default function GameCard({
  id, nameKey, descKey, skillKey, gradient, icon, onPress, width, height, starsInfo,
}: GameCardProps) {
  useTheme();
  const gameImg = gameIcon(id);
  const thumb = gameThumb(id);   // превью-фон карточки (может не быть — тогда как раньше)
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) => Animated.spring(scale, { toValue: to, friction: 7, useNativeDriver: true }).start();
  const { t } = useLanguage();
  const { width: winWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  // Адаптивный контраст контента под яркость градиента карточки.
  const light = gradientIsLight(gradient);
  const fg = light ? '#1a1a1a' : '#FFFFFF';
  const fgSoft = light ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.8)';
  const iconBg = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)';
  const badgeBg = light ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.2)';
  const badgeFg = light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';

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
        aspectRatio: 1 / 1.06,       // v1.134: чуть ниже — сетка на десктопе была слишком высокой
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
      <Pressable
        onPress={onPress}
        onHoverIn={() => spring(1.03)}
        onHoverOut={() => spring(1)}
        style={{ flex: 1 }}
      >
        <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
        {/* v1.128.0: превью игры фоном под затемнением — репорт «кнопке хорошо бы
            скрин игры фоном под прозрачной». Миниатюры взяты готовыми с промо-сайта
            (там их отрисовали для страницы «Все 48 тренажёров»), ~4 КБ каждая.
            Игры без превью (13 новых) рендерятся как раньше — фолбэк на градиент. */}
        {thumb && (
          <View style={styles.thumbLayer} pointerEvents="none">
            {/* v1.134: превью — ФАКТУРА поверх градиента (низкая opacity), а не сплошная
                подложка: сплошной scrim убивал фирменный цвет карточек (скрин Дениса —
                сетка серых плиток). Контраст тексту даёт узкий фейд ТОЛЬКО снизу. */}
            <Image source={thumb} style={[styles.thumbImg, { opacity: gameThumbOpacity(id) }]} resizeMode="cover" />
            <LinearGradient
              colors={light
                ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)']
                : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']}
              style={styles.thumbFade}
            />
          </View>
        )}
        {/* Icon — top, fixed position */}
        {gameImg ? (
          <Image source={gameImg} style={styles.iconImage} resizeMode="cover" />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
            <Ionicons name={icon as any} size={28} color={fg} />
          </View>
        )}
        {/* Title + desc — middle, flex:1 fills available space */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: fg, textShadowColor: light ? 'transparent' : 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }]} numberOfLines={2}>{t(nameKey)}</Text>
          <Text style={[styles.description, { color: fgSoft }]} numberOfLines={2}>{t(descKey)}</Text>
        </View>
        {/* Badges — pinned to bottom (after flex:1 textContainer) */}
        <View style={styles.badgeRow}>
          {/* minWidth:0 — иначе при крупном системном шрифте skill-текст не даёт
              бейджу ужаться и звёзды-бейдж уезжает за край карточки */}
          <View style={[styles.skillBadge, { backgroundColor: badgeBg, flexShrink: 1, minWidth: 0 }]}>
            <Ionicons name="fitness-outline" size={12} color={badgeFg} />
            <Text style={[styles.skillText, { color: badgeFg }]} numberOfLines={1}>{t(skillKey)}</Text>
          </View>
          {starsInfo && starsInfo.completed > 0 && (
            // flexShrink:0 — звёзды не сжимаем, ужимается соседний skill-бейдж
            <View style={[styles.skillBadge, { backgroundColor: badgeBg, flexShrink: 0 }]}>
              <Text style={[styles.skillText, { color: '#FFD93B' }]} numberOfLines={1}>⭐ {Math.min(starsInfo.completed, 15)}/15</Text>
            </View>
          )}
        </View>
        </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Слой превью: абсолютом под контентом карточки, обрезается её borderRadius
  thumbLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  // фейд под текстовой зоной (нижняя треть) — не трогает верх карточки
  thumbFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  card: {
    flex: 1,                       // fill wrapper
    borderRadius: 20,
    padding: 14,
    flexDirection: 'column',
  },
  iconImage: { width: 52, height: 52, borderRadius: 14 },
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
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  description: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
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
