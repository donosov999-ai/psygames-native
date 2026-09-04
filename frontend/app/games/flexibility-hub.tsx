/* psygames-game-flexibility-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Гибкость» — переключаться между правилами, не залипая.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function FlexibilityHub() {
  return (
    <HubScreen
      titleKey="flexibilityGroup"
      descKey="flexibilityGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="flexibilityGroupFootnote"
      icon="swap-horizontal"
      gradient={['#6366f1', '#14b8a6']}
      games={[
        { route: '/games/trail-making', icon: 'git-network', nameKey: 'trailMaking', descKey: 'trailMakingDesc' },
        { route: '/games/switching-task', icon: 'repeat', nameKey: 'switchingTask', descKey: 'switchingTaskDesc' },
        { route: '/games/wcst', icon: 'albums-outline', nameKey: 'wcst', descKey: 'wcstDesc' },
      ]}
    />
  );
}
