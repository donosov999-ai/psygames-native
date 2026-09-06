/* psygames-game-nut-sort · VER 1 · 06.09.2026 */
/**
 * «Сортировка гаек» — тот же движок, что у переливалки, другая шкурка и своя
 * лестница.
 *
 * Решение Дениса 06.09.2026 по «Сортировка Цветов Гаек»: отдельной игрой рядом.
 * Разбор и цена решения — в шапке `SortGameScreen`.
 *
 * ⚠️ ЧЕМ ГАЙКИ ОТЛИЧАЮТСЯ НА ПОЛЕ: гранёные плитки с отверстием на стержне
 * вместо жидкости в пробирке. Стекла у них нет — блик поверх металла читался бы
 * как грязь.
 */
import React from 'react';
import { SortGameScreen } from '@/app/games/water-sort';

export default function NutSortGame() {
  return <SortGameScreen gameId="nut_sort" skin="nuts" titleKey="nutSort" />;
}
