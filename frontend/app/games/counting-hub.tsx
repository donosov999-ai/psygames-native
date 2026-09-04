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
      titleKey="countingGroup"
      descKey="countingGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="countingGroupFootnote"
      icon="calculator"
      gradient={['#0ea5e9', '#22d3ee']}
      games={[
        { route: '/games/counter', icon: 'list-outline', nameKey: 'counter', descKey: 'counterDesc' },
        { route: '/games/math-slider', icon: 'swap-horizontal', nameKey: 'mathSlider', descKey: 'mathSliderDesc' },
        { route: '/games/math-sprint', icon: 'flash', nameKey: 'mathSprint', descKey: 'mathSprintDesc' },
        { route: '/games/number-bonds', icon: 'git-merge', nameKey: 'numberBonds', descKey: 'numberBondsDesc' },
        // 04.09.2026: перенесён из «Объёма памяти» по решению Дениса (отчёт a0df2925)
        { route: '/games/ospan', icon: 'calculator', nameKey: 'ospan', descKey: 'ospanDesc' },
      ]}
    />
  );
}
