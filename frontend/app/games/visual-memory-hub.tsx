/* psygames-game-visual-memory-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Зрительная память» — запомнить увиденное и воспроизвести.
 *
 * Заведена 04.09.2026: в каталоге «память» разрослась до четырнадцати карточек и
 * перестала листаться. Весь вид — в общем каркасе `HubScreen`.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function VisualMemoryHub() {
  return (
    <HubScreen
      titleKey="visualMemoryGroup"
      descKey="visualMemoryGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="visualMemoryGroupFootnote"
      icon="images"
      gradient={['#7c3aed', '#0ea5e9']}
      games={[
        { route: '/games/memory-matrix', icon: 'grid', nameKey: 'memoryMatrix', descKey: 'memoryMatrixDesc' },
        { route: '/games/picture-pairs', icon: 'copy', nameKey: 'picturePairs', descKey: 'picturePairsDesc' },
        { route: '/games/chess-blind', icon: 'apps', nameKey: 'chessBlind', descKey: 'chessBlindDesc' },
      ]}
    />
  );
}
