import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import PetSprite, { PetAccessory, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetSkin, getPetAccessory } from '@/src/services/pet';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getLevelStars, StarsMap } from '@/src/services/levelStars';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { hasBoss, isBossLevel } from '@/src/constants/bosses';

/**
 * LevelProgressMap — ТРОПИНКА уровней: цепочка нейронов вдоль аксона, на текущем
 * узле сидит питомец игрока.
 *
 * ЧТО БЫЛО ДО. Строка из пяти номеров со звёздами — «Уровень 7/15» и окошко 5..9.
 * Она честно показывала цифру, но не показывала ПУТЬ: сколько позади, сколько
 * впереди, где вехи. Денис: «тропинки прохождения уровней как это в играх делают
 * (там можно вернуться к боссу или какой-то интересной части)».
 *
 * ПОЧЕМУ НЕЙРОНЫ. Приложение про мозг, питомец — Синапс, промо-сайт нарисован
 * теми же дендритами. Тропинка из шариков-конфет смотрелась бы деталью из чужой
 * игры; узел-нейрон с отростками и бегущим по аксону импульсом — это тот же язык.
 *
 * ГЕОМЕТРИЯ. Узлы идут по пологой синусоиде слева направо, лента прокручивается
 * и сама встаёт на текущем уровне. Вертикальная змейка (как в match-3) заняла бы
 * пол-экрана конфига и увела бы вниз всё остальное — здесь высота фиксированная.
 *
 * ⚠️ ПРОПСЫ НЕ МЕНЯЛИСЬ. Компонент зовут 48 игр; менять сигнатуру значило бы
 * править 48 файлов и в паре забыть. Всё новое — внутри, плюс необязательный
 * onPickLevel: игра, которая УМЕЕТ переиграть пройденный уровень, передаёт его и
 * получает нажимаемые узлы; остальные — прежнюю картинку без мёртвых кнопок.
 */
interface Props {
  gameId: string;
  currentLevel: number;   // usePersistentLevel(...).level
  maxLevel?: number;      // по умолчанию 15 (программа «≥15 уровней»)
  colors: any;
  language: string;
  levelLabel?: (level: number) => string;
  /** Переиграть пройденный уровень. Не передан → узлы не нажимаются. */
  onPickLevel?: (level: number) => void;
  /**
   * true — число считает ПРОХОЖДЕНИЯ, а не ступени сложности.
   *
   * ЗАЧЕМ. Iowa, RMET, охват памяти — проверенные методики с нормами. Крутить в них
   * сложность нельзя: сломается сравнимость результата, а на ней и держится всё
   * «за каждым упражнением проверенная методика, а не придуманная механика».
   * Путь человеку показать хочется, но подписывать его «Уровень 7/15» — обещать
   * рост сложности, которого там нет. Поэтому подпись другая, а картинка та же.
   */
  countsRuns?: boolean;
}

// ─── раскладка ───
const GAP = 62;          // шаг между узлами
const PAD_X = 32;        // поля слева/справа, чтобы крайний узел не липнул к краю
const AMP = 13;          // амплитуда волны аксона
const WAVE_Y = 76;       // центр волны внутри полотна
// Высота полотна: питомец сверху + узел + звёзды (+ подпись уровня, если игра её даёт).
// Без подписи лишние 22 px — пустая полоса внизу карточки: её видно у 47 игр из 48.
const H_BASE = 128;
const H_LABEL = 150;
const R = 13;            // радиус обычного узла
const R_BOSS = 17;       // веха крупнее — её видно издалека
const PET = 42;

const nodeX = (i: number) => PAD_X + i * GAP;
const nodeY = (i: number) => WAVE_Y + AMP * Math.sin(i * 0.85);

