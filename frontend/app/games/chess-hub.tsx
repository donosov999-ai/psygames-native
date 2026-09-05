/* psygames-game-chess-hub · VER 1 · 05.09.2026 */
/**
 * Развилка «Шахматы» — просьба Дениса 05.09.2026, дословно: «надо все
 * упражнения по шахматам заказать в хаб шахматы».
 *
 * Повод конкретный: в тот день шахматных упражнений стало два, и они разъехались
 * по разным местам меню. «Доска в уме» лежала под «Зрительной памятью», «Детский
 * мат» — отдельной карточкой в «Памяти». Человек, который пришёл тренировать
 * шахматы, обязан был знать оба названия заранее.
 *
 * ⚠️ ЧТО У НИХ ОБЩЕЕ И ЧТО РАЗНОЕ. Общая — доска и обозначения полей: e4, конь,
 * ферзь. Навыки РАЗНЫЕ, и это не мелочь, а причина держать их двумя входами, а
 * не одним экраном с переключателем:
 *   · «Доска в уме» — позицию ДЕРЖАТ В ГОЛОВЕ и ходят медленно;
 *   · «Детский мат» — позиция НА ВИДУ, и всё решает скорость узнавания узора.
 * Слить их значило бы получить упражнение, у которого нет одной цифры роста.
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';

export default function ChessHub() {
  return (
    <HubScreen
      titleKey="chessGroup"
      descKey="chessGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="chessGroupFootnote"
      icon="grid"
      gradient={['#8e5b2f', '#2f2a24']}
      games={[
        { route: '/games/scholars-mate', icon: 'flash', nameKey: 'scholarsMate', descKey: 'scholarsMateDesc' },
        { route: '/games/chess-blind', icon: 'apps', nameKey: 'chessBlind', descKey: 'chessBlindDesc' },
      ]}
    />
  );
}
