import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, useWindowDimensions, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GradientSurface from '@/src/components/GradientSurface';
import { onGradientText, onGradientTextMuted, innerScrim, accentOn, relativeLuminance } from '@/src/services/onGradientText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { gameIcon } from '@/src/constants/gameIcons';
import { gameThumb, gameThumbOpacity } from '@/src/constants/gameThumbs';
import { a11yDecor } from '@/src/services/a11y';
import { settle } from '@/src/components/juice/motion';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

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
  /**
   * 🔴 РАЗВИЛКА ЛИ ЭТО. Просьба Дениса 04.09.2026: «где хаб — рисовать значок в
   * правом углу, чтобы я видел сразу». До этого развилка и упражнение выглядели
   * одинаково, и понять, ведёт карточка в игру или в меню, можно было только
   * нажав. Сколько игр внутри — числом рядом со значком: «меню» без числа не
   * говорит, сколько там.
   */
  hubCount?: number;
}

export default function GameCard({
  id, nameKey, descKey, skillKey, gradient, icon, onPress, width, height, starsInfo, hubCount,
}: GameCardProps) {
  useTheme();
  const gameImg = gameIcon(id);
  const thumb = gameThumb(id);   // превью-фон карточки (может не быть — тогда как раньше)
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const spring = (to: number) => settle(scale, to, reduced, { friction: 7 });
  /**
   * Щадящий режим: подъём карточки под курсором гасим целиком. На витрине из
   * шести десятков игр палец или мышь проходит над десятком карточек подряд,
   * и каждая под ними дышит — на экране получается волна. Смысла в ней ноль:
   * что курсор на карточке, видно по самому курсору, а что карточка нажимаемая
   * — по её роли для скринридера. Тапу отвечает переход на игру.
   */
  useEffect(() => { if (reduced) settle(scale, 1, true); }, [reduced, scale]);
  const { t } = useLanguage();
  const { width: winWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  /**
   * КОНТРАСТ КАРТОЧКИ СЧИТАЕТСЯ ОБЩИМ СЕРВИСОМ, А НЕ ПРИКИДКОЙ НА МЕСТЕ.
   *
   * Здесь жила своя формула яркости — телевизионные веса 0.299/0.587/0.114,
   * СРЕДНЕЕ по концам градиента и порог 0.62 на глаз, дальше жёстко `#1a1a1a`
   * или `#FFFFFF`. Две ошибки разом:
   *   · веса не те. WCAG считает светлоту иначе (0.2126/0.7152/0.0722 по
   *     линеаризованным каналам), и решение «светлый/тёмный» расходилось;
   *   · СРЕДНЕЕ по концам врёт. Надпись лежит поперёк карточки и попадает на весь
   *     размах: у `#0083B0→#00B4DB` среднее «тёмное» → белый текст → 2.46 на
   *     светлом конце. У `#06b6d4→#3b82f6` — 2.43. Это витрина: по ней человек
   *     выбирает игру.
   * Теперь цвет считает `onGradientText` по ОБОИМ концам, а где сплошным цветом
   * AA недостижим — `GradientSurface` кладёт вуаль.
   */
  const onGrad = onGradientText(gradient[0], gradient[gradient.length - 1]);
  const fg = onGrad.color;
  const fgSoft = onGradientTextMuted(onGrad);
  // «Светлая карточка» — это та, на которой считанный текст вышел ТЁМНЫМ.
  const light = relativeLuminance(fg) < relativeLuminance(onGrad.ends[0]);
  const iconBg = innerScrim(onGrad, 0.16);
  const badgeBg = innerScrim(onGrad, 0.2);
  const badgeFg = fgSoft;

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
        accessibilityRole="button"
        onPress={onPress}
        onHoverIn={() => { if (!reduced) spring(1.03); }}
        onHoverOut={() => { if (!reduced) spring(1); }}
        style={{ flex: 1 }}
      >
        <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
        <GradientSurface
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
        {/* v1.128.0: превью игры фоном под затемнением — репорт «кнопке хорошо бы
            скрин игры фоном под прозрачной». Миниатюры взяты готовыми с промо-сайта
            (там их отрисовали для страницы «Все 48 тренажёров»), ~4 КБ каждая.
            v1.168: превью есть у ВСЕХ игр каталога (проверено сверкой id со списком
            файлов) — фолбэк на голый градиент остаётся только страховкой. */}
        {thumb && (
          <View style={styles.thumbLayer} pointerEvents="none">
            {/* v1.134: превью — ФАКТУРА поверх градиента (низкая opacity), а не сплошная
                подложка: сплошной scrim убивал фирменный цвет карточек (скрин Дениса —
                сетка серых плиток). Контраст тексту даёт узкий фейд ТОЛЬКО снизу. */}
            <Image {...a11yDecor} source={thumb} style={[styles.thumbImg, { opacity: gameThumbOpacity(id) }]} resizeMode="cover" />
            <LinearGradient
              colors={light
                ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)']
                : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']}
              style={styles.thumbFade}
            />
          </View>
        )}
        {/* 🔴 Значок развилки — правый верхний угол, поверх превью. Ставим ДО иконки
            игры, чтобы он не зависел от того, картинка там или глиф. */}
        {hubCount ? (
          <View style={[styles.hubBadge, { backgroundColor: iconBg }]} pointerEvents="none">
            <Ionicons name="layers" size={13} color={fg} />
            <Text style={[styles.hubBadgeText, { color: fg }]}>{hubCount}</Text>
          </View>
        ) : null}
        {/* Icon — top, fixed position */}
        {gameImg ? (
          <Image {...a11yDecor} source={gameImg} style={styles.iconImage} resizeMode="cover" />
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
              <Text style={[styles.skillText, { color: accentOn(onGrad, '#FFD93B') }]} numberOfLines={1}>⭐ {Math.min(starsInfo.completed, 15)}/15</Text>
            </View>
          )}
        </View>
        </GradientSurface>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Значок развилки. Абсолютом в правом верхнем углу: карточка внутри — колонка с
   * flex:1 у текста, и обычным потоком значок сдвинул бы заголовок.
   */
  hubBadge: {
    position: 'absolute', top: 8, right: 8, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
  },
  hubBadgeText: { fontSize: 12, fontWeight: '800' },
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
  },
  description: {
    fontSize: 11,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  skillText: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },
});
