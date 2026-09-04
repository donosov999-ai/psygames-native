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
      titleKey="searchGroup"
      descKey="searchGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="searchGroupFootnote"
      icon="search"
      gradient={['#f59e0b', '#ef4444']}
      games={[
        { route: '/games/visual-search', icon: 'scan', nameKey: 'visualSearch', descKey: 'visualSearchDesc' },
        { route: '/games/proofreading', icon: 'create-outline', nameKey: 'proofreading', descKey: 'proofreadingDesc' },
        { route: '/games/find-differences', icon: 'copy', nameKey: 'findDifferences', descKey: 'findDifferencesDesc' },
        { route: '/games/mahjong', icon: 'grid', nameKey: 'mahjong', descKey: 'mahjongDesc' },
        { route: '/games/schulte', icon: 'apps', nameKey: 'schulteTable', descKey: 'schulteTableDesc' },
        { route: '/games/quick-count', icon: 'eye', nameKey: 'quickCount', descKey: 'quickCountDesc' },
      ]}
    />
  );
}
