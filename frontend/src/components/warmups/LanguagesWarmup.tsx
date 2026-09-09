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
 * ★ 09.09.2026 АНАГРАММЫ ВОШЛИ В СОСТАВ. `useWordLanguage` научился смотреть
 * `targetLang` шага прежде хранилища, и у анаграмм есть слова на ДЕСЯТИ языках
 * (ru en de es fr it ko pt ar ja) — ряд потока им подходит целиком.
 *
 * ⚠️ БЕГЛОСТИ РЕЧИ В СОСТАВЕ НЕТ, И ЭТО ЗАМЕР, А НЕ ЗАБЫВЧИВОСТЬ. У неё слова
 * только на ДВУХ языках — `ru` и `en` (`wordLangsFor('phonemic_fluency')`), и
 * один из них у русскоговорящего занят якорем. Чередовать ей нечем: любой шаг
 * ряда, кроме английского, свалился бы к запасному пути и молча дал тот же
 * язык. Войдёт, когда у неё появятся буквенные наборы ещё хотя бы на одном.
 */
import React from 'react';
import { WarmupCard } from '@/src/components/WarmupCard';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { языковыеТемы, языкиДляИнтерфейса } from '@/src/services/languageFlow';
import { WORD_LANG_LABEL } from '@/src/services/wordLanguage';
import { useLanguage } from '@/src/contexts/LanguageContext';

export const АКЦЕНТ_ЯЗЫКИ = '#0891b2';

export function LanguagesWarmup() {
  // Языки потока зависят от интерфейса: свой язык целью не бывает (см. languageFlow).
  const { language } = useLanguage();
  /** Уровни — из СОБСТВЕННЫХ лестниц: человек продолжает с того места, где стоит. */
  const карточки = usePersistentLevel('vocab_srs');
  const пропуск = usePersistentLevel('cloze');
  const категории = usePersistentLevel('semantic_sort');
  const решение = usePersistentLevel('lexical_decision');
  const анаграммы = usePersistentLevel('anagrams');
  const пары = usePersistentLevel('word_pairs');
  const наСлух = usePersistentLevel('listening_span');

  const уровни = {
    vocab_srs: карточки.level,
    cloze: пропуск.level,
    semantic_sort: категории.level,
    lexical_decision: решение.level,
    anagrams: анаграммы.level,
    word_pairs: пары.level,
    listening_span: наСлух.level,
  };

  /**
   * 🔴 ПАРА ЯЗЫКОВ ПОКАЗЫВАЕТСЯ, А НЕ ОБЕЩАЕТСЯ ТЕКСТОМ. До 09.09.2026 подпись
   * говорила «английский и испанский» во всех локалях, и на английском это была
   * ложь: свой язык целью не бывает, англоговорящий получает испанский и
   * запасной. Здесь берётся ТА ЖЕ функция, что собирает шаги, — разойтись
   * подписи и партии больше нечем.
   */
  const [первый, второй] = языкиДляИнтерфейса(language);
  const пара = `${WORD_LANG_LABEL[первый] ?? первый} · ${WORD_LANG_LABEL[второй] ?? второй}`;

  return (
    <WarmupCard
      подЗаголовком={пара}
      темы={языковыеТемы(уровни, language)}
      titleKey="languagesWarmupTitle"
      descKey="languagesWarmupDesc"
      ярлык="языки"
      accent={АКЦЕНТ_ЯЗЫКИ}
      loading={!карточки.loaded || !пропуск.loaded || !категории.loaded || !решение.loaded
        || !анаграммы.loaded || !пары.loaded || !наСлух.loaded}
    />
  );
}
