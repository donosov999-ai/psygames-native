/* psygames-game-puzzles-hub · VER 2 · 10.09.2026 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGamePreset } from '@/src/hooks/useGamePreset';

/**
 * Развилка «Головоломки»: ВСЯ коллекция Саймона Тэтхэма — сорок головоломок на одном экране,
 * режим выбирается карточкой (`?mode=<движок>`). Состав — в `hubContents.ts`.
 */
export default function PuzzlesHub() {
  // Тихий шаг нужен и развилке: вечером она открывается без звука и вспышек.
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);
  return (
    <HubScreen
      hubRoute="/games/puzzles-hub"
      titleKey="puzzlesGroup"
      descKey="puzzlesGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="puzzlesGroupFootnote"
      icon="extension-puzzle"
      gradient={['#0f766e', '#f59e0b']}
    />
  );
}
