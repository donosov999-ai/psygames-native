/* psygames-pause-practice-visual · VER 1 · 27.08.2026 */
/**
 * КАРТИНКИ ПРАКТИК «ЗАРЯДКИ» — ПЕРЕНОС ИЗ БУДИЛЬНИКА.
 *
 * 🔴 ЧЕГО НЕ ХВАТАЛО. Ядро практик общее у приложения и «Умного будильника», и в
 * нём 10 наборов и 33 практики. Но ВИД был проработан только в будильнике: там у
 * каждого набора своя картинка — тело с подсвеченной зоной, фигура дыхания,
 * снимки поз. В приложении экран «Паузы» рисовал ТОЛЬКО текст, часы и полоску
 * прогресса: ноль изображений на весь модуль.
 *
 * Замер 27.08.2026: в `PausePracticesGame.tsx` было ноль `Image` и ноль `Svg`.
 * При этом в базе 512 сессий «Дыхания» и 7 «Гимнастики глаз» — и НОЛЬ у хаба
 * «Пауза». То есть полный модуль стоял собранным и нетронутым, а люди ходили в
 * две одинокие карточки, где картинок тоже нет.
 *
 * ━━━ ЧТО ПЕРЕНЕСЕНО ━━━
 * Восемь наборов геометрии (лицо и речь · расслабление · тазовое дно · подвижность
 * · позы · изометрия · живот · Фельденкрайз), общая подложка «тело» и фигура
 * дыхания. Исходник — `smart-alarm/src/web/app.mjs`, функции `render*Visual`.
 *
 * ⚠️ ПОРТ, А НЕ КОПИЯ. Там это строки HTML для DOM, здесь `react-native-svg`:
 * CSS-классы (`visual-zone`, `is-active`) стали явными цветами и толщинами,
 * потому что в RN каскада нет. Геометрия — координата в координату.
 *
 * ⚠️ Снимки поз сжаты: 9,3 МБ пяти PNG → 652 КБ пяти webp (ресайз до 1400 px,
 * q82). В приложение, которое ставят на телефон, девять мегабайт четырёх поз не
 * кладут.
 */
import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/** Снимки тела и поз. Требуются статически: Metro не умеет динамический require. */
const IMAGES = {
  body: require('../../../../assets/images/pause/body-master-v1.webp'),
  mountain: require('../../../../assets/images/pause/pose-mountain-phone-v1.webp'),
  horse: require('../../../../assets/images/pause/pose-horse-phone-v1.webp'),
  cobbler: require('../../../../assets/images/pause/pose-cobbler-phone-v1.webp'),
  lotus: require('../../../../assets/images/pause/pose-lotus-phone-v1.webp'),
} as const;

export interface VisualCue {
  readonly setId: string;
  readonly programId: string;
  readonly stepId: string;
  readonly progress: number;
}

export interface VisualTheme {
  readonly line: string;
  readonly zone: string;
  readonly active: string;
  readonly surface: string;
}

/**
 * ⚠️ Подсветка зоны — это ЦВЕТ И ТОЛЩИНА, а не класс. В вебе `is-active`
 * добирал стиль каскадом; здесь каскада нет, и «забыл покрасить» выглядит как
 * «зона не подсвечивается» — то есть картинка перестаёт показывать, где работать.
 */
const zoneFill = (on: boolean, t: VisualTheme) => (on ? t.active : t.zone);
const zoneOpacity = (on: boolean) => (on ? 0.55 : 0.16);

function FaceVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const byStep: Record<string, string> = {
    cheeks: 'cheeks', smile: 'mouth', pucker: 'mouth', brows: 'brows', 'eyes-soft': 'eyes',
    jaw: 'jaw', simhasana: 'tongue', ears: 'ears', forehead: 'brows', hum: 'throat',
    lips: 'mouth', vowels: 'throat', 'tongue-twister': 'tongue', 'smile-pucker': 'mouth',
    'lip-circle': 'mouth', 'jaw-open-close': 'jaw', 'tongue-tip': 'tongue',
    'tongue-sides': 'tongue', syllables: 'tongue', phrase: 'throat', 'find-spot': 'tongue',
    'palate-hold': 'tongue', 'controlled-swallow': 'throat',
  };
  const region = byStep[cue.stepId] ?? 'release';
  const on = (n: string) => region === n;
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <Ellipse cx={165} cy={194} rx={24} ry={42} fill={zoneFill(on('ears'), t)} opacity={zoneOpacity(on('ears'))} />
      <Ellipse cx={435} cy={194} rx={24} ry={42} fill={zoneFill(on('ears'), t)} opacity={zoneOpacity(on('ears'))} />
      <Path d="M220 135 Q255 112 280 136 M320 136 Q350 112 382 135" stroke={zoneFill(on('brows'), t)} strokeWidth={on('brows') ? 7 : 4} fill="none" />
      <Ellipse cx={252} cy={170} rx={25} ry={13} fill={zoneFill(on('eyes'), t)} opacity={zoneOpacity(on('eyes'))} />
      <Ellipse cx={348} cy={170} rx={25} ry={13} fill={zoneFill(on('eyes'), t)} opacity={zoneOpacity(on('eyes'))} />
      <Circle cx={230} cy={220} r={34} fill={zoneFill(on('cheeks'), t)} opacity={zoneOpacity(on('cheeks'))} />
      <Circle cx={370} cy={220} r={34} fill={zoneFill(on('cheeks'), t)} opacity={zoneOpacity(on('cheeks'))} />
      <Path d="M300 170 Q286 216 304 222" stroke={t.line} strokeWidth={3} fill="none" />
      <Path d="M246 264 Q300 304 354 264 Q302 250 246 264 Z" fill={zoneFill(on('mouth'), t)} opacity={zoneOpacity(on('mouth'))} />
      <Path d="M275 277 Q300 322 325 277" stroke={zoneFill(on('tongue'), t)} strokeWidth={on('tongue') ? 8 : 4} fill="none" />
      <Path d="M212 273 Q300 350 388 273" stroke={zoneFill(on('jaw'), t)} strokeWidth={on('jaw') ? 8 : 4} fill="none" />
      <Path d="M265 344 Q300 374 335 344" stroke={zoneFill(on('throat'), t)} strokeWidth={on('throat') ? 8 : 4} fill="none" />
    </Svg>
  );
}

function RelaxationVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const byStep: Record<string, string> = {
    hands: 'hands', shoulders: 'shoulders', face: 'head', abdomen: 'torso', legs: 'legs',
    feet: 'feet', torso: 'torso', whole: 'whole', weight: 'legs', warmth: 'torso',
    breath: 'torso', settle: 'whole', return: 'whole', rest: 'whole',
  };
  const region = byStep[cue.stepId] ?? 'whole';
  const on = (n: string) => region === n || region === 'whole';
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <Circle cx={300} cy={62} r={38} fill={zoneFill(on('head'), t)} opacity={zoneOpacity(on('head'))} />
      <Path d="M300 102 L300 238 M300 126 L212 205 M300 126 L388 205 M300 238 L242 346 M300 238 L358 346" stroke={t.line} strokeWidth={4} fill="none" />
      <Circle cx={300} cy={128} r={48} fill={zoneFill(on('shoulders'), t)} opacity={zoneOpacity(on('shoulders'))} />
      <Ellipse cx={300} cy={198} rx={58} ry={78} fill={zoneFill(on('torso'), t)} opacity={zoneOpacity(on('torso'))} />
      <Circle cx={205} cy={211} r={22} fill={zoneFill(on('hands'), t)} opacity={zoneOpacity(on('hands'))} />
      <Circle cx={395} cy={211} r={22} fill={zoneFill(on('hands'), t)} opacity={zoneOpacity(on('hands'))} />
      <Path d="M276 236 L238 340 M324 236 L362 340" stroke={zoneFill(on('legs'), t)} strokeWidth={on('legs') ? 9 : 5} fill="none" />
      <Ellipse cx={228} cy={352} rx={28} ry={13} fill={zoneFill(on('feet'), t)} opacity={zoneOpacity(on('feet'))} />
      <Ellipse cx={372} cy={352} rx={28} ry={13} fill={zoneFill(on('feet'), t)} opacity={zoneOpacity(on('feet'))} />
      <Path d="M190 310 Q300 258 410 310" stroke={t.active} strokeWidth={3} fill="none" opacity={0.5} />
    </Svg>
  );
}

