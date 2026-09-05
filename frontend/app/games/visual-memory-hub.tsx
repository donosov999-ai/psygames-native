/* psygames-game-visual-memory-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Зрительная память» — запомнить увиденное и воспроизвести.
 *
 * Заведена 04.09.2026: в каталоге «память» разрослась до четырнадцати карточек и
 * перестала листаться. Весь вид — в общем каркасе `HubScreen`.
 *
 * ⚠️ 05.09.2026 отсюда ушла «Доска в уме» — в развилку «Шахматы» (просьба
 * Дениса собрать шахматные упражнения одним входом). Зрительная память у неё
 * действительно есть, но приходят в неё за шахматами.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function VisualMemoryHub() {
  return (
    <HubScreen
      hubRoute="/games/visual-memory-hub"
      titleKey="visualMemoryGroup"
      descKey="visualMemoryGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="visualMemoryGroupFootnote"
      icon="images"
      gradient={['#7c3aed', '#0ea5e9']}
    />
  );
}
