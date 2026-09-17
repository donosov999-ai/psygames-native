/* psygames-game-field-height · VER 1 · 17.09.2026 */
/**
 * СКОЛЬКО ВЫСОТЫ У ПРОКРУЧИВАЕМОГО ПОЛЯ КАРКАСА — для экрана, который вписывает доску по высоте.
 *
 * Каркас (`GameShell`, ветка `scrollableField`) меряет окно поля и отдаёт сюда место для
 * содержимого: окно минус отступы. 0 — поле ещё не измерено или экран без `scrollableField`.
 * Носитель — `app/games/puzzles.tsx` (отчёт e5bfc2f0 «игры всё ещё ездят», задача 42dbd9bf).
 *
 * ⚠️ ОТДЕЛЬНЫМ МОДУЛЕМ, А НЕ ЭКСПОРТОМ КАРКАСА. Пробы экранов подменяют `GameShell` своей
 * заглушкой; именованный экспорт каркаса в заглушке — `undefined`, и экран падал бы в каждой такой
 * пробе («Element type is invalid»). Этот модуль заглушки не трогают: без каркаса высота просто 0.
 *
 * ⚠️ ИМЕНА ХУКА И КОМПОНЕНТА ЛАТИНИЦЕЙ: правило хуков линта узнаёт компонент по заглавной латинской
 * букве, а хук — по `use` и латинской букве после него.
 */
import React from 'react';

export const ВысотаПоляКаркаса = React.createContext(0);

export function useGameFieldHeight(): number {
  return React.useContext(ВысотаПоляКаркаса);
}

/** Для экрана, который сам стоит НАД каркасом: высота приходит внутрь поля. */
export function GameFieldHeight({ children }: { children: (высота: number) => React.ReactNode }) {
  return <>{children(React.useContext(ВысотаПоляКаркаса))}</>;
}
