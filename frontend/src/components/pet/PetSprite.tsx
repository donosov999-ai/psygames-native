/**
 * PetSprite — кадровая анимация Синапса (v1.135; скины v1.140-141).
 *
 * ТРИ скина по 20 кадров 512×512 (производство: Kie 4K лист 4×5 → нарезка
 * скриптом Кодекса, пакеты в _sync/synapse-v2): «cat» — нейро-кот (канон,
 * дефолт), «robot» — прежний Синапс hi-res, «constellation» — semi-realistic
 * бирюзовый (подпись в UI — «Нейрон»: имя «Созвездие» занято СТАДИЕЙ развития).
 * Выбор — экран /pet, хранение psygames_pet_skin (pet.ts).
 *
 * Все точки показа (гуляка, портрет /pet, мини-аватар шапки) — кадры текущего
 * скина; SVG-версия (SynapsePet.tsx) в UI больше не используется.
 */
import React from 'react';
import { Image, View } from 'react-native';

import { a11yDecor } from '@/src/services/a11y';

export type PetState = 'walk' | 'idle' | 'wave' | 'jump' | 'sleep';
export type PetSkin = 'cat' | 'robot' | 'constellation';
/** Аксессуары из магазина (type 'pet' в COSMETICS). Рисуются вектором поверх
 *  кадров — не зависят от скина и не требуют перерисовки спрайт-листов. */
export type PetAccessory = 'party_hat' | 'bow' | 'glasses';

const CAT: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/cat/walk0.webp'),
    require('../../../assets/images/pet/cat/walk1.webp'),
    require('../../../assets/images/pet/cat/walk2.webp'),
    require('../../../assets/images/pet/cat/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/cat/idle0.webp'),
    require('../../../assets/images/pet/cat/idle1.webp'),
    require('../../../assets/images/pet/cat/idle2.webp'),
    require('../../../assets/images/pet/cat/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/cat/wave0.webp'),
    require('../../../assets/images/pet/cat/wave1.webp'),
    require('../../../assets/images/pet/cat/wave2.webp'),
    require('../../../assets/images/pet/cat/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/cat/jump0.webp'),
    require('../../../assets/images/pet/cat/jump1.webp'),
    require('../../../assets/images/pet/cat/jump2.webp'),
    require('../../../assets/images/pet/cat/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/cat/sleep0.webp'),
    require('../../../assets/images/pet/cat/sleep1.webp'),
    require('../../../assets/images/pet/cat/sleep2.webp'),
    require('../../../assets/images/pet/cat/sleep3.webp'),
  ],
};

const ROBOT: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/robot/walk0.webp'),
    require('../../../assets/images/pet/robot/walk1.webp'),
    require('../../../assets/images/pet/robot/walk2.webp'),
    require('../../../assets/images/pet/robot/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/robot/idle0.webp'),
    require('../../../assets/images/pet/robot/idle1.webp'),
    require('../../../assets/images/pet/robot/idle2.webp'),
    require('../../../assets/images/pet/robot/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/robot/wave0.webp'),
    require('../../../assets/images/pet/robot/wave1.webp'),
    require('../../../assets/images/pet/robot/wave2.webp'),
    require('../../../assets/images/pet/robot/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/robot/jump0.webp'),
    require('../../../assets/images/pet/robot/jump1.webp'),
    require('../../../assets/images/pet/robot/jump2.webp'),
    require('../../../assets/images/pet/robot/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/robot/sleep0.webp'),
    require('../../../assets/images/pet/robot/sleep1.webp'),
    require('../../../assets/images/pet/robot/sleep2.webp'),
    require('../../../assets/images/pet/robot/sleep3.webp'),
  ],
};


const CONSTELLATION: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/constellation/walk0.webp'),
    require('../../../assets/images/pet/constellation/walk1.webp'),
    require('../../../assets/images/pet/constellation/walk2.webp'),
    require('../../../assets/images/pet/constellation/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/constellation/idle0.webp'),
    require('../../../assets/images/pet/constellation/idle1.webp'),
    require('../../../assets/images/pet/constellation/idle2.webp'),
    require('../../../assets/images/pet/constellation/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/constellation/wave0.webp'),
    require('../../../assets/images/pet/constellation/wave1.webp'),
    require('../../../assets/images/pet/constellation/wave2.webp'),
    require('../../../assets/images/pet/constellation/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/constellation/jump0.webp'),
    require('../../../assets/images/pet/constellation/jump1.webp'),
    require('../../../assets/images/pet/constellation/jump2.webp'),
    require('../../../assets/images/pet/constellation/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/constellation/sleep0.webp'),
    require('../../../assets/images/pet/constellation/sleep1.webp'),
    require('../../../assets/images/pet/constellation/sleep2.webp'),
    require('../../../assets/images/pet/constellation/sleep3.webp'),
  ],
};

