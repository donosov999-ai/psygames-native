/* psygames-game-ball-sort · VER 1 · 06.09.2026 */
/**
 * «Сортировка шариков» — тот же движок, что у переливалки, другая шкурка и своя
 * лестница.
 *
 * Решение Дениса 06.09.2026 по «Color Ball Sort Wooden Puzzle»: отдельной игрой
 * рядом, а не режимом. Я предлагал скином и был переубеждён — разбор и цена
 * решения записаны в шапке `SortGameScreen`.
 *
 * ⚠️ КОПИИ ЭКРАНА ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО. Файл — маршрут в три строки:
 * различаются ключ лестницы, форма слоя и заголовок. Три копии
 * шестисотстрочного экрана разъехались бы за неделю; в проекте это уже
 * случалось с двумя экранами судоку.
 */
import React from 'react';
import { SortGameScreen } from '@/app/games/water-sort';

export default function BallSortGame() {
  return <SortGameScreen gameId="ball_sort" skin="balls" titleKey="ballSort" />;
}