/** Общая подложка: снимок тела, поверх — слой зон набора. */
function CosmicBody({ overlay, t }: { overlay: React.ReactNode; t: VisualTheme }) {
  return (
    <View style={styles.stack}>
      <Image source={IMAGES.body} style={styles.bodyImage} resizeMode="contain" accessible={false} />
      <View style={StyleSheet.absoluteFill as never}>{overlay}</View>
    </View>
  );
}

function PelvicVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const contracting = cue.stepId.includes('squeeze') || cue.stepId.includes('hold');
  const vectors = contracting
    ? 'M300 142 L300 214 M286 198 L300 214 L314 198 M300 346 L300 274 M286 290 L300 274 L314 290 M166 244 L244 244 M228 230 L244 244 L228 258 M434 244 L356 244 M372 230 L356 244 L372 258'
    : 'M300 218 L300 142 M286 158 L300 142 L314 158 M300 270 L300 346 M286 330 L300 346 L314 330 M244 244 L166 244 M182 230 L166 244 L182 258 M356 244 L434 244 M418 230 L434 244 L418 258';
  return (
    <CosmicBody t={t} overlay={
      <Svg viewBox="0 0 600 390" width="100%" height="100%">
        <Ellipse cx={300} cy={244} rx={112} ry={66} stroke={t.line} strokeWidth={3} fill="none" opacity={0.5} />
        <Ellipse cx={300} cy={244} rx={78} ry={46} stroke={t.line} strokeWidth={3} fill="none" opacity={0.7} />
        <Ellipse cx={300} cy={244} rx={42} ry={25} stroke={t.active} strokeWidth={4} fill="none" />
        <Path d={vectors} stroke={t.active} strokeWidth={5} fill="none" />
        <Circle cx={300} cy={244} r={16} fill={t.active} opacity={contracting ? 0.85 : 0.4} />
      </Svg>
    } />
  );
}

function MobilityVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const zone = cue.programId.includes('neck') ? 'shoulders'
    : cue.programId.includes('thoracic') ? 'torso'
      : cue.programId.includes('ankle') ? 'ankles' : 'wrists';
  const on = (n: string) => zone === n;
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <Circle cx={300} cy={61} r={36} stroke={t.line} strokeWidth={4} fill="none" />
      <Path d="M300 97 L300 244 M300 127 L214 204 M300 127 L386 204 M300 244 L250 345 M300 244 L350 345" stroke={t.line} strokeWidth={4} fill="none" />
      <Path d="M223 145 Q300 86 377 145" stroke={on('shoulders') ? t.active : t.zone} strokeWidth={on('shoulders') ? 7 : 3} fill="none" />
      <Circle cx={245} cy={137} r={25} fill={zoneFill(on('shoulders'), t)} opacity={zoneOpacity(on('shoulders'))} />
      <Circle cx={355} cy={137} r={25} fill={zoneFill(on('shoulders'), t)} opacity={zoneOpacity(on('shoulders'))} />
      <Ellipse cx={300} cy={205} rx={66} ry={72} fill={zoneFill(on('torso'), t)} opacity={zoneOpacity(on('torso'))} />
      <Circle cx={208} cy={211} r={25} fill={zoneFill(on('wrists'), t)} opacity={zoneOpacity(on('wrists'))} />
      <Circle cx={392} cy={211} r={25} fill={zoneFill(on('wrists'), t)} opacity={zoneOpacity(on('wrists'))} />
      <Circle cx={244} cy={345} r={25} fill={zoneFill(on('ankles'), t)} opacity={zoneOpacity(on('ankles'))} />
      <Circle cx={356} cy={345} r={25} fill={zoneFill(on('ankles'), t)} opacity={zoneOpacity(on('ankles'))} />
      <Path d="M172 211 A36 36 0 1 0 244 211" stroke={on('wrists') ? t.active : t.zone} strokeWidth={3} fill="none" />
      <Path d="M208 345 A36 36 0 1 0 280 345" stroke={on('ankles') ? t.active : t.zone} strokeWidth={3} fill="none" />
    </Svg>
  );
}