const SKINS: Record<PetSkin, Record<PetState, any[]>> = { cat: CAT, robot: ROBOT, constellation: CONSTELLATION };

/** Один кадр скина (для превью выбора и мини-аватара шапки). */
export function petFrame(skin: PetSkin, state: PetState = 'idle', frame = 0) {
  return SKINS[skin][state][frame];
}

/** Кадровая частота по состоянию: шаг бодрый, сон медленный. */
const FRAME_MS: Record<PetState, number> = {
  walk: 140, idle: 420, wave: 180, jump: 150, sleep: 600,
};

/** Векторные аксессуары в координатах 0..100 (масштабируются с size).
 *  Позиции подобраны по силуэтам трёх скинов: головы у всех в верхней трети,
 *  идеального прилегания к каждому кадру нет и не нужно — это «стикер». */
/**
 * v1.170: ЯКОРНЫЕ ТОЧКИ ВМЕСТО ОБЩИХ КООРДИНАТ.
 *
 * ЗАЧЕМ. Аксессуары сидели ОДНИМИ координатами на всех трёх скинах: на коте
 * попадало, на роботе и Созвездии съезжало — головы и шеи у них в других
 * местах. Вещи при этом продаются в магазине за очки, то есть человек платит
 * за криво надетый предмет.
 *
 * КОНТРАКТ. Формат задал mascot-claude-mac (02.08) и уже проставил якоря в 31
 * пак колоды: проценты 0..100 внутри кадра, origin в левом верхнем углу — та
 * же система, что была у нашего viewBox, поэтому координатную математику
 * переписывать не пришлось. Точка = МЕСТО КРЕПЛЕНИЯ, а не центр предмета;
 * какой стороной предмет садится на точку — задаётся один раз на ТИП
 * аксессуара (ниже), а не на скин. scale — насколько этот персонаж шире или
 * уже среднего.
 *
 * Наши три скина живут не в формате .petpack, а простыми кадрами в assets,
 * поэтому якоря лежат здесь константами в том же формате. При переезде на паки
 * меняется только источник данных, логика остаётся.
 */
interface Anchor { x: number; y: number; scale: number }
type AnchorName = 'head_top' | 'eyes' | 'neck';

/**
 * Якорные точки скинов — ИЗМЕРЕНЫ по силуэту, а не прикинуты на глаз.
 *
 * Считано алгоритмом маскот-движка (`tools/add_anchors.py` в donosov999-ai/mascot-engine,
 * контракт по заявке d54ffc83) по нашим же кадрам idle0..3 каждого скина: макушка —
 * центр масс верхних 6% силуэта, шея — самое узкое место в полосе 20-60% роста, глаза
 * между ними; по кадрам берётся медиана, чтобы наклон головы в одном кадре не увёл точку.
 * Проценты 0..100 от размера кадра, origin в левом верхнем углу — совпадает с viewBox.
 *
 * НАСКОЛЬКО МИМО БЫЛО РАНЬШЕ. Прежние значения я подбирал глазами, и промахи были не
 * косметические: шея кота стояла на y=74, измеренная — 24.2, то есть бант рисовался
 * заметно ниже персонажа. Масштаб робота я задал 1.15 «корпус шире», а по силуэту он
 * УЖЕ кота — коэффициент был в обратную сторону, и предмет на роботе раздувался.
 *
 * scale — ширина силуэта относительно КОТА: аксессуары нарисованы под него, он эталон
 * и получает 1.0 (для него преобразование вырождается в тождественное).
 */
export const SKIN_ANCHORS: Record<PetSkin, Record<AnchorName, Anchor>> = {
  // ⚠️ У КОТА ЯКОРЬ МАКУШКИ БЫЛ ВЗЯТ ПО КОНЧИКАМ АНТЕНН, А НЕ ПО ГОЛОВЕ.
  // Замер спрайта: первый непрозрачный пиксель на 6.8% (антенны), а голова начинается
  // на 10.9%. Якорь стоял на 6.35% — колпак садился нижней кромкой на антенны и висел
  // над головой с зазором. У робота и созвездия антенн нет, там якоря совпали с макушкой
  // и были верны, поэтому ошибку было видно только на коте — а кот облик по умолчанию.
  // Репорт Вали дважды: «колпак всё ещё ужасный», «ГДЕ новый колпак».
  // 13.5% — макушка плюс небольшая посадка внутрь, чтобы предмет сидел, а не балансировал.
  cat:           { head_top: { x: 48.82, y: 13.50, scale: 1.000 }, eyes: { x: 47.02, y: 16.23, scale: 1.000 }, neck: { x: 45.01, y: 24.22, scale: 1.000 } },
  // Робот: якорь стоял на 1% ВЫШЕ макушки (25.2 против 26.2). На экране это два
  // пикселя и глазом не видно, но это та же ошибка, что у кота, только в зачатке.
  // Сажаем в голову, а не балансируем на ней.
  robot:         { head_top: { x: 49.85, y: 27.00, scale: 0.896 }, eyes: { x: 49.90, y: 32.82, scale: 0.896 }, neck: { x: 49.95, y: 39.06, scale: 0.896 } },
  constellation: { head_top: { x: 49.94, y: 11.60, scale: 0.817 }, eyes: { x: 49.71, y: 20.02, scale: 0.817 }, neck: { x: 49.90, y: 27.54, scale: 0.817 } },
};

