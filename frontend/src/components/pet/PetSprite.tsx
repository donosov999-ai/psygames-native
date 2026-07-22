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
import { Image } from 'react-native';

export type PetState = 'walk' | 'idle' | 'wave' | 'jump' | 'sleep';
export type PetSkin = 'cat' | 'robot' | 'constellation';

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

export default function PetSprite({ state, size = 56, skin = 'cat' }: {
  state: PetState; size?: number; skin?: PetSkin;
}) {
  const frames = SKINS[skin][state];
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    setFrame(0);
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), FRAME_MS[state]);
    return () => clearInterval(t);
  }, [state, skin, frames.length]);

  return (
    <Image
      source={frames[frame % frames.length]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}