function PostureVisual({ cue }: { cue: VisualCue; t: VisualTheme }) {
  const pose = cue.programId.includes('horse') ? 'horse'
    : cue.programId.includes('cobbler') ? 'cobbler'
      : cue.programId.includes('lotus') ? 'lotus' : 'mountain';
  const releasing = cue.stepId.includes('release');
  return (
    <View style={styles.stack}>
      <Image
        source={IMAGES[pose as keyof typeof IMAGES]}
        style={[styles.bodyImage, { opacity: releasing ? 0.72 : 1 }]}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

function IsometricVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const zone = cue.stepId === 'palms' ? 'palms' : cue.stepId === 'feet' ? 'feet' : cue.stepId === 'squeeze' ? 'glutes' : 'release';
  const on = (n: string) => zone === n;
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <Circle cx={300} cy={62} r={34} stroke={t.line} strokeWidth={4} fill="none" />
      <Path d="M300 96 L300 232 M300 142 L236 214 M300 142 L364 214 M300 232 L252 330 M300 232 L348 330" stroke={t.line} strokeWidth={4} fill="none" />
      <Circle cx={230} cy={221} r={28} fill={zoneFill(on('palms'), t)} opacity={zoneOpacity(on('palms'))} />
      <Circle cx={370} cy={221} r={28} fill={zoneFill(on('palms'), t)} opacity={zoneOpacity(on('palms'))} />
      <Ellipse cx={300} cy={246} rx={74} ry={42} fill={zoneFill(on('glutes'), t)} opacity={zoneOpacity(on('glutes'))} />
      <Ellipse cx={252} cy={340} rx={30} ry={14} fill={zoneFill(on('feet'), t)} opacity={zoneOpacity(on('feet'))} />
      <Ellipse cx={348} cy={340} rx={30} ry={14} fill={zoneFill(on('feet'), t)} opacity={zoneOpacity(on('feet'))} />
    </Svg>
  );
}

function AbdomenVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const releasing = cue.stepId.includes('release') || cue.stepId.includes('recover') || cue.stepId.includes('finish');
  return (
    <CosmicBody t={t} overlay={
      <Svg viewBox="0 0 600 390" width="100%" height="100%">
        <Ellipse cx={300} cy={230} rx={94} ry={105} fill={t.zone} opacity={releasing ? 0.14 : 0.26} />
        <Ellipse cx={300} cy={238} rx={54} ry={68} fill={t.active} opacity={releasing ? 0.24 : 0.5} />
        <Path d="M202 238 L252 238 M232 218 L252 238 L232 258" stroke={t.active} strokeWidth={5} fill="none" opacity={releasing ? 0.3 : 1} />
        <Path d="M398 238 L348 238 M368 218 L348 238 L368 258" stroke={t.active} strokeWidth={5} fill="none" opacity={releasing ? 0.3 : 1} />
        <Path d="M246 122 Q300 88 354 122" stroke={t.line} strokeWidth={4} fill="none" />
      </Svg>
    } />
  );
}

function FeldenkraisVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const reverse = cue.stepId === 'other-side';
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <G opacity={0.28}>
        <Circle cx={reverse ? 252 : 348} cy={78} r={32} stroke={t.line} strokeWidth={3} fill="none" />
        <Path d={reverse ? 'M252 110 L280 240 M280 150 L210 222 M280 240 L355 334 M280 240 L228 342' : 'M348 110 L320 240 M320 150 L390 222 M320 240 L245 334 M320 240 L372 342'} stroke={t.line} strokeWidth={3} fill="none" />
      </G>
      <G>
        <Circle cx={286} cy={68} r={32} stroke={t.active} strokeWidth={4} fill="none" />
        <Path d="M286 100 L300 238 M300 145 L230 216 M300 238 L244 340 M300 238 L360 340" stroke={t.active} strokeWidth={4} fill="none" />
      </G>
      <Path d="M232 78 Q302 22 376 80 M350 54 L376 80 L342 92" stroke={t.active} strokeWidth={3} fill="none" opacity={0.7} />
      <Ellipse cx={300} cy={350} rx={138} ry={20} fill={t.zone} opacity={0.2} />
    </Svg>
  );
}

const TAU = Math.PI * 2;