/** Куда крепится каждый ТИП аксессуара и какой стороной садится на точку. */
const ACCESSORY_MOUNT: Record<PetAccessory, { at: AnchorName; edge: 'bottom' | 'center' }> = {
  party_hat: { at: 'head_top', edge: 'bottom' },   // колпак нижней кромкой на макушку
  bow:       { at: 'neck',     edge: 'center' },   // бант центром на шею
  glasses:   { at: 'eyes',     edge: 'center' },   // очки центром на глаза
};

/**
 * Картинки аксессуаров. Раньше это были примитивы SVG — треугольник, два
 * треугольника и два кружка. Отзыв тестировщицы дословно: «праздничный колпак
 * выглядит как треугольник, нарисованный трёхлетним ребёнком», и она права:
 * человек платит очками за вещь, которая выглядит как заглушка.
 * Теперь объёмные PNG с альфой, 512×512, нарезаны из сгенерированных листов.
 */
const ACCESSORY_IMG: Record<PetAccessory, any> = {
  party_hat: require('@/assets/images/pet/accessories/party_hat.png'),
  bow:       require('@/assets/images/pet/accessories/bow.png'),
  glasses:   require('@/assets/images/pet/accessories/glasses.png'),
};

/** Доля от размера питомца: колпак уже очков, очки шире банта. */
const ACCESSORY_REL: Record<PetAccessory, number> = {
  party_hat: 0.46,
  bow:       0.50,
  glasses:   0.60,
};

/** Поле вокруг предмета внутри PNG — задано при нарезке (6% с каждой стороны). */
const IMG_PAD = 0.06;

function AccessoryOverlay({ kind, size, skin }: { kind: PetAccessory; size: number; skin: PetSkin }) {
  const mount = ACCESSORY_MOUNT[kind];
  const a = SKIN_ANCHORS[skin][mount.at];

  // Якорь задан в процентах кадра — переводим в пиксели текущего размера питомца.
  const ax = (a.x / 100) * size;
  const ay = (a.y / 100) * size;
  const img = ACCESSORY_REL[kind] * size * a.scale;

  // Шапки садятся НИЖНЕЙ кромкой на макушку: внутри PNG предмет прижат к низу с
  // полем IMG_PAD, поэтому нижний край предмета = img * (1 - IMG_PAD) от верха картинки.
  // Остальное крепится центром.
  const top = mount.edge === 'bottom' ? ay - img * (1 - IMG_PAD) : ay - img / 2;
  const left = ax - img / 2;

  return (
    // Обёртка ради pointerEvents: у Image его нет ни в пропсах, ни в стиле,
    // а тап должен доставаться питомцу под аксессуаром.
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: img, height: img }}>
      <Image
        {...a11yDecor}
        source={ACCESSORY_IMG[kind]}
        style={{ width: img, height: img }}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

export default function PetSprite({ state, size = 56, skin = 'cat', accessory = null }: {
  state: PetState; size?: number; skin?: PetSkin; accessory?: PetAccessory | null;
}) {
  const frames = SKINS[skin][state];
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    setFrame(0);
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), FRAME_MS[state]);
    return () => clearInterval(t);
  }, [state, skin, frames.length]);

  /**
   * Все кадры лежат стопкой, анимация — переключение видимости.
   *
   * Раньше здесь была ОДНА картинка, которой подменяли source по таймеру. На
   * нативе это гасит `fadeDuration={0}`, а в вебе — нет: Chromium на смену src
   * показывает пустой кадр, пока декодирует новый файл. Android-сборка у нас
   * это WebView, поэтому питомец на телефоне подмигивал и «исчезал на мгновение»
   * (репорт тестировщика, v1.170). Смонтированные картинки уже декодированы,
   * переключение opacity ничего не подгружает — мигать нечему.
   *
   * Кадров в состоянии 2-4 штуки, так что стопка ничего не стоит по памяти.
   */
  return (
    <View style={{ width: size, height: size }}>
      {frames.map((src, i) => (
        <Image
          key={i}
          {...a11yDecor}
          source={src}
          style={{
            width: size, height: size,
            ...(i === 0 ? null : { position: 'absolute', top: 0, left: 0 }),
            opacity: i === frame % frames.length ? 1 : 0,
          }}
          resizeMode="contain"
          fadeDuration={0}
        />
      ))}
      {accessory && <AccessoryOverlay kind={accessory} size={size} skin={skin} />}
    </View>
  );
}
