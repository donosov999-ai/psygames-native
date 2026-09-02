import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutChangeEvent, Image } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import PetSprite, { PetAccessory, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetSkin, getPetAccessory } from '@/src/services/pet';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getLevelStars, StarsMap } from '@/src/services/levelStars';
import { formatBestTime, getLevelBestTimes, showsBestTime, LevelTimes } from '@/src/services/levelTimes';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { hasBoss, isBossLevel } from '@/src/constants/bosses';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { themeArtFor, themeArtByKey } from '@/src/constants/profileThemes';
import { getEquippedValue } from '@/src/services/cosmetics';

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
  /**
   * Потолок карты. Не указан — берём `LADDER_MIN`, но карта в любом случае
   * дотягивается до достигнутого (см. `bestLevel`).
   */
  maxLevel?: number;
  /**
   * 🔴 ДОСТИГНУТЫЙ ПОТОЛОК. Без него тропинка обрывалась на пятнадцатом у сорока
   * шести игр: `currentLevel` — это ВЫБРАННЫЙ уровень, и стоило человеку вернуться
   * на пройденный, карта схлопывалась до него — дороги обратно вверх на ней уже не
   * было. Переиграть выше нельзя, а часть игр не умеет и понижать: оба пути назад
   * оказывались отрезаны.
   */
  bestLevel?: number;
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
// Строка лучшего времени добавляет высоту ТОЛЬКО когда время реально есть хотя бы
// у одного узла. Иначе те же 14 px были бы пустой полосой под тропинкой у всех, кто
// ещё ничего не прошёл, — ровно та беда, ради которой уже разведены H_BASE и H_LABEL.
const H_TIME = 14;
const R = 13;            // радиус обычного узла
const R_BOSS = 17;       // веха крупнее — её видно издалека
const PET = 42;

/**
 * Высота полотна. Отдельной функцией, потому что «пустой полосы быть не должно» —
 * это поведение, и его проверяют прогоном, а не чтением вёрстки.
 */
export function mapHeight(hasLabel: boolean, hasTimes: boolean): number {
  return (hasLabel ? H_LABEL : H_BASE) + (hasTimes ? H_TIME : 0);
}

const nodeX = (i: number) => PAD_X + i * GAP;
const nodeY = (i: number) => WAVE_Y + AMP * Math.sin(i * 0.85);

/**
 * Верх строки времени — ПОД всем, что уже занято у узла.
 *
 * Узел занимает до `nodeY + R_BOSS` (веха крупнее обычного), звёзды идут
 * центрами на `+11` при радиусе 4 (то есть до `+15`), подпись ступени — с `+20`
 * при кегле 9 (то есть до `+32` от обычного радиуса). Считаем от R_BOSS, чтобы
 * одна формула была верна и для вехи, и для обычного узла: иначе на вехе без
 * подписи время наезжало бы на звёзды.
 */
export function timeTop(i: number, hasLabel: boolean): number {
  return nodeY(i) + R_BOSS + (hasLabel ? 29 : 16);
}

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

/**
 * СТУПЕНЬ СЛОВОМ — ОБЩАЯ, КОГДА ИГРА НЕ ДАЛА СВОЮ.
 *
 * 🔴 ЗАЧЕМ. Тропинка умеет подписывать узлы словами (`levelLabel`) с самого
 * начала, но пользовались этим ДВЕ игры из шестидесяти четырёх. У остальных на
 * карте стояли голые номера, и жалоба из репортов 9 августа — «не понимаю, как
 * меняется сложность» — не была закрыта нигде, кроме судоку и глазной
 * гимнастики. Номер сам по себе не сообщает ничего: двенадцатый уровень это
 * «уже трудно» или «ещё разминка»?
 *
 * Общая подпись считается от ДОЛИ пути, а не от абсолютного номера: у одной игры
 * уровней 15, у другой 60, и «двенадцатый» в них значит разное. Игра, которая
 * знает про себя больше (судоку знает настоящую ступень генератора), по-прежнему
 * передаёт свою — она точнее.
 *
 * ⚠️ У МЕТОДИК ПОДПИСИ НЕТ И БЫТЬ НЕ ДОЛЖНО. Там число считает ПРОХОЖДЕНИЯ, а не
 * ступени сложности (`countsRuns`): «третье прохождение — трудный» это ложь.
 *
 * ⚠️ КЛЮЧИ ВЗЯТЫ СУЩЕСТВУЮЩИЕ, С ПРЕФИКСОМ `sudokuTier`. Слова в них общие
 * («Начинающий», «Лёгкий», …) и уже переведены на 12 языков; заводить рядом
 * `tier*` с тем же текстом значит получить дубли, которые сегодня как раз
 * вычищали. Префикс исторический — переименование отдельной задачей, когда
 * словарь освободится.
 */
