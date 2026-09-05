/* psygames-game-words-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Слова» — словарь и извлечение слова из памяти.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а эти пробы меряют одно и то же.
 *
 * Весь вид — в общем каркасе `HubScreen`. Здесь только данные: шесть таких
 * экранов копиями разошлись бы на первой правке вида.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function WordsHub() {
  return (
    <HubScreen
      hubRoute="/games/words-hub"
      titleKey="wordsGroup"
      descKey="wordsGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="wordsGroupFootnote"
      icon="text"
      gradient={['#8b5cf6', '#ec4899']}
    />
  );
}
