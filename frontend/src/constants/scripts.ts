// Письменности для скрипт-режимов (профиль «Полиглот», v1.27.0): Корректура + Шульте.
// chars — канонический порядок алфавита (Шульте «найди по порядку» = заучивание алфавита);
// hanzi — частотные иероглифы HSK1, первые 10 = числа 一…十 (естественный порядок).
// Все символы BMP → индексирование строки по UTF-16 безопасно.

export type ScriptId = 'latin' | 'cyrillic' | 'greek' | 'devanagari' | 'hiragana' | 'hanzi';

export interface ScriptDef {
  labelKey: string; // ключ перевода названия письменности
  chars: string;    // упорядоченный набор символов
}

export const SCRIPTS: Record<ScriptId, ScriptDef> = {
  latin:      { labelKey: 'scriptLatin',      chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },                                  // 26 → Шульте до 5×5
  cyrillic:   { labelKey: 'scriptCyrillic',   chars: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ' },                                // 29 → 5×5
  greek:      { labelKey: 'scriptGreek',      chars: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ' },                                    // 24 → 4×4
  devanagari: { labelKey: 'scriptDevanagari', chars: 'अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह' },                  // 44 → 6×6
  hiragana:   { labelKey: 'scriptHiragana',   chars: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' }, // 46 → 6×6
  hanzi:      { labelKey: 'scriptHanzi',      chars: '一二三四五六七八九十人口手日月山水火木金土大小上下中天年学生好爱国家车马鱼鸟花雨电风云石田白红黑' }, // 46 → 6×6
};

export const SCRIPT_IDS = Object.keys(SCRIPTS) as ScriptId[];
