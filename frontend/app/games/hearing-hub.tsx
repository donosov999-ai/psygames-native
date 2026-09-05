/* psygames-game-hearing-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Слух» — задание звучит: различить, повторить, назвать тон.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function HearingHub() {
  return (
    <HubScreen
      hubRoute="/games/hearing-hub"
      titleKey="hearingGroup"
      descKey="hearingGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="hearingGroupFootnote"
      icon="ear"
      gradient={['#0d9488', '#84cc16']}
    />
  );
}
