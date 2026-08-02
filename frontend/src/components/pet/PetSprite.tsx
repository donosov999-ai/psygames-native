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
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';
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

const SKIN_ANCHORS: Record<PetSkin, Record<AnchorName, Anchor>> = {
  // Кот: пропорции, под которые изначально рисовались координаты — эталон.
  cat:           { head_top: { x: 50, y: 12, scale: 1.00 }, eyes: { x: 50, y: 34, scale: 1.00 }, neck: { x: 50, y: 74, scale: 1.00 } },
  // Робот: голова крупнее и ниже, корпус шире — предмет должен быть больше.
  robot:         { head_top: { x: 50, y: 16, scale: 1.15 }, eyes: { x: 50, y: 38, scale: 1.15 }, neck: { x: 50, y: 78, scale: 1.15 } },
  // Созвездие: силуэт уже и выше, макушка почти у края кадра.
  constellation: { head_top: { x: 50, y:  8, scale: 0.90 }, eyes: { x: 50, y: 30, scale: 0.90 }, neck: { x: 50, y: 70, scale: 0.90 } },
};

/** Куда крепится каждый ТИП аксессуара и какой стороной садится на точку. */
const ACCESSORY_MOUNT: Record<PetAccessory, { at: AnchorName; edge: 'bottom' | 'center' }> = {
  party_hat: { at: 'head_top', edge: 'bottom' },   // колпак нижней кромкой на макушку
  bow:       { at: 'neck',     edge: 'center' },   // бант центром на шею
  glasses:   { at: 'eyes',     edge: 'center' },   // очки центром на глаза
};

function AccessoryOverlay({ kind, size, skin }: { kind: PetAccessory; size: number; skin: PetSkin }) {
  const mount = ACCESSORY_MOUNT[kind];
  const a = SKIN_ANCHORS[skin][mount.at];
  // Рисуем предмет в СВОЕЙ системе (как раньше, вокруг кота), а потом сдвигаем и
  // масштабируем группу так, чтобы точка крепления легла на якорь скина.
  // База — координаты кота: там предмет уже стоял правильно.
  const base = SKIN_ANCHORS.cat[mount.at];
  const tx = a.x - base.x * a.scale;
  const ty = a.y - base.y * a.scale;
  return (
    <Svg
      pointerEvents="none"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      <G transform={`translate(${tx} ${ty}) scale(${a.scale})`}>
        {kind === 'party_hat' && (
          <>
            <Path d="M50 2 L36 26 L64 26 Z" fill="#8a68f5" stroke="#5d43c4" strokeWidth={2} />
            <Line x1={43} y1={14} x2={57} y2={14} stroke="#f5b50a" strokeWidth={2.5} />
            <Circle cx={50} cy={2.5} r={4} fill="#f5b50a" />
          </>
        )}
        {kind === 'bow' && (
          <>
            <Path d="M50 74 L36 66 L36 82 Z" fill="#ff4d8d" stroke="#c22a63" strokeWidth={2} />
            <Path d="M50 74 L64 66 L64 82 Z" fill="#ff4d8d" stroke="#c22a63" strokeWidth={2} />
            <Circle cx={50} cy={74} r={4.5} fill="#c22a63" />
          </>
        )}
        {kind === 'glasses' && (
          <>
            <Circle cx={38} cy={34} r={9} fill="none" stroke="#1f2937" strokeWidth={3} />
            <Circle cx={62} cy={34} r={9} fill="none" stroke="#1f2937" strokeWidth={3} />
            <Line x1={47} y1={34} x2={53} y2={34} stroke="#1f2937" strokeWidth={3} />
            <Ellipse cx={35} cy={31} rx={3} ry={2} fill="#ffffff" opacity={0.55} />
          </>
        )}
      </G>
    </Svg>
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

  return (
    <View style={{ width: size, height: size }}>
      <Image
        {...a11yDecor}
        source={frames[frame % frames.length]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        fadeDuration={0}
      />
      {accessory && <AccessoryOverlay kind={accessory} size={size} skin={skin} />}
    </View>
  );
}
