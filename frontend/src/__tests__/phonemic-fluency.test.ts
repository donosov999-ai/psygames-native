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

  it('прочие локали используют кириллический набор как прежний fallback', () => {
    expect(phonemicLetterPool('de')).toBe(RU_PHONEMIC_LETTERS);
  });
});
