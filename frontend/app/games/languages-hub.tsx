/* psygames-game-languages-hub · VER 1 · 04.09.2026 */
/**
 * Развилка «Языки» — зонтик над двумя сторонами чужого языка.
 *
 * 🔴 ЗАЧЕМ ЗОНТИК, А НЕ ЕЩЁ ОДИН ПЛОСКИЙ СПИСОК. Денис 04.09.2026: «нужен ещё хаб
 * Языки, лингвистика — там память на слова и память на произношение слова». Это и
 * есть две разные памяти, и они уже собраны развилками «Слова» и «Слух». Свалить
 * девять упражнений в один список значило бы стереть между ними границу: словарь
 * учится глазами, произношение — ухом, и заходы туда разные.
 *
 * Поэтому здесь ровно два входа, каждый ведёт в свою развилку. Вложенность на один
 * уровень — цена того, что человек с порога видит, ЧТО именно он собрался
 * тренировать.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function LanguagesHub() {
  return (
    <HubScreen
      hubRoute="/games/languages-hub"
      titleKey="languagesGroup"
      descKey="languagesGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="languagesGroupFootnote"
      icon="language"
      gradient={['#0891b2', '#a855f7']}
    />
  );
}
