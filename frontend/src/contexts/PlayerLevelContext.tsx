/* psygames-player-level-ctx · VER 1 · 03.09.2026 */
import React, { createContext, useContext } from 'react';
import { useProfile } from '@/src/contexts/ProfileContext';
import { usePlayerLevel } from '@/src/hooks/usePlayerLevel';
import { FEATURE_LADDER } from '@/src/services/featureLadder';

/**
 * УРОВЕНЬ ИГРОКА — ОДНО ЧТЕНИЕ НА ЭКРАН, А НЕ НА КНОПКУ.
 *
 * Замки навешиваются на служебные кнопки (`GameAuxAction`), а их на экране
 * несколько. Если бы каждая читала хранилище сама, один вход в игру давал бы
 * четыре одинаковых обхода `getAllKeys`. Провайдер читает раз, кнопки берут
 * готовое.
 *
 * ⚠️ ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ — `null`, «неизвестно», и оно НИЧЕГО не запирает.
 * Компонент вне провайдера (проба, отдельный экран) обязан работать как раньше:
 * замок появляется только там, где уровень действительно известен.
 */
const Ctx = createContext<number | null>(null);

/**
 * Провайдер с ГОТОВЫМ значением — им пользуется проба замков: она обязана
 * проверить нарисованное при уровне 0 и при уровне 10, а не уметь заводить
 * профиль и хранилище. Уровень сюда кладётся напрямую.
 */
export function PlayerLevelValue({ level, children }: { level: number | null; children: React.ReactNode }) {
  return <Ctx.Provider value={level}>{children}</Ctx.Provider>;
}

export function PlayerLevelProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const уровень = usePlayerLevel(profile?.id);
  return <Ctx.Provider value={уровень}>{children}</Ctx.Provider>;
}

/** Уровень игрока или `null`, если он ещё не известен. */
export function usePlayerLevelCtx(): number | null {
  return useContext(Ctx);
}

/**
 * Заперт ли приём для текущего игрока — ОДНО место, где это решается.
 *
 * ⚠️ Решение вынесено из `GameAuxAction`, потому что служебная кнопка не
 * единственная: подсказка судоку нарисована `GlassButton`, и без общего хука
 * второй экран считал бы замок по своей копии правила. Копия правила расходится
 * с оригиналом молча — это в проекте уже случалось с вендор-копией ядра.
 *
 * `заперт` истинно ТОЛЬКО при известном уровне: `null` ничего не запирает.
 */
export function useLadderLock(ladder?: string): { заперт: boolean; порог: number | null } {
  const уровень = usePlayerLevelCtx();
  const замок = FEATURE_LADDER.find((l) => l.key === ladder);
  if (!замок) return { заперт: false, порог: null };
  return { заперт: уровень !== null && уровень < замок.level, порог: замок.level };
}
