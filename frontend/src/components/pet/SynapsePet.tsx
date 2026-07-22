/**
 * SynapsePet — SVG-персонаж «Синапс», порт с промо-сайта (NeuroPet.astro,
 * viewBox 300×300): фиолетовый шарик-нейрон с ушами-дендритами, хвостом-аксоном,
 * антеннами с импульсами и большими глазами.
 *
 * Что упрощено против сайта (и зачем):
 *  - стадии на сайте красятся CSS-фильтром hue-rotate(42°/292°) — в
 *    react-native-svg фильтров нет, поэтому цвета каждой стадии пересчитаны в
 *    статические палитры (та же математика поворота оттенка: 2-я стадия —
 *    маджента, 3-я — циан);
 *  - feDropShadow не поддержан → тень заменена эллипсом-«полом» под лапами;
 *  - моргание век / слежение глаз за курсором убраны (JS-затейливость сайта,
 *    на мобильном не читается) — оставлен idle-боб, он и даёт «живость».
 */
import React from 'react';
import { Animated, Easing } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop,
} from 'react-native-svg';
import type { PetStage } from '@/src/services/pet';

interface Props {
  stage: PetStage;
  size: number;
}

/**
 * Палитры стадий = hue-rotate сайта, посчитанный заранее:
 * стадия 2 — hue+42° (фиолет → маджента), стадия 3 — hue+292° (→ циан).
 * accent — мятные акценты (кончик хвоста + импульсы на антеннах).
 */
const PALETTES: Record<PetStage, {
  light: string; mid: string; deep: string;
  earFrom: string; earTo: string; feet: string;
  accent: string; antenna: string; haloOpacity: number;
}> = {
  1: { light: '#f2eeff', mid: '#b7a8ff', deep: '#6d4aff', earFrom: '#a995ff', earTo: '#7357e6', feet: '#7155db', accent: '#7cf0c5', antenna: '#8065ef', haloOpacity: 0.28 },
  2: { light: '#fceeff', mid: '#f4a8ff', deep: '#ec4aff', earFrom: '#f395ff', earTo: '#d757e6', feet: '#cd55db', accent: '#7cd2f0', antenna: '#d465ef', haloOpacity: 0.38 },
  3: { light: '#eefcff', mid: '#a8fcff', deep: '#4af4ff', earFrom: '#95f9ff', earTo: '#57dde6', feet: '#55cfdb', accent: '#b6f07c', antenna: '#65e9ef', haloOpacity: 0.48 },
};

// Уникальный префикс id градиентов на инстанс: на web все Svg живут в одном DOM,
// и одинаковые id у шапки (стадия N) и экрана /pet (стадия M) перекрасили бы
// друг друга — url(#) берёт ПЕРВЫЙ найденный id в документе.
let uidCounter = 0;

export default function SynapsePet({ stage, size }: Props) {
  const uid = React.useRef(`synapse${++uidCounter}`).current;
  const p = PALETTES[stage];

  // Idle-боб ±3px (как petFloat на сайте). На мини-размерах амплитуду ужимаем,
  // иначе 3px от 30px аватара — уже не «дыхание», а прыжки.
  const bob = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const amp = size < 48 ? 1.5 : 3;
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [amp, -amp] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox="0 0 300 300">
        <Defs>
          {/* Тело: тот же radialGradient petBody, свет из левого-верхнего «плеча» */}
          <RadialGradient id={`${uid}-body`} cx="35%" cy="24%" r="78%">
            <Stop offset="0" stopColor={p.light} />
            <Stop offset="0.42" stopColor={p.mid} />
            <Stop offset="1" stopColor={p.deep} />
          </RadialGradient>
          <LinearGradient id={`${uid}-ear`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={p.earFrom} />
            <Stop offset="1" stopColor={p.earTo} />
          </LinearGradient>
          {/* Свечение стадии (заменяет CSS-ауры .pet-aura): ярче с ростом */}
          <RadialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={p.deep} stopOpacity={p.haloOpacity} />
            <Stop offset="1" stopColor={p.deep} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Аура-свечение за персонажем */}
        <Circle cx="150" cy="160" r="132" fill={`url(#${uid}-halo)`} />
        {/* «Пол»-тень вместо feDropShadow */}
        <Ellipse cx="150" cy="263" rx="82" ry="11" fill="#372270" opacity="0.14" />

        {/* Хвост-аксон с мятным синапсом на конце */}
        <G>
          <Path d="M223 197c37 5 48-23 34-44" fill="none" stroke={`url(#${uid}-ear)`} strokeWidth="17" strokeLinecap="round" />
          <Circle cx="255" cy="150" r="10" fill={p.accent} />
        </G>
        {/* Антенны-дендриты + импульсы */}
        <G fill="none" stroke={p.antenna} strokeWidth="4" strokeLinecap="round">
          <Path d="M118 69Q95 30 80 39" />
          <Path d="M181 69q23-39 38-30" />
        </G>
        <G fill={p.accent}>
          <Circle cx="80" cy="39" r="8" />
          <Circle cx="219" cy="39" r="8" />
        </G>

        {/* Уши */}
        <Path d="M91 102Q45 72 55 146q7 36 47 30" fill={`url(#${uid}-ear)`} />
        <Path d="M208 102q46-30 36 44-7 36-47 30" fill={`url(#${uid}-ear)`} />
        {/* Тело */}
        <Path d="M150 65c58 0 92 41 86 105-4 47-31 78-86 78s-82-31-86-78c-6-64 28-105 86-105Z" fill={`url(#${uid}-body)`} />
        {/* Глаза + блики */}
        <Ellipse cx="111" cy="157" rx="18" ry="23" fill="#171421" />
        <Ellipse cx="104" cy="148" rx="6" ry="8" fill="#fff" />
        <Ellipse cx="189" cy="157" rx="18" ry="23" fill="#171421" />
        <Ellipse cx="182" cy="148" rx="6" ry="8" fill="#fff" />
        {/* Румянец */}
        <Ellipse cx="91" cy="190" rx="15" ry="7" fill="#ff98cb" opacity="0.42" />
        <Ellipse cx="209" cy="190" rx="15" ry="7" fill="#ff98cb" opacity="0.42" />
        {/* Улыбка */}
        <Path d="M136 190q14 14 28 0" fill="none" stroke="#4b328d" strokeWidth="4" strokeLinecap="round" />
        {/* Лапы */}
        <Ellipse cx="112" cy="244" rx="34" ry="13" fill={p.feet} />
        <Ellipse cx="188" cy="244" rx="34" ry="13" fill={p.feet} />

        {/* «Созвездие»: только 3-я стадия — звёздочки вокруг головы */}
        {stage === 3 && (
          <G fill={p.accent} opacity="0.9">
            <Circle cx="52" cy="86" r="4" />
            <Circle cx="246" cy="78" r="5" />
            <Circle cx="270" cy="196" r="3.5" />
            <Circle cx="34" cy="182" r="3" />
          </G>
        )}
      </Svg>
    </Animated.View>
  );
}
