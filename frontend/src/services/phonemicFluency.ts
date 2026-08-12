export const RU_PHONEMIC_LETTERS = ['К','Л','М','П','С','Т','Б','В','Г','Д','Н','Р'] as const;
export const EN_PHONEMIC_LETTERS = ['F','A','S','B','C','D','M','P','R','T','L','N'] as const;

export function phonemicLetterPool(language: string): readonly string[] {
  return language === 'en' ? EN_PHONEMIC_LETTERS : RU_PHONEMIC_LETTERS;
}
