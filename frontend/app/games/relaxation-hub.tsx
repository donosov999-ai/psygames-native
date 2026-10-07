/* psygames-game-relaxation-hub · VER 1 · 07.10.2026 */
/**
 * Развилка «Релаксация» — передышки: дыхание, глаза, пауза.
 *
 * Заведена 07.10.2026 по решению Дениса (b271f702): «практики дня — это тоже типа хабов». Три
 * упражнения жили только наверху Главной и вразброс по каталогу, ни в одной развилке.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function RelaxationHub() {
  return (
    <HubScreen
      hubRoute="/games/relaxation-hub"
      titleKey="relaxationGroup"
      descKey="relaxationGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="relaxationGroupFootnote"
      icon="leaf"
      gradient={['#0f766e', '#36d1dc']}
    />
  );
}