const TIER_KEYS = [
  'sudokuTierBeginner',
  'sudokuTierEasy',
  'sudokuTierMedium',
  'sudokuTierHard',
  'sudokuTierExpert',
  'sudokuTierExtreme',
] as const;

/** Ступень по доле пройденного пути. Возвращает ключ словаря. */
export function tierKeyFor(level: number, maxLevel: number): string {
  if (maxLevel <= 1) return TIER_KEYS[0];
  const share = (Math.max(1, level) - 1) / (maxLevel - 1);
  const idx = Math.min(TIER_KEYS.length - 1, Math.floor(share * TIER_KEYS.length));
  return TIER_KEYS[idx];
}

/** Программа обещает «≥15 уровней» — короче этого карту не рисуем. */
export const LADDER_MIN = 15;

/**
 * ДОКУДА ТЯНЕТСЯ ТРОПИНКА.
 *
 * 🔴 ЧТО БЫЛО. Потолок брался только из `maxLevel`, а его не передавали сорок шесть
 * экранов из шестидесяти девяти — то есть карта обрывалась на пятнадцатом. Дальше
 * пятнадцатого не было ни узла: переиграть пройденное нельзя, потому что его нет на
 * карте. А `currentLevel` — это ВЫБРАННЫЙ уровень: вернувшись на пройденный, человек
 * схлопывал карту до него и терял дорогу обратно вверх. У части игр понижения нет
 * вовсе (и правильно: сложность нормированной методики не крутят), так что карта
 * была для них единственным путём назад — и он обрывался.
 *
 * Правило: карта тянется до самого дальнего из трёх — объявленного игрой потолка,
 * достигнутого и того, где человек стоит сейчас.
 */
export function ladderCap(maxLevel: number | undefined, currentLevel: number, bestLevel?: number): number {
  return Math.max(maxLevel ?? LADDER_MIN, currentLevel, bestLevel ?? 0);
}

