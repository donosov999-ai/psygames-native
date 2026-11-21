/* psygames-warmup-chess · VER 1 · 06.09.2026 */
/**
 * СОСТАВ ШАХМАТНОЙ ЗАРЯДКИ. Отчёт Дениса 05.09.2026, дословно: «Надо стерео типа
 * зарядки собрать и с обоих этих штук и чтобы они типа потекли по уровням и
 * желательно чтобы можно было задавать время типа как в режиме потока».
 *
 * ⚠️ ЗАРЯДКА НЕ СЛИВАЕТ УПРАЖНЕНИЯ. «Доска в уме» держит позицию В ГОЛОВЕ,
 * «Детский мат» — позиция НА ВИДУ и решает скорость узнавания. Зарядка ставит их
 * подряд; у каждого остаётся своя лестница и своя цифра роста.
 *
 * ⚠️ ПОЧЕМУ СОСТАВ ЗДЕСЬ, А НЕ В ЭКРАНЕ РАЗВИЛКИ — см. `WordsWarmup.tsx`:
 * экран развилки не хранит маршрутов, иначе значок на главной разъезжается
 * с содержимым.
 */
import React from 'react';
import { WarmupCard } from '@/src/components/WarmupCard';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { темыИзФайла } from '@/src/services/chessWarmup';

export const АКЦЕНТ_ШАХМАТЫ = '#8e5b2f';

export function ChessWarmup() {
  /** Уровни берутся из СОБСТВЕННЫХ лестниц игр — «чтобы они потекли по уровням». */
  const мат = usePersistentLevel('scholars_mate');
  const доска = usePersistentLevel('chess_blind');
  return (
    <WarmupCard
      темы={темыИзФайла('chess', { scholars_mate: мат.level, chess_blind: доска.level })}
      titleKey="chessWarmupTitle"
      descKey="chessWarmupDesc"
      ярлык="шахматы"
      bridgeId="chess"
      accent={АКЦЕНТ_ШАХМАТЫ}
      loading={!мат.loaded || !доска.loaded}
    />
  );
}
