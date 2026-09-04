/* psygames-game-risk-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Решения под риском» — выбор, когда исход неизвестен.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function RiskHub() {
  return (
    <HubScreen
      titleKey="riskGroup"
      descKey="riskGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="riskGroupFootnote"
      icon="scale"
      gradient={['#b45309', '#f59e0b']}
      games={[
        { route: '/games/bart', icon: 'balloon', nameKey: 'bart', descKey: 'bartDesc' },
        { route: '/games/iowa', icon: 'card', nameKey: 'iowa', descKey: 'iowaDesc' },
        { route: '/games/prl', icon: 'shuffle', nameKey: 'prl', descKey: 'prlDesc' },
      ]}
    />
  );
}
