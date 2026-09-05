/* psygames-game-counting-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Счёт» — числа в уме: пересчёт, прикидка, скорость.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function CountingHub() {
  return (
    <HubScreen
      hubRoute="/games/counting-hub"
      titleKey="countingGroup"
      descKey="countingGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="countingGroupFootnote"
      icon="calculator"
      gradient={['#0ea5e9', '#22d3ee']}
    />
  );
}
