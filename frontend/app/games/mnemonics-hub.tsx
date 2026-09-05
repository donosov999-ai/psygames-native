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
      hubRoute="/games/mnemonics-hub"
      titleKey="mnemonicsGroup"
      descKey="mnemonicsGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="mnemonicsGroupFootnote"
      icon="link"
      gradient={['#d946ef', '#f59e0b']}
    />
  );
}
