/**
 * PetSprite — кадровая анимация Синапса (v1.135.0).
 *
 * Кадры сгенерены одним листом через kie (Nano Banana): 4×5 поз, зелёный
 * хромакей снят PIL-нарезкой (scratchpad). 5 состояний × 4 кадра, 144px webp.
 * Формат состояний подсмотрен в петпаках codex-pet-desktop (idle/walk/wave/
 * jump/sleep + тайминги в pet.json) — форк donosov999-ai.
 *
 * SVG-версия (SynapsePet) остаётся для экрана /pet и мини-аватара шапки —
 * там нужен масштабируемый персонаж со стадиями; спрайты — для ЖИВОЙ ходьбы.
 */
import React from 'react';
import { Image } from 'react-native';

export type PetState = 'walk' | 'idle' | 'wave' | 'jump' | 'sleep';

const FRAMES: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/walk0.webp'),
    require('../../../assets/images/pet/walk1.webp'),
    require('../../../assets/images/pet/walk2.webp'),
    require('../../../assets/images/pet/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/idle0.webp'),
    require('../../../assets/images/pet/idle1.webp'),
    require('../../../assets/images/pet/idle2.webp'),
    require('../../../assets/images/pet/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/wave0.webp'),
    require('../../../assets/images/pet/wave1.webp'),
    require('../../../assets/images/pet/wave2.webp'),
    require('../../../assets/images/pet/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/jump0.webp'),
    require('../../../assets/images/pet/jump1.webp'),
    require('../../../assets/images/pet/jump2.webp'),
    require('../../../assets/images/pet/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/sleep0.webp'),
    require('../../../assets/images/pet/sleep1.webp'),
    require('../../../assets/images/pet/sleep2.webp'),
    require('../../../assets/images/pet/sleep3.webp'),
  ],
};

/** Кадровая частота по состоянию: шаг бодрый, сон медленный. */
const FRAME_MS: Record<PetState, number> = {
  walk: 140, idle: 420, wave: 180, jump: 150, sleep: 600,
};

export default function PetSprite({ state, size = 56 }: { state: PetState; size?: number }) {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    setFrame(0);
    const t = setInterval(
      () => setFrame((f) => (f + 1) % FRAMES[state].length),
      FRAME_MS[state],
    );
    return () => clearInterval(t);
  }, [state]);

  return (
    <Image
      source={FRAMES[state][frame]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}
