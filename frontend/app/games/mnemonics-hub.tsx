/* psygames-game-mnemonics-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Мнемотехники» — привязать новое к тому, что уже помнишь.
 *
 * Заведена 04.09.2026: в каталоге «память» разрослась до четырнадцати карточек и
 * перестала листаться. Весь вид — в общем каркасе `HubScreen`.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function MnemonicsHub() {
  return (
    <HubScreen
      titleKey="mnemonicsGroup"
      descKey="mnemonicsGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="mnemonicsGroupFootnote"
      icon="link"
      gradient={['#d946ef', '#f59e0b']}
      games={[
        { route: '/games/mnemonics', icon: 'bulb', nameKey: 'mnemonics', descKey: 'mnemonicsDesc' },
        { route: '/games/memory-palace', icon: 'home', nameKey: 'memoryPalace', descKey: 'memoryPalaceDesc' },
        { route: '/games/faces-names', icon: 'person', nameKey: 'facesNames', descKey: 'facesNamesDesc' },
        { route: '/games/word-pairs', icon: 'link', nameKey: 'wordPairs', descKey: 'wordPairsDesc' },
      ]}
    />
  );
}
