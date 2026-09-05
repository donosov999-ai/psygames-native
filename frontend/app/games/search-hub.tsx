/* psygames-game-search-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Поиск глазами» — найти нужное среди похожего.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function SearchHub() {
  return (
    <HubScreen
      hubRoute="/games/search-hub"
      titleKey="searchGroup"
      descKey="searchGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="searchGroupFootnote"
      icon="search"
      gradient={['#f59e0b', '#ef4444']}
    />
  );
}