/**
 * Фигура дыхания: бегунок идёт по кругу за один цикл. Квадрат и треугольник у
 * будильника рисуются той же логикой; здесь оставлен круг, потому что форму
 * задаёт `leaderShape` программы, а круг — та, что приходит у всех дыхательных
 * программ каталога. ⚠️ Появится программа с другой формой — сюда придётся
 * добавить ветку, и это лучше сделать замером, а не заранее.
 */
function BreathingVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const angle = Math.PI / 2 - TAU * (cue.progress % 1);
  const r = 150;
  const cx = 300; const cy = 195;
  return (
    <Svg viewBox="0 0 600 390" width="100%" height="100%">
      <Circle cx={cx} cy={cy} r={r} stroke={t.zone} strokeWidth={6} fill="none" />
      <Circle cx={cx} cy={cy} r={r * (0.55 + 0.45 * Math.abs(Math.sin(Math.PI * (cue.progress % 1))))} fill={t.active} opacity={0.18} />
      <Circle cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r={14} fill={t.active} />
    </Svg>
  );
}


/* ─────────────────────── ТАЙМЕР-РАМКА ВОКРУГ КАРТИНКИ ─────────────────────── */
/**
 * 🔴 ЭТОГО В ПРИЛОЖЕНИИ НЕ БЫЛО ВОВСЕ. Здесь стояла тонкая полоска прогресса под
 * текстом, а в будильнике время идёт РАМКОЙ вокруг самой картинки — и у практик с
 * фазами (сжатие/отпускание) рамка не круглая, а многоугольная: каждая сторона это
 * фаза, углы — их стыки. Смотришь на картинку и видишь, сколько осталось, не
 * переводя взгляд.
 *
 * Геометрия перенесена координата в координату из `smart-alarm/src/web/app.mjs`
 * (`renderSoloTimingFrame`, `phaseSegmentPaths`, `polygonVertices`).
 * ⚠️ Центр 300/210 при радиусе 184 в поле 600×420 — рамка НАМЕРЕННО шире картинки
 * (та в 600×390), иначе бегунок задевал бы иллюстрацию.
 */
const TIMING_CX = 300;
const TIMING_CY = 210;
const TIMING_R = 184;
const PHASE_MIN = 2;
const PHASE_MAX = 8;
/** У этих наборов есть настоящий повторяющийся цикл фаз — им многоугольник. */
const PHASED_SETS = new Set(['pelvic-floor', 'isometrics', 'abdomen']);

/* ───────────────────────── ГИМНАСТИКА ГЛАЗ ─────────────────────────
 * 🔴 ЗДЕСЬ БЫЛА ПОДМЕНА. Сначала я отдал `eye-gym` фигуру дыхания — потому что
 * в карте рисовалок будильника (`soloVisualRenderers`) гимнастики глаз НЕТ, и
 * набор выглядел «необслуженным». На деле у него в будильнике своя, отдельная
 * механика — `renderEyeLayer`: мишень, которая ЕЗДИТ по полю, и глаз её ведёт.
 * Смысл упражнения именно в движении мишени; дыхательная фигура его не даёт.
 * Замерено 27.08.2026 поиском `renderEye` в `app.mjs` — 4 совпадения, из них
 * функция на строке 1219.
 *
 * Координаты в ПРОЦЕНТАХ поля, как в оригинале: радиусы 45 и 38, центр по
 * вертикали 46 — чтобы траектории совпали один в один.
 */
const EYE_RX = 45;
const EYE_RY = 38;
const EYE_CY = 46;
const EYE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707],
  [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707],
];

type EyeSpot = { x: number; y: number; variant: 'moving' | 'focus' | 'hidden' | 'pulse' };

