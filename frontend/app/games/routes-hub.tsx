/* psygames-game-routes-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Маршруты» — проложить путь, который обязан покрыть всё.
 *
 * Заведена 04.09.2026 по выбору Дениса из разбора каталога. Общий навык у обеих
 * проб один: почти каждый ход законен САМ ПО СЕБЕ и при этом заводит в тупик,
 * поэтому выигрывает не тот, кто быстрее тянет линию, а тот, кто просчитал
 * покрытие заранее. Это то же самое, что меряют «Башни», но без перекладывания:
 * там переносят предметы, здесь ведут линию.
 *
 * ⚠️ Обе игры в песочнице (`sandbox: true`) — сырая динамика, в публичный счёт
 * упражнений они не входят. Развилка видна в предпросмотре профиля НЗТ-48, как и
 * остальные новые.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function RoutesHub() {
  return (
    <HubScreen
      titleKey="routesGroup"
      descKey="routesGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="routesGroupFootnote"
      icon="git-network"
      gradient={['#0f766e', '#4f46e5']}
      games={[
        { route: '/games/dots-connect', icon: 'ellipse', nameKey: 'dotsConnect', descKey: 'dotsConnectDesc' },
        { route: '/games/one-line', icon: 'analytics', nameKey: 'oneLine', descKey: 'oneLineDesc' },
        { route: '/games/trail-making', icon: 'git-network', nameKey: 'trailMaking', descKey: 'trailMakingDesc' },
      ]}
    />
  );
}
