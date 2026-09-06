/* psygames-game-words-hub · VER 2 · 06.09.2026 */
/**
 * Развилка «Слова» — словарь и извлечение слова из памяти.
 *
 * Заведена 04.09.2026 по решению Дениса: каталог из 52 карточек не листается, а
 * эти пробы меряют одно и то же.
 *
 * 🔴 VER 2: над выбором появилась ЗАРЯДКА ПО СЛОВАМ. Просьба Дениса 06.09.2026:
 * «надо зарядку по словам собрать на 5–10 минут; надо по идее выбор сделать в
 * зарядках по времени, чтобы понять, какую серию запускают». Состав лежит в
 * `components/warmups/WordsWarmup.tsx`: экран развилки не хранит маршрутов —
 * этого требует гейт `hub-badge`, и по делу (см. комментарий в том файле).
 */
import React from 'react';
import HubScreen from '@/src/components/HubScreen';
import { WordsWarmup, АКЦЕНТ_СЛОВА } from '@/src/components/warmups/WordsWarmup';

const ГРАДИЕНТ: [string, string] = [АКЦЕНТ_СЛОВА, '#ec4899'];

export default function WordsHub() {
  return (
    <HubScreen
      hubRoute="/games/words-hub"
      titleKey="wordsGroup"
      descKey="wordsGroupDesc"
      pickKey="hubPickExercise"
      footnoteKey="wordsGroupFootnote"
      icon="text"
      gradient={ГРАДИЕНТ}
      headerSlot={<WordsWarmup />}
    />
  );
}
