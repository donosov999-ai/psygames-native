/* psygames-game-spatial-hub · VER 1 · 09.09.2026 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

/** Развилка «Ментальная ротация»: ротация фигур, поворот чисел, сеть труб (состав — hubContents). */
export default function SpatialHub() {
  return (
    <HubScreen
      hubRoute="/games/spatial-hub"
      titleKey="spatialGroup"
      descKey="spatialGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="spatialGroupFootnote"
      icon="cube"
      gradient={['#5614b0', '#dbd65c']}
    />
  );
}
