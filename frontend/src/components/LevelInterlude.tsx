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
import { View, Text, StyleSheet, ImageBackground, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PetSprite, { PetAccessory, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetSkin, getPetAccessory } from '@/src/services/pet';
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

/**
 * Панели рисуются ЛИСТОМ по четыре и режутся — так дешевле и так четвёрка держит
 * общий свет и стиль. Листов два, панелей восемь.
 *
 * Порядок не случайный: сначала суточный круг (утро → день → закат → ночь),
 * потом годовой (осень → горы → лето у воды → зима). Восемь уровней подряд идут
 * без повтора, и смена картинки сама читается как ход времени, а не как
 * случайная подмена фона.
 *
 * ⚠️ Почему не четыре, как было сначала: круг замыкался каждые четыре уровня, и
 * к десятому человек видел каждую панель уже трижды. Восемь стоят 512 КБ на все
 * — дешевле одного спрайтового набора игры.
 */
const PANELS = [
  require('../../assets/images/interlude/meadow.webp'),
  require('../../assets/images/interlude/forest.webp'),
  require('../../assets/images/interlude/town.webp'),
  require('../../assets/images/interlude/night.webp'),
  require('../../assets/images/interlude/autumn.webp'),
  require('../../assets/images/interlude/mountain.webp'),
  require('../../assets/images/interlude/dunes.webp'),
  require('../../assets/images/interlude/winter.webp'),
];

interface Props {
  level: number;           // пройденный уровень; питомец идёт с него на level + 1
  stars: number;           // 1–3
  ms: number;              // сколько держать заставку
  nextLine: string;        // «Запускаю уровень N» — готовая строка от вызывающего
  doneLine: string;        // «Уровень N пройден»
  colors: any;
}

/**
 * ОКНО СТУПЕНЕЙ ЗАСТАВКИ — до четырёх, кончая следующей.
 *
 * 🔴 ПОЧЕМУ ЭКСПОРТИРУЕТСЯ. Гейт обязан гонять ЭТУ функцию, а не свою копию
 * формулы. Первая редакция проверки считала окно сама — и осталась зелёной,
 * когда я нарочно сломал компонент до одного перехода: тест проверял свойства
 * формулы, а не то, что компонент ею пользуется. Один источник, а не два.
 *
 * Ниже единицы ступеней не бывает, поэтому на первых уровнях окно короче: на
 * переходе 1→2 видно две ступени, на 2→3 — три, дальше всегда четыре.
 */
export function interludeSteps(level: number): number[] {
  const from = Math.max(1, level - 2);
  const out: number[] = [];
  for (let n = from; n <= level + 1; n++) out.push(n);
  return out;
}

const PET = 46;
/** Ступень — круг: вертикальная лестница из овалов читается как список, а не как путь. */
const NODE = 36;

export default function LevelInterlude({ level, stars, ms, nextLine, doneLine, colors }: Props) {
  // ⚠️ НЕ `useWindowDimensions()` НАПРЯМУЮ: на первом кадре он отдаёт 0, и
  // `Math.min(0 - 80, 280)` даёт −80 — дорожка схлопывается со 280 px до 105.
  // Проверено здесь же 19.08.2026, через час после той же беды в тропинке.
  const { w: width, h: screenH } = useScreenSize();
  const [skin, setSkin] = React.useState<PetSkin>('cat');
  const [accessory, setAccessory] = React.useState<PetAccessory | null>(null);
  /**
   * ⚠️ НАСТРОЙКУ «МЕНЬШЕ ДВИЖЕНИЯ» БЕРЁМ ХУКОМ, А НЕ У СИСТЕМЫ НАПРЯМУЮ.
   *
   * Первая редакция спрашивала систему сама, и это было тихо неверно дважды.
   * Во-первых, у react-native-web внутри стоит `resolve(media ? media.matches
   * : true)` — БЕЗ DOM он отвечает «включено», а DOM'а нет ровно на пререндере
   * статического экспорта: щадящий режим достался бы всем подряд. Во-вторых,
   * разового вопроса мало — человек может переключить тумблер на ходу, и
   * подписка на это есть только в хуке.
   */
  const reduced = useReducedMotion();

  React.useEffect(() => {
    let alive = true;
    Promise.all([getPetSkin(), getPetAccessory()]).then(([s, a]) => {
      if (alive) { setSkin(s); setAccessory(a); }
    }).catch(() => {});
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

  /**
   * ЛЕСТНИЦА СТУПЕНЕЙ — СНИЗУ ВВЕРХ, И НЕ ОДНА СТУПЕНЬ, А НЕСКОЛЬКО.
   *
   * 🔴 ДВЕ ПРАВКИ ПО ЗАМЕЧАНИЮ ДЕНИСА 21.08.2026, дословно: «питомец должен
   * двигаться снизу экрана по этой дорожке пути вверх, а не вбок» и «почему
   * показывается только один шаг уровней, типа 2-3, а 1 шаг уже не виден».
   *
   * ⚠️ ВВЕРХ — ЭТО НЕ ВКУС. Подъём читается как рост сам по себе: движение вверх
   * означает продвижение в любой игре, где есть уровни, и объяснять это не надо.
   * Ход вбок такого смысла не несёт — он читается как «перешёл», а не «поднялся».
   * Заодно вертикаль совпадает с формой самой картинки: панели нарисованы под
   * телефон (720×1222), и лестница идёт вдоль кадра, а не поперёк.
   *
   * ⚠️ ПОЧЕМУ ВИДНЫ ПРОЙДЕННЫЕ, А НЕ ТОЛЬКО ПЕРЕХОД. Два узла показывали
   * СОБЫТИЕ («из 2 в 3») и не показывали ПУТЬ. Пройденные ступени под ногами —
   * это единственное место в заставке, где видно, сколько уже сделано; без них
   * каждый переход выглядит одинаково, на каком бы уровне человек ни был.
   *
   * Окно — до четырёх ступеней, кончая следующей. На первых уровнях их меньше
   * просто потому, что позади меньше: на переходе 1→2 видно две, на 2→3 — три,
   * дальше всегда четыре. Ниже единицы ступеней нет.
   */
  const steps = interludeSteps(level);

  /**
   * Высота лестницы — доля экрана, а не число: на маленьком телефоне
   * фиксированные 300 съели бы место под текстом, на большом лестница из
   * четырёх ступеней выглядела бы прижатой к низу.
   */
  const trackH = Math.max(170, Math.min(Math.round(screenH * 0.42), 300));
  /**
   * Шаг между центрами ступеней. Считаем сами, а не измеряем разметку: питомцу
   * надо стартовать ДО первого кадра, а размеры приезжают после onLayout —
   * на кадр позже он прыгнул бы с места.
   */
  const gap = steps.length > 1 ? (trackH - steps.length * NODE) / (steps.length - 1) : 0;
  const segment = NODE + gap;
  /** Питомец стоит на только что пройденной — предпоследней снизу. */
  const startFromBottom = (steps.length - 2) * segment + (NODE - PET) / 2;
  // Вверх — это МИНУС по вертикали: экранная ось смотрит вниз.
  const shift = walk.interpolate({ inputRange: [0, 1], outputRange: [0, -segment] });

  /**
   * 🔴 `imageStyle` С ЯВНЫМ РАЗМЕРОМ И `objectFit` — `resizeMode` В ВЕБЕ НЕ ДОЕЗЖАЕТ.
   * Репорт Дениса 26.08.2026: «с переходом между уровнями такая же проблема,
   * картинка не растягивается». Замер того же дня на `goods-sort` показал общее:
   * ⚠️ И СРАЗУ ПОПРАВКА К САМОМУ СЕБЕ, ЧТОБЫ НЕ ПОВТОРИЛИ. Померив соседний
   * `goods-sort`, я решил, что `resizeMode` в вебе не доезжает вовсе: там
   * `object-fit: fill`. Это НЕВЕРНО — у него стоит `resizeMode="stretch"`
   * НАМЕРЕННО (полурейки полок обязаны стыковаться), и `fill` там правильный.
   * Общего вывода из той цифры не следует.
   * Настоящий подтверждённый класс — другой: у фона профиля на главной картинка
   * с `require` несла СВОИ размеры (замер: 760×428 при окне 1800), и заданные
   * `right`/`bottom` не растягивали её. Здесь та же связка `flex: 1` снаружи и
   * картинка с собственным размером внутри, поэтому размер задаётся явно.
   * ⚠️ Этот экран не удалось открыть в браузере, чтобы померить именно его —
   * правка сделана по механизму, подтверждённому на соседнем экране.
   */
  return (
    <ImageBackground
        source={panel}
        style={styles.root}
        imageStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
        resizeMode="cover"
      >
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
        <View style={[styles.track, { height: trackH }]}>
          {/* Пунктир рисуем точками, а не Svg: одна линия не стоит ещё одного
              модуля в дереве зависимостей. Число точек — от высоты, иначе на
              большом экране пунктир разредился бы в отдельные крапинки. */}
          <View style={styles.dots} pointerEvents="none">
            {Array.from({ length: Math.max(6, Math.round(trackH / 22)) }).map((_, i) => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
          {/*
            ⚠️ СТУПЕНИ СТРОЯТСЯ `column-reverse`, А НЕ ABSOLUTE-КООРДИНАТАМИ.
            Первая редакция (горизонтальная) ставила узлы через `position:absolute`
            + `left`, и в веб-сборке они разъехались задом наперёд. Порядок должна
            задавать сама раскладка: при `column-reverse` первый ребёнок оказывается
            ВНИЗУ, поэтому массив идёт по возрастанию — младшая ступень внизу,
            следующая наверху, и перепутать нельзя.
          */}
          <View style={styles.ladder}>
            {steps.map((n) => (
              <View key={n} style={[styles.node, n <= level ? styles.nodeDone : styles.nodeNext]}>
                <Text style={styles.nodeText}>{n}</Text>
              </View>
            ))}
          </View>
          <Animated.View
            style={[styles.pet, { bottom: startFromBottom, transform: [{ translateY: shift }] }]}
            pointerEvents="none"
          >
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
  // ⚠️ Отступ между лестницей и строкой «запускаю следующий» больше прежнего:
  // на снимке 21.08.2026 строка жалась вплотную к нижней ступени и читалась
  // как подпись к ней, а не как отдельное сообщение.
  bottom: { alignItems: 'center', paddingBottom: 132, gap: 26 },
  /**
   * Ширина лестницы — РОВНО столбец ступеней, без места под питомца.
   *
   * ⚠️ Снимок 21.08.2026 показал то, чего тесты показать не могли: когда питомец
   * входил в ширину дорожки (NODE + 12 + PET), центрировался весь блок вместе с
   * ним — и лестница уезжала левее середины экрана, а питомец оказывался в центре
   * вместо неё. Теперь по центру стоят ступени, а питомец висит сбоку абсолютом и
   * на раскладку не влияет.
   */
  track: { width: NODE },
  dots: {
    position: 'absolute', left: NODE / 2 - 2, top: 0, bottom: 0, width: 4,
    alignItems: 'center', justifyContent: 'space-evenly',
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  ladder: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: NODE,
    flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'space-between',
  },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  nodeDone: { backgroundColor: 'rgba(52,211,153,0.92)', borderColor: '#ffffff' },
  nodeNext: { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.85)' },
  nodeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  // Питомец едет поверх дорожки: он один и обязан двигаться, остальное стоит.
  // Питомец идёт поверх лестницы: он один и обязан двигаться, ступени стоят.
  pet: { position: 'absolute', left: NODE + 12 },
  next: {
    color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
});
