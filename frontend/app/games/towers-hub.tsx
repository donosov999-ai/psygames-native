/* psygames-game-towers-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Башни» — переложить по правилам, продумав ходы вперёд.
 *
 * Заведена 04.09.2026 по замечанию Дениса: «башня Лондона и ханойская башня — это
 * типа сортировки хаб получается». Он прав по сути: обе пробы про одно — привести
 * фигуры в заданный порядок, где каждый ход ограничен правилом, и выиграть можно
 * только продумав цепочку заранее.
 *
 * ⚠️ «Сортировка товаров» сюда НЕ включена, хотя по названию просится. Там меряется
 * другое: отнести предмет к категории по признаку — это классификация, а не
 * планирование ходов. Смешать значило бы получить развилку, у которой нет общего
 * навыка, а есть общее слово.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function TowersHub() {
  return (
    <HubScreen
      hubRoute="/games/towers-hub"
      titleKey="towersGroup"
      descKey="towersGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="towersGroupFootnote"
      icon="albums"
      gradient={['#7c3aed', '#0ea5e9']}
    />
  );
}