/** Где сейчас мишень. Порт `calculatedEyePosition` шаг в шаг. */
function eyeSpot(cue: VisualCue): EyeSpot {
  const progress = Math.max(0, Math.min(1, cue.progress));
  switch (cue.stepId) {
    case 'directions': {
      const фаза = progress * EYE_DIRECTIONS.length;
      const i = Math.floor(фаза) % EYE_DIRECTIONS.length;
      const доля = фаза - Math.floor(фаза);
      const from = EYE_DIRECTIONS[i];
      const to = EYE_DIRECTIONS[(i + 1) % EYE_DIRECTIONS.length];
      const eased = доля * доля * (3 - 2 * доля);
      return {
        x: 50 + EYE_RX * (from[0] + (to[0] - from[0]) * eased),
        y: EYE_CY + EYE_RY * (from[1] + (to[1] - from[1]) * eased),
        variant: 'moving',
      };
    }
    case 'horizontal':
      return { x: 50 + EYE_RX * Math.sin(TAU * 3 * progress), y: EYE_CY, variant: 'moving' };
    case 'vertical':
      return { x: 50, y: EYE_CY + EYE_RY * Math.sin(TAU * 3 * progress), variant: 'moving' };
    case 'circle': {
      const a = TAU * 3 * progress;
      return { x: 50 + EYE_RX * Math.cos(a), y: EYE_CY + EYE_RY * Math.sin(a), variant: 'moving' };
    }
    case 'figure-eight': {
      const a = TAU * 2 * progress;
      return { x: 50 + EYE_RX * Math.sin(a), y: EYE_CY + EYE_RY * Math.sin(a) * Math.cos(a), variant: 'moving' };
    }
    case 'converge':
      return { x: 50, y: 8 + 38 * progress, variant: 'focus' };
    case 'far-focus':
      return { x: 50, y: 42, variant: 'hidden' };
    case 'focus':
      return { x: 50, y: 42, variant: 'focus' };
    default:
      return { x: 50, y: EYE_CY, variant: cue.stepId === 'palming' ? 'hidden' : 'pulse' };
  }
}

