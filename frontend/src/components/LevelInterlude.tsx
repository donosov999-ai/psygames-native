/* psygames-level-interlude · VER 1 · 19.08.2026 */
/**
 * ЗАСТАВКА МЕЖДУ УРОВНЯМИ — вертикальная картинка, короткая передышка и переход
 * питомца на следующий уровень.
 *
 * 🔴 ЗАЧЕМ. Заказ Дениса 19.08.2026 дословно: «я хочу между уровнями чтобы
 * показывалась картинка, но не горизонтальная, а вертикальная на телефонах,
 * типа мини-пауза вроде как человеку, на пару секунд, и движение питомца на
 * новый уровень визуально».
 *
 * Три вещи, и каждая по делу:
 *   · КАРТИНКА даёт глазу сменить план после доски, забитой мелкими деталями;
 *   · ПАУЗА на пару секунд — то самое «выдохнуть», без неё уровни сливаются в
 *     один длинный; она же и так была (авто-поток 2.2 с), просто была пустой;
 *   · ДВИЖЕНИЕ ПИТОМЦА показывает продвижение НАГЛЯДНО. Тропинка на экране
 *     настроек показывает, где человек стоит, но между уровнями её не видно —
 *     а именно в этот момент и происходит переход, ради которого всё делалось.
 *
 * ⚠️ ВЕРТИКАЛЬНАЯ — ЭТО ПРО ТЕЛЕФОН, А НЕ ПРО ВКУС. Горизонтальная картинка на
 * телефоне занимает узкую полосу посередине, и вокруг остаются два пустых поля.
 * Панели нарисованы под 720×1222 (примерно 0.59) — это доля экрана телефона, а
 * не «широкий кадр, ужатый до ширины».
 *
 * ⚠️ КАРТИНКА НЕ ДОЛЖНА МЕШАТЬ ЧИТАТЬ. Поверх неё идут номер уровня, звёзды и
 * строка «запускаю следующий», поэтому сверху и снизу лежат затемняющие шторки,
 * а нижняя треть панелей нарисована намеренно спокойной.
 */
import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Animated, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PetSprite, { PetAccessory, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetSkin, getPetAccessory } from '@/src/services/pet';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';

/**
 * Панели рисуются одним листом и режутся на четыре — так дешевле и так они
 * держат общий свет и стиль. Порядок — суточный: утро, день, закат, ночь; он
 * повторяется каждые четыре уровня и сам по себе читается как ход времени.
 */
const PANELS = [
  require('../../assets/images/interlude/meadow.webp'),
  require('../../assets/images/interlude/forest.webp'),
  require('../../assets/images/interlude/town.webp'),
  require('../../assets/images/interlude/night.webp'),
];

interface Props {
  level: number;           // пройденный уровень; питомец идёт с него на level + 1
  stars: number;           // 1–3
  ms: number;              // сколько держать заставку
  nextLine: string;        // «Запускаю уровень N» — готовая строка от вызывающего
  doneLine: string;        // «Уровень N пройден»
  colors: any;
}

const PET = 46;