/** Аксон между узлами: плавные C-сегменты с горизонтальными ручками. */
function axonPath(from: number, to: number): string {
  if (to <= from) return '';
  let d = `M ${nodeX(from).toFixed(1)} ${nodeY(from).toFixed(1)}`;
  for (let i = from + 1; i <= to; i++) {
    const x0 = nodeX(i - 1), y0 = nodeY(i - 1), x1 = nodeX(i), y1 = nodeY(i);
    d += ` C ${(x0 + GAP * 0.45).toFixed(1)} ${y0.toFixed(1)}, ${(x1 - GAP * 0.45).toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** Пятиконечная звезда за пройденный уровень (рисуем в том же SVG, без оверлеев). */
function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Отростки нейрона. У вехи их больше — крупный узел с четырьмя выглядит лысым. */
function dendrites(cx: number, cy: number, r: number, n: number) {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const len = r * 0.62;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.PI / 7;
    out.push({
      x1: cx + Math.cos(a) * r * 0.92,
      y1: cy + Math.sin(a) * r * 0.92,
      x2: cx + Math.cos(a) * (r + len),
      y2: cy + Math.sin(a) * (r + len),
    });
  }
  return out;
}

export default function LevelProgressMap({ gameId, currentLevel, maxLevel = 15, colors, levelLabel, onPickLevel, countsRuns }: Props) {
  const { t } = useLanguage();   // язык из контекста; проп language остался в Props для совместимости
  const { profile } = useProfile();
  const [stars, setStars] = useState<StarsMap>({});
  const [skin, setSkin] = useState<PetSkin>('cat');
  const [accessory, setAccessory] = useState<PetAccessory | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const viewW = useRef(0);

  useEffect(() => {
    let alive = true;
    if (profile?.id) getLevelStars(gameId, profile.id).then((m) => { if (alive) setStars(m); });
    return () => { alive = false; };
  }, [gameId, profile?.id, currentLevel]);

  // Питомец на тропинке — ТОТ ЖЕ, что у игрока везде: его облик и его аксессуар.
  // Рисовать здесь другого значило бы завести второго персонажа на ровном месте.
  useEffect(() => {
    let alive = true;
    Promise.all([getPetSkin(), getPetAccessory()]).then(([s, a]) => {
      if (!alive) return;
      setSkin(s); setAccessory(a);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const H = levelLabel ? H_LABEL : H_BASE;
  const reached = Math.min(Math.max(1, currentLevel), maxLevel);
  const cur = reached - 1;                    // индекс текущего узла
  const totalW = PAD_X * 2 + (maxLevel - 1) * GAP;
  const withBoss = hasBoss(gameId);

  // Лента сама встаёт на текущем уровне: иначе при 52 уровнях судоку человек видит
  // начало пути и должен догадаться, что его узел где-то правее за краем.
  const centerOnCurrent = (animated: boolean) => {
    const w = viewW.current;
    if (!w) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(nodeX(cur) - w / 2, totalW - w)), animated });
  };
  useEffect(() => { centerOnCurrent(true); }, [cur]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onLayout = (e: LayoutChangeEvent) => {
    viewW.current = e.nativeEvent.layout.width;
    centerOnCurrent(false);
  };

  // Подпись над лентой. У методик она про количество пройденного, а не про ступень.
  const heading = countsRuns
    ? t('runsCompleted').replace('{n}', String(reached - 1))
    : t('levelOfMax').replace('{n}', String(reached)).replace('{max}', String(maxLevel));

  const dim = colors.textSecondary;
  const accent = colors.primary;

  const nodes = [];
  for (let l = 1; l <= maxLevel; l++) {
    const i = l - 1;
    const s = stars[l] || 0;
    const passed = l < reached || s > 0;
    const isCur = l === reached;
    const boss = withBoss && isBossLevel(l);
    const r = boss ? R_BOSS : R;
    const x = nodeX(i), y = nodeY(i);
    const tone = passed ? accent : isCur ? accent : dim;

    nodes.push(
      <G key={l} opacity={passed || isCur ? 1 : 0.42}>
        {/* свечение синапса — только у пройденных: путь позади «горит» */}
        {passed && <Circle cx={x} cy={y} r={r + 9} fill={`url(#${gameId}-glow)`} />}
        {dendrites(x, y, r, boss ? 7 : 4).map((d, k) => (
          <Line key={k} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={tone} strokeWidth={boss ? 2 : 1.5} strokeLinecap="round" />
        ))}
        <Circle
          cx={x} cy={y} r={r}
          fill={passed ? accent : colors.surface}
          stroke={tone}
          strokeWidth={isCur ? 3 : 2}
          strokeDasharray={!passed && !isCur ? '3 3' : undefined}
        />
        {boss && <Circle cx={x} cy={y} r={r + 4} fill="none" stroke={tone} strokeWidth={1.5} opacity={0.75} />}
      </G>,
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>{heading}</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        accessibilityLabel={heading}
      >
        <View style={{ width: totalW, height: H }}>
          <Svg width={totalW} height={H}>
            <Defs>
              {/* id уникален по игре: на web все Svg живут в одном DOM, и одинаковый
                  id у двух карт перекрасил бы обе — url(#) берёт первый в документе */}
              <RadialGradient id={`${gameId}-glow`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={accent} stopOpacity="0.30" />
                <Stop offset="1" stopColor={accent} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* аксон впереди — пунктир: путь ещё не проложен */}
            <Path d={axonPath(cur, maxLevel - 1)} fill="none" stroke={dim} strokeWidth={4}
              strokeLinecap="round" strokeDasharray="2 9" opacity={0.55} />
            {/* аксон позади — сплошной, по нему бежит импульс */}
            <Path d={axonPath(0, cur)} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
            {Array.from({ length: cur }, (_, i) => (
              <Circle key={`imp${i}`} cx={(nodeX(i) + nodeX(i + 1)) / 2} cy={(nodeY(i) + nodeY(i + 1)) / 2}
                r={2.6} fill={accent} opacity={0.85} />
            ))}

            {nodes}

            {/* звёзды под пройденными + подпись уровня */}
            {Array.from({ length: maxLevel }, (_, i) => {
              const l = i + 1;
              const s = stars[l] || 0;
              if (!s) return null;
              const y = nodeY(i) + (withBoss && isBossLevel(l) ? R_BOSS : R) + 11;
              return (
                <G key={`st${l}`}>
                  {[0, 1, 2].map((k) => (
                    <Polygon key={k} points={starPoints(nodeX(i) + (k - 1) * 9, y, 4)}
                      fill={k < s ? '#FFD93B' : 'none'} stroke={k < s ? '#FFD93B' : colors.border} strokeWidth={1} />
                  ))}
                </G>
              );
            })}
          </Svg>

          {/* Питомец сидит НА текущем узле — «ты сейчас здесь». */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: nodeX(cur) - PET / 2, top: nodeY(cur) - R - PET + 4 }}
          >
            <PetSprite state="idle" size={PET} skin={skin} accessory={accessory} />
          </View>

          {/* Подписи уровней (судоку передаёт «лёгкий/средний/…») — под звёздами. */}
          {levelLabel && Array.from({ length: maxLevel }, (_, i) => (
            <Text
              key={`lb${i}`}
              numberOfLines={1}
              style={[styles.levelLabel, {
                left: nodeX(i) - GAP / 2,
                top: nodeY(i) + R + 20,
                width: GAP,
                color: i + 1 === reached ? accent : dim,
              }]}
            >
              {levelLabel(i + 1)}
            </Text>
          ))}

          {/* Нажимаемые узлы — только если игра умеет переиграть уровень. */}
          {onPickLevel && Array.from({ length: maxLevel }, (_, i) => {
            const l = i + 1;
            if (l >= reached && !(stars[l] || 0)) return null;
            return (
              <TouchableOpacity
                key={`tap${l}`}
                accessibilityRole="button"
                accessibilityLabel={`${t('level')} ${l}`}
                onPress={() => onPickLevel(l)}
                style={{ position: 'absolute', left: nodeX(i) - 22, top: nodeY(i) - 22, width: 44, height: 44 }}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12, gap: 6 },
  title: { fontSize: 13, fontWeight: '700' },
  levelLabel: { position: 'absolute', fontSize: 9, fontWeight: '600', textAlign: 'center' },
});