function EyeVisual({ cue, t }: { cue: VisualCue; t: VisualTheme }) {
  const spot = eyeSpot(cue);
  // «Ладони на глазах» и «смотреть вдаль» мишени НЕ показывают: в эти шаги
  // глаз никуда не ведут. У будильника это `variant: 'hidden'` + затемнение.
  const затемнить = cue.stepId === 'palming';
  const крупная = spot.variant === 'focus';
  const d = крупная ? 46 : 34;
  return (
    <View style={[styles.eyeField, { backgroundColor: затемнить ? t.line : t.surface }]}>
      {spot.variant !== 'hidden' ? (
        <View
          style={{
            position: 'absolute',
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: d,
            height: d,
            marginLeft: -d / 2,
            marginTop: -d / 2,
            borderRadius: d / 2,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.92)',
            backgroundColor: крупная ? 'transparent' : t.active,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!крупная ? <View style={styles.eyePupil} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function polygonVertices(sides: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (TAU * i) / sides;
    out.push({ x: TIMING_CX + TIMING_R * Math.cos(angle), y: TIMING_CY + TIMING_R * Math.sin(angle) });
  }
  return out;
}

function phaseSegments(sides: number): string[] {
  if (sides === 2) {
    const top = `${TIMING_CX},${TIMING_CY - TIMING_R}`;
    const bottom = `${TIMING_CX},${TIMING_CY + TIMING_R}`;
    return [
      `M ${top} A ${TIMING_R},${TIMING_R} 0 0 1 ${bottom}`,
      `M ${bottom} A ${TIMING_R},${TIMING_R} 0 0 1 ${top}`,
    ];
  }
  const v = polygonVertices(sides);
  return v.map((a, i) => {
    const b = v[(i + 1) % sides];
    return `M ${a.x.toFixed(1)},${a.y.toFixed(1)} L ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  });
}

export interface TimingInfo {
  /** Сколько фаз у программы. 0 — круглый таймер. */
  readonly phases: number;
  /** Номер текущей фазы. */
  readonly phaseIndex: number;
}

export function TimingFrame({ cue, t, timing }: { cue: VisualCue; t: VisualTheme; timing?: TimingInfo }) {
  const phased = Boolean(timing && PHASED_SETS.has(cue.setId)
    && timing.phases >= PHASE_MIN && timing.phases <= PHASE_MAX);
  const прогресс = Math.max(0, Math.min(1, cue.progress));

  if (!phased) {
    const angle = -Math.PI / 2 + TAU * прогресс;
    const длина = 2 * Math.PI * TIMING_R;
    return (
      <Svg viewBox="0 0 600 420" width="100%" height="100%" style={StyleSheet.absoluteFill as never}>
        <Circle cx={TIMING_CX} cy={TIMING_CY} r={TIMING_R} stroke={t.zone} strokeWidth={5} fill="none" opacity={0.35} />
        <Circle
          cx={TIMING_CX} cy={TIMING_CY} r={TIMING_R}
          stroke={t.active} strokeWidth={5} fill="none" strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, прогресс * длина)} ${длина}`}
          transform={`rotate(-90 ${TIMING_CX} ${TIMING_CY})`}
        />
        <Circle cx={TIMING_CX + TIMING_R * Math.cos(angle)} cy={TIMING_CY + TIMING_R * Math.sin(angle)} r={11} fill={t.active} />
      </Svg>
    );
  }

  const sides = timing!.phases;
  const idx = Math.max(0, Math.min(sides - 1, timing!.phaseIndex));
  const пути = phaseSegments(sides);
  const v = polygonVertices(sides);
  const бегунок = sides === 2
    ? (() => {
      const angle = -Math.PI / 2 + Math.PI * (idx + прогресс);
      return { x: TIMING_CX + TIMING_R * Math.cos(angle), y: TIMING_CY + TIMING_R * Math.sin(angle) };
    })()
    : (() => {
      const a = v[idx]; const b = v[(idx + 1) % sides];
      return { x: a.x + (b.x - a.x) * прогресс, y: a.y + (b.y - a.y) * прогресс };
    })();

  return (
    <Svg viewBox="0 0 600 420" width="100%" height="100%" style={StyleSheet.absoluteFill as never}>
      {пути.map((d, i) => (
        <Path key={`track-${i}`} d={d} stroke={t.zone} strokeWidth={5} fill="none" opacity={0.35} />
      ))}
      {/**
        * ⚠️ Заливка рисуется у КАЖДОГО отрезка, даже нулевая: пройденные фазы горят
        * целиком, текущая — на свою долю, будущие невидимы. Пропустить нулевые
        * значило бы сдвинуть нумерацию при следующей правке.
        */}
      {пути.map((d, i) => {
        const доля = i < idx ? 1 : i === idx ? прогресс : 0;
        return (
          <Path
            key={`fill-${i}`} d={d} stroke={t.active} strokeWidth={5} fill="none" strokeLinecap="round"
            opacity={доля > 0 ? 1 : 0}
          />
        );
      })}
      {/* Точки стыка — это и есть смены фаз, поэтому помечены всегда. */}
      {(sides === 2
        ? [{ x: TIMING_CX, y: TIMING_CY - TIMING_R }, { x: TIMING_CX, y: TIMING_CY + TIMING_R }]
        : v
      ).map((pt, i) => (
        <Circle key={`corner-${i}`} cx={pt.x} cy={pt.y} r={5} fill={t.line} opacity={0.7} />
      ))}
      <Circle cx={бегунок.x} cy={бегунок.y} r={11} fill={t.active} />
    </Svg>
  );
}

const RENDERERS: Record<string, React.ComponentType<{ cue: VisualCue; t: VisualTheme }>> = {
  'face-speech': FaceVisual,
  relaxation: RelaxationVisual,
  'pelvic-floor': PelvicVisual,
  mobility: MobilityVisual,
  postures: PostureVisual,
  isometrics: IsometricVisual,
  abdomen: AbdomenVisual,
  feldenkrais: FeldenkraisVisual,
  breathing: BreathingVisual,
  'eye-gym': EyeVisual,
};

/** Есть ли у набора своя картинка. Нужно экрану, чтобы не резервировать пустое место. */
export function hasPracticeVisual(setId: string): boolean {
  return Boolean(RENDERERS[setId]);
}

export default function PracticeVisual({ cue, theme, timing }: { cue: VisualCue; theme: VisualTheme; timing?: TimingInfo }) {
  const Renderer = RENDERERS[cue.setId];
  const t = useMemo(() => theme, [theme]);
  if (!Renderer) return null;
  return (
    <View style={styles.stage} accessible={false}>
      <Renderer cue={cue} t={t} />
      <TimingFrame cue={cue} t={t} timing={timing} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 600 / 390, marginBottom: 12 },
  stack: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bodyImage: { width: '100%', height: '100%' },
  eyeField: { flex: 1, width: '100%', borderRadius: 12, overflow: 'hidden' },
  eyePupil: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#fff' },
});