export default function LevelInterlude({ level, stars, ms, nextLine, doneLine, colors }: Props) {
  // ⚠️ НЕ `useWindowDimensions()` НАПРЯМУЮ: на первом кадре он отдаёт 0, и
  // `Math.min(0 - 80, 280)` даёт −80 — дорожка схлопывается со 280 px до 105.
  // Проверено здесь же 19.08.2026, через час после той же беды в тропинке.
  const width = useScreenWidth();
  const [skin, setSkin] = React.useState<PetSkin>('cat');
  const [accessory, setAccessory] = React.useState<PetAccessory | null>(null);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    Promise.all([getPetSkin(), getPetAccessory()]).then(([s, a]) => {
      if (alive) { setSkin(s); setAccessory(a); }
    }).catch(() => {});
    // Уважаем системную настройку «меньше движения»: для части людей плавные
    // проезды по экрану — не украшение, а тошнота. Питомец тогда просто стоит
    // на новом узле, и заставка остаётся понятной.
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduced(!!v); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /**
   * Ход питомца занимает 70% времени заставки: он обязан ДОЙТИ и постоять на
   * новом узле хотя бы мгновение. Если тянуть до конца, переход к следующему
   * уровню обрежет движение на полушаге, и получится не «дошёл», а «пропал».
   */
  const walk = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (reduced) { walk.setValue(1); return; }
    const a = Animated.timing(walk, {
      toValue: 1,
      duration: Math.max(400, Math.round(ms * 0.7)),
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [ms, reduced, walk]);

  const panel = PANELS[Math.max(0, level) % PANELS.length];

  // Дорожка внизу: от узла «пройден» к узлу «следующий».
  const trackW = Math.min(width - 80, 280);
  // Едет от левого узла до правого: минус ширина самого питомца, иначе он
  // уползёт за узел и встанет мимо.
  const shift = walk.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, trackW - PET)] });

  return (
    <ImageBackground source={panel} style={styles.root} resizeMode="cover">
      {/*
        Шторки: без них белый текст пропадает на светлом лугу, а тёмный — на ночи.
        ⚠️ Гаснут строго в НОЛЬ. Первая редакция заканчивалась на 0.05, и на
        границе шторки поперёк картинки шла отчётливая ступенька — снимок 19.08.
        Ноль против нуля стыка не даёт.
      */}
      <LinearGradient colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0)']} style={styles.scrimTop} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.66)']} style={styles.scrimBottom} pointerEvents="none" />

      <View style={styles.top}>
        <Text style={styles.done}>{doneLine}</Text>
        <View style={styles.stars}>
          {[1, 2, 3].map((i) => (
            <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={30}
              color={i <= stars ? '#FFD93B' : 'rgba(255,255,255,0.55)'} />
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        {/*
          ⚠️ УЗЛЫ РАССТАВЛЕНЫ СТРОКОЙ, А НЕ ABSOLUTE-КООРДИНАТАМИ.
          Первая редакция ставила оба узла через `position:absolute` + `left`, и в
          веб-сборке они разъехались задом наперёд: следующий уровень оказался
          СЛЕВА от пройденного, а пунктир — сбоку от обоих. Строка `row` даёт
          порядок сама и не зависит от того, как каркас считает начало отсчёта.
          Абсолютным остаётся ровно один элемент — питомец, которому и надо ехать.
        */}
        <View style={[styles.track, { width: trackW }]}>
          <View style={[styles.node, styles.nodeDone]}><Text style={styles.nodeText}>{level}</Text></View>
          {/* Пунктир рисуем точками, а не Svg: одна линия не стоит ещё одного
              модуля в дереве зависимостей. */}
          <View style={styles.dots}>
            {Array.from({ length: 9 }).map((_, i) => <View key={i} style={styles.dot} />)}
          </View>
          <View style={[styles.node, styles.nodeNext]}><Text style={styles.nodeText}>{level + 1}</Text></View>
          <Animated.View style={[styles.pet, { transform: [{ translateX: shift }] }]} pointerEvents="none">
            <PetSprite state={reduced ? 'idle' : 'walk'} size={PET} skin={skin} accessory={accessory} />
          </Animated.View>
        </View>
        <Text style={styles.next}>{nextLine}</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  scrimTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 260 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 300 },
  top: { alignItems: 'center', paddingTop: 44, gap: 10 },
  done: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center', paddingHorizontal: 20,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  stars: { flexDirection: 'row', gap: 6 },
  /**
   * ⚠️ ОТСТУП СНИЗУ БОЛЬШЕ, ЧЕМ КАЖЕТСЯ НУЖНЫМ. В левом нижнем углу на КАЖДОМ
   * экране висит круглая кнопка отзыва (FeedbackWidget, ~48 px + отступ), и при
   * обычном отступе она наезжала прямо на узел пройденного уровня. Проверено
   * снимком 19.08.2026.
   */
  bottom: { alignItems: 'center', paddingBottom: 132, gap: 14 },
  track: { height: PET + 30, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  dots: { flex: 1, marginBottom: 11, height: 4, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  node: { width: 34, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  nodeDone: { backgroundColor: 'rgba(52,211,153,0.92)', borderColor: '#ffffff' },
  nodeNext: { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.85)' },
  nodeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  // Питомец едет поверх дорожки: он один и обязан двигаться, остальное стоит.
  pet: { position: 'absolute', bottom: 24, left: 0 },
  next: {
    color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
});
