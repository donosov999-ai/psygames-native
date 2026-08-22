import {
  EN_PHONEMIC_LETTERS,
  RU_PHONEMIC_LETTERS,
  phonemicLetterPool,
} from '@/src/services/phonemicFluency';

describe('phonemicLetterPool — алфавит готовой языковой сессии', () => {
  it('русский профиль никогда не получает латинскую букву', () => {
    expect(phonemicLetterPool('ru')).toBe(RU_PHONEMIC_LETTERS);
    expect(phonemicLetterPool('ru').every((letter) => /^[А-ЯЁ]$/.test(letter))).toBe(true);
  });

  it('английский профиль получает только латинские буквы', () => {
    expect(phonemicLetterPool('en')).toBe(EN_PHONEMIC_LETTERS);
    expect(phonemicLetterPool('en').every((letter) => /^[A-Z]$/.test(letter))).toBe(true);
  });

  /**
   * 🔴 ЭТА ПРОВЕРКА ЗАКРЕПЛЯЛА САМУ ПОЛОМКУ. Она требовала, чтобы «прочие локали
   * получали кириллицу», и была зелёной ровно потому, что игра была сломана: на
   * немецком буква выходила кириллической, а проверка слова — латинской, и
   * принять слово было НЕЛЬЗЯ НИ ОДНО. Счёт оставался нулём, причина ниоткуда не
   * следовала. Правило переписано 22.08.2026 вместе с починкой.
   */
  it('🔴 языки на латинице получают латиницу, а не кириллицу', () => {
    for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
      expect(`${lang}: ${phonemicLetterPool(lang) === EN_PHONEMIC_LETTERS ? 'латиница' : 'кириллица'}`)
        .toBe(`${lang}: латиница`);
    }
  });

  it('русский остаётся кириллическим', () => {
    expect(phonemicLetterPool('ru')).toBe(RU_PHONEMIC_LETTERS);
  });
});
