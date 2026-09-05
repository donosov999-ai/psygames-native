/* psygames-game-flexibility-hub · VER 2 · 04.09.2026 */
/**
 * Развилка «Гибкость» — не залипать на одном признаке.
 *
 * ⚠️ VER 2 — СОСТАВ СМЕНИЛСЯ ЦЕЛИКОМ. В первой редакции здесь стояли «Следопыт»,
 * «Переключение задач» и Висконсинский тест. 04.09.2026 Денис развёл их иначе:
 * пробы, где правило меняют ИЗВНЕ (по сигналу или молча), уехали в «Конфликт
 * внимания», «Следопыт» — в «Маршруты» как цепочка, которую надо покрыть.
 *
 * Здесь остались три, где переключаться приходится САМОМУ, без внешнего сигнала:
 * в «Закономерностях» надо бросить гипотезу, которая перестала объяснять ряд; в
 * «Тройке признаков» — на каждом ходу менять признак, по которому ищешь; в
 * «Символ-цифре» — держать ключ и раз за разом переходить между его строками.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function FlexibilityHub() {
  return (
    <HubScreen
      hubRoute="/games/flexibility-hub"
      titleKey="flexibilityGroup"
      descKey="flexibilityGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="flexibilityGroupFootnote"
      icon="swap-horizontal"
      gradient={['#6366f1', '#14b8a6']}
    />
  );
}
