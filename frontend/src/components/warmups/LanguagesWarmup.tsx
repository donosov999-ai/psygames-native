/* psygames-warmup-languages · VER 1 · 08.09.2026 */
/**
 * СОСТАВ ЯЗЫКОВОЙ ЗАРЯДКИ. Решение Дениса 07–08.09.2026: язык меняется от шага
 * к шагу, языков два — английский и испанский, русский остаётся якорем смысла.
 *
 * ⚠️ ПОЧЕМУ СОСТАВ НЕ ЗДЕСЬ, А В `services/languageFlow`. Порядок игр и
 * последовательность языков — не вёрстка, а правило, и его надо гонять пробами:
 * доля повторов в ряду решает, считается ли вообще цена переключения
 * (`switchCostMs` при пустом подмножестве отдаёт ноль). В компоненте такое
 * правило проверялось бы глазами.
 *
 * ⚠️ ЧЕТЫРЕ УПРАЖНЕНИЯ, А НЕ ВСЕ ОДИННАДЦАТЬ ИЗ ХАБА. Это разные ЗАХОДЫ к слову
 * на чужом языке: узнать перевод (карточки), достать слово по смыслу в фразе
 * (пропущенное), отнести к категории (сортировка), отличить слово от не-слова
 * (лексическое решение). Пятое того же вида дало бы длину без нового навыка.
 *
 * ⚠️ АНАГРАММ И БЕГЛОСТИ ЗДЕСЬ НЕТ НАРОЧНО: они читают язык из ХРАНИЛИЩА
 * (`useWordLanguage`), а не из параметра шага, и в потоке остались бы на одном
 * языке молча. Вернутся, когда хук научится смотреть параметр первым.
 */
import React from 'react';
import { WarmupCard } from '@/src/components/WarmupCard';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { языковыеТемы } from '@/src/services/languageFlow';

export const АКЦЕНТ_ЯЗЫКИ = '#0891b2';

export function LanguagesWarmup() {
  /** Уровни — из СОБСТВЕННЫХ лестниц: человек продолжает с того места, где стоит. */
  const карточки = usePersistentLevel('vocab_srs');
  const пропуск = usePersistentLevel('cloze');
  const категории = usePersistentLevel('semantic_sort');
  const решение = usePersistentLevel('lexical_decision');

  const уровни = {
    vocab_srs: карточки.level,
    cloze: пропуск.level,
    semantic_sort: категории.level,
    lexical_decision: решение.level,
  };

  return (
    <WarmupCard
      темы={языковыеТемы(уровни)}
      titleKey="languagesWarmupTitle"
      descKey="languagesWarmupDesc"
      ярлык="языки"
      accent={АКЦЕНТ_ЯЗЫКИ}
      loading={!карточки.loaded || !пропуск.loaded || !категории.loaded || !решение.loaded}
    />
  );
}