export default function LevelProgressMap({ gameId, currentLevel, maxLevel, bestLevel, colors, levelLabel, onPickLevel, countsRuns }: Props) {
  /**
   * Потолок карты — самое дальнее из трёх: заявленный игрой, достигнутый и тот, где
   * человек стоит сейчас. Иначе карта обрезает саму себя: у игры без объявленного
   * потолка это пятнадцатый уровень, а у игры с переигровкой — выбранный.
   */
  const cap = ladderCap(maxLevel, currentLevel, bestLevel);
  const { t } = useLanguage();   // язык из контекста; проп language остался в Props для совместимости
  const { profile } = useProfile();
  // Витрина тем: купленная и надетая чужая тема перекрывает профильную (Т4).
  const [themeOverride, setThemeOverride] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Без профиля override и так не читается ниже (?? профильный арт) — синхронный сброс не нужен.
    if (profile?.id) getEquippedValue(profile.id, 'theme').then((v) => { if (alive) setThemeOverride(v); });
    else Promise.resolve().then(() => { if (alive) setThemeOverride(null); });
    return () => { alive = false; };
  }, [profile?.id]);
  const [stars, setStars] = useState<StarsMap>({});
  const [times, setTimes] = useState<LevelTimes>({});
  const [skin, setSkin] = useState<PetSkin>('cat');
  const [accessory, setAccessory] = useState<PetAccessory | null>(null);
  /**
   * 🔴 НОЛЬ — ЭТО «ШИРИНА ЕЩЁ НЕ ИЗВЕСТНА», А НЕ «ШИРИНА НОЛЬ».
   *
   * В веб-сборке (а Android у нас WebView, то есть это и телефон тоже)
   * `useWindowDimensions()` на ПЕРВОМ кадре отдаёт 0, а обновляется только по
   * событию `resize` — которого при обычной загрузке экрана не бывает. Ноль
   * запекался в `maxWidth`, и тропинка схлопывалась в полоску 24 px: подпись
   * «Уровень 1 / 52» вставала по букве в столбик, узлы с питомцем исчезали.
   * Держалось до поворота экрана — то есть у большинства навсегда.
   *
   * Замер 19.08.2026: сломано было на ВСЕХ проверенных экранах (судоку,
   * сортировка, Шульте, маджонг, «Запомни цифры», N-назад), 3 загрузки из 3.
   * После искусственного ресайза ширина сама становилась 391 px — этим и
   * доказано, что дело в первом кадре, а не в вёрстке родителя.
   */
  const winW = useScreenWidth();
  const scrollRef = useRef<ScrollView>(null);
  const viewW = useRef(0);

  useEffect(() => {
    let alive = true;
    if (profile?.id) getLevelStars(gameId, profile.id).then((m) => { if (alive) setStars(m); });
    return () => { alive = false; };
  }, [gameId, profile?.id, currentLevel]);

  /**
   * ЛУЧШЕЕ ВРЕМЯ УРОВНЯ — там, где «быстрее» вообще цель (правило и белый список
   * игр живут в `levelTimes`, рядом с объяснением каждой строки).
   *
   * ⚠️ Проверку зовём ДО чтения истории: у методик и у игр заданной длины
   * незачем разбирать весь массив партий ради ответа «не показываем».
   */
  const timed = showsBestTime(gameId, countsRuns);
  useEffect(() => {
    let alive = true;
    if (timed && profile?.id) getLevelBestTimes(gameId, profile.id).then((m) => { if (alive) setTimes(m); });
    return () => { alive = false; };
  }, [gameId, profile?.id, currentLevel, timed]);

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

  /**
   * Подпись ступени: своя от игры, иначе общая по доле пути. У методик — нет.
   */
  const label = levelLabel ?? (countsRuns ? undefined : (l: number) => t(tierKeyFor(l, cap)));
  /**
   * ⚠️ ВЫСОТУ ДОБАВЛЯЕТ ТОЛЬКО РЕАЛЬНО ВИДИМОЕ ВРЕМЯ. Считаем по узлам, которые
   * на карте есть (`l <= cap`): рекорд с уровня, до которого эта карта не
   * дотягивается (игра ужала число уровней, история осталась), не нарисуется
   * нигде — и полоса под ним была бы пустой.
   */
  const hasTimes = Object.keys(times).some((k) => Number(k) <= cap && times[Number(k)] > 0);
  const H = mapHeight(!!label, hasTimes);
  const sel = Math.min(Math.max(1, currentLevel), cap);   // где стоит питомец = что запустится
  /**
   * ПОТОЛОК ПУТИ — самое высокое, что мы видели за это открытие экрана.
   *
   * ⚠️ ЗАЧЕМ ВООБЩЕ ПАМЯТЬ, А НЕ ПРОСТО currentLevel. Выбор пройденного уровня
   * опускает currentLevel (игра будет играть на нём). Если считать потолком его,
   * то после нажатия на узел 3 при достигнутых 10 узлы 4..10 стали бы «непройденными»
   * и нажать на них было бы уже нельзя — человек заперт в тройке без пути назад.
   * Максимум за монтирование этого не допускает и лишнего пропса не требует.
   */
  const topRef = useRef(sel);
  if (sel > topRef.current) topRef.current = sel;
  const reached = topRef.current;
  const cur = sel - 1;                        // индекс узла, на котором сидит питомец
  // Переигровка доступна не всем: у методик уровень считает ПРОХОЖДЕНИЯ, и «вернуться
  // на прохождение №3» — бессмыслица, там нечего переигрывать.
  const canPick = !!onPickLevel && !countsRuns;
  const replaying = canPick && sel < reached;
  const totalW = PAD_X * 2 + (cap - 1) * GAP;
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
    // Показываем ВЫБРАННЫЙ уровень, а не потолок: подпись обязана совпадать с тем,
    // что запустит кнопка «Начать», иначе она врёт ровно в момент переигровки.
    : t('levelOfMax').replace('{n}', String(sel)).replace('{max}', String(cap));

  const dim = colors.textSecondary;
  const accent = colors.primary;

  const nodes = [];
  for (let l = 1; l <= cap; l++) {
    const i = l - 1;
    const s = stars[l] || 0;
    const passed = l < reached || s > 0;
    const isCur = l === sel;
    const boss = withBoss && isBossLevel(l);
    const r = boss ? R_BOSS : R;
    const x = nodeX(i), y = nodeY(i);
    const tone = passed || isCur ? accent : dim;

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
        {/* кольцо выбора — видно, что играем НЕ на своём потолке, а вернулись назад */}
        {replaying && isCur && (
          <Circle cx={x} cy={y} r={r + 7} fill="none" stroke={accent} strokeWidth={2} strokeDasharray="4 3" />
        )}
      </G>,
    );
  }

  return (
    /**
     * ⚠️ ПОТОЛОК ШИРИНЫ ПО ОКНУ, А НЕ ПО РОДИТЕЛЮ. Внутри горизонтальная лента шириной
     * под все уровни (при 15 узлах ~930 px). Если родитель сам сжимается по содержимому
     * — а так устроен ScrollView без явной ширины, — лента задаёт ширину ЕМУ, и весь
     * экран разъезжается вбок: во фрактальной судоку текст уехал за край, заголовок
     * пропал. `width: '100%'` там не спасает: сто процентов уже раздутой ширины — та же
     * раздутая ширина. Ширина окна известна всегда и от родителя не зависит.
     */
    <View style={[styles.card, { backgroundColor: colors.surface, maxWidth: winW }]}>
      <Text style={[styles.title, { color: colors.text }]}>{heading}</Text>
      {/* Подсказка появляется только когда позади реально что-то есть: на первом
          уровне звать «нажми на пройденный узел» некуда. */}
      {canPick && reached > 1 && (
        <Text style={[styles.hint, { color: replaying ? accent : dim }]}>
          {replaying
            ? t('replayingLevel').replace('{n}', String(sel)).replace('{best}', String(reached))
            : t('tapNodeToReplay')}
        </Text>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        accessibilityLabel={heading}
      >
        <View style={{ width: totalW, height: H }}>
          {/* ТЕМА ПРОФИЛЯ — подложка тропинки (движок тем c4fc6173): один и тот же
              луг у каждого профиля обработан своим рецептом НА СБОРКЕ. Непрозрачность
              низкая нарочно: подложка задаёт настроение, узлы и подписи читаются
              поверх как раньше. resizeMode cover — арт вертикальный (720×1222), а
              полоса карты горизонтальная. Декорация: от чтения экрана скрыта. */}
          <Image
            source={(themeOverride ? themeArtByKey(themeOverride) : undefined) ?? themeArtFor(profile?.id)}
            style={{ position: 'absolute', left: 0, top: 0, width: totalW, height: H, opacity: 0.16, borderRadius: 10 }}
            resizeMode="cover"
            accessible={false}
          />
          <Svg width={totalW} height={H}>
            <Defs>
              {/* id уникален по игре: на web все Svg живут в одном DOM, и одинаковый
                  id у двух карт перекрасил бы обе — url(#) берёт первый в документе */}
              <RadialGradient id={`${gameId}-glow`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={accent} stopOpacity="0.30" />
                <Stop offset="1" stopColor={accent} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* аксон впереди — пунктир: путь ещё не проложен.
                ⚠️ Считаем от ПОТОЛКА, а не от питомца: на переигровке питомец стоит
                позади, но участок до его рекорда пройден и пунктиром быть не должен. */}
            <Path d={axonPath(reached - 1, cap - 1)} fill="none" stroke={dim} strokeWidth={4}
              strokeLinecap="round" strokeDasharray="2 9" opacity={0.55} />
            {/* аксон позади — сплошной, по нему бежит импульс */}
            <Path d={axonPath(0, reached - 1)} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
            {Array.from({ length: reached - 1 }, (_, i) => (
              <Circle key={`imp${i}`} cx={(nodeX(i) + nodeX(i + 1)) / 2} cy={(nodeY(i) + nodeY(i + 1)) / 2}
                r={2.6} fill={accent} opacity={0.85} />
            ))}

            {nodes}

            {/* звёзды под пройденными + подпись уровня */}
            {Array.from({ length: cap }, (_, i) => {
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
          {label && Array.from({ length: cap }, (_, i) => (
            <Text
              key={`lb${i}`}
              numberOfLines={1}
              style={[styles.levelLabel, {
                left: nodeX(i) - GAP / 2,
                top: nodeY(i) + R + 20,
                width: GAP,
                color: i + 1 === sel ? accent : dim,
              }]}
            >
              {label(i + 1)}
            </Text>
          ))}

          {/**
            * ЛУЧШЕЕ ВРЕМЯ ПРОЙДЕННОГО УРОВНЯ — самой нижней строкой.
            *
            * Показываем только там, где оно есть: узел без времени не получает
            * ни подписи, ни пустого места под собой (высоту полотна поднимает
            * `hasTimes`, а не сам факт, что игра умеет считать время).
            * Цвет приглушённый всегда, включая текущий узел: это не состояние
            * пути, а справка «вот что ты уже сумел» — спорить за внимание со
            * ступенью и звёздами ей незачем.
            */}
          {hasTimes && Array.from({ length: cap }, (_, i) => {
            const best = times[i + 1];
            if (!best) return null;
            return (
              <Text
                key={`tm${i}`}
                numberOfLines={1}
                style={[styles.levelTime, {
                  left: nodeX(i) - GAP / 2,
                  top: timeTop(i, !!label),
                  width: GAP,
                  color: dim,
                }]}
              >
                {formatBestTime(best)}
              </Text>
            );
          })}

          {/* Нажимаемые узлы — пройденные и свой потолок (нажатие на него снимает
              переигровку и возвращает на достигнутое). Дальше потолка не пускаем:
              тропинка показывает путь, но не работает лифтом через сложность. */}
          {canPick && Array.from({ length: cap }, (_, i) => {
            const l = i + 1;
            if (l > reached && !(stars[l] || 0)) return null;
            return (
              <TouchableOpacity
                key={`tap${l}`}
                accessibilityRole="button"
                // Скринридеру цифра «2:40» без слова ничего не говорит; ключ
                // `bestTime` уже есть во всех двенадцати словарях.
                accessibilityLabel={times[l]
                  ? `${t('level')} ${l}, ${t('bestTime')} ${formatBestTime(times[l])}`
                  : `${t('level')} ${l}`}
                onPress={() => onPickLevel!(l)}
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
  // ⚠️ alignSelf + overflow ОБЯЗАТЕЛЬНЫ. Внутри горизонтальная лента шириной под
  // все уровни (при 15 узлах это ~930 px). Без ограничения по ширине она задаёт
  // ширину родителю, и весь экран разъезжается вбок: во фрактальной судоку текст
  // уехал за край, а заголовок карточки пропал. Поймано глазами на её экране —
  // на других не было видно, потому что там родитель и так во всю ширину.
  /**
   * 🔴 `minWidth: 0` — ИНАЧЕ КАРТОЧКА РАЗДУВАЕТСЯ ПО ЛЕНТЕ ВНУТРИ.
   *
   * Замер 02.09.2026 на экране 360 px (фрактальная судоку): страница ехала вбок на
   * 31 px, и виновата была эта карточка. У неё стоит `width: '100%'` — то есть 328
   * в контейнере с отступами 16, — но по правилу флексбокса у элемента строки
   * `min-width` равен `auto`, а значит он имеет право вырасти до размера
   * содержимого. Содержимое здесь — горизонтальная лента уровней шириной 1862 px,
   * и карточка вырастала до потолка `maxWidth: winW` (360), то есть на 32 больше
   * своего места. Сверху к ней прибавлялись отступы контейнера — и вот они, 31 px
   * вбок.
   *
   * `minWidth: 0` снимает это право: карточка остаётся ровно той ширины, которую
   * ей отвели, а лента прокручивается внутри, как и задумано. Потолок по окну
   * оставлен — он защищает от другого случая (родитель сам сжимается по
   * содержимому), описанного в комментарии к разметке выше.
   */
  card: { borderRadius: 12, padding: 12, gap: 6, alignSelf: 'stretch', width: '100%', minWidth: 0, overflow: 'hidden' },
  title: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11, fontWeight: '600', marginTop: -2 },
  levelLabel: { position: 'absolute', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  // Время — тем же кеглем, но без насыщенности подписи ступени: рядом стоят две
  // строки, и одинаково жирные спорили бы друг с другом за взгляд.
  levelTime: { position: 'absolute', fontSize: 9, fontWeight: '500', textAlign: 'center' },
});
