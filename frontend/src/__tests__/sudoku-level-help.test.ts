import { translateFor } from '@/src/contexts/LanguageContext';
import { levelConfig } from '@/src/services/sudoku-core';
import {
  beltKey,
  buildLevelHelp,
  techniqueHowKey,
  variantScanKey,
  type LevelHelpInput,
} from '@/src/services/sudoku-level-help';

/**
 * Гейты справки уровня.
 *
 * Смысл файла один: справка обязана ОПИСЫВАТЬ ТЕКУЩИЙ УРОВЕНЬ, а не игру вообще.
 * Поэтому пробы здесь сравнивают справку разных уровней между собой, а не сверяют
 * её с константой — константа проверяла бы мой же текст моим же текстом.
 */

const tr = (key: string) => translateFor('ru', key);

function help(over: Partial<LevelHelpInput> = {}) {
  const base: LevelHelpInput = {
    mode: 'levels', level: 1, N: 9, variant: 'none',
    tier: 1, hintMax: 3, errorMax: 3,
  };
  return buildLevelHelp({ ...base, ...over }, tr, 'ru');
}

/** Уровень → его настоящий вариант и размер, как их видит экран. */
function cfgOf(L: number) {
  const c = levelConfig(L) as unknown as { N: number; variant: LevelHelpInput['variant'] };
  return { N: c.N, variant: c.variant ?? 'none' };
}

test('🔴 справка называет НОМЕР уровня на всех 92 уровнях', () => {
  const без: number[] = [];
  for (let L = 1; L <= 92; L++) {
    const { N, variant } = cfgOf(L);
    const h = help({ level: L, N, variant });
    if (!h.title.includes(String(L))) без.push(L);
  }
  expect(`уровней без номера в заголовке: ${без.length}`).toBe('уровней без номера в заголовке: 0');
});

test('🔴 справка называет ПРИЁМ, а не только правило', () => {
  const label = tr('sudokuHowLabel');
  const без: number[] = [];
  for (let L = 1; L <= 92; L++) {
    const { N, variant } = cfgOf(L);
    // tier===null — доска выше лестницы градатора: раздел всё равно обязан быть
    for (const tier of [1, 3, 6, null] as (number | null)[]) {
      const h = help({ level: L, N, variant, tier });
      if (!h.body.includes(label)) без.push(L);
    }
  }
  expect(`случаев без раздела о приёме: ${без.length}`).toBe('случаев без раздела о приёме: 0');
});

test('🔴 справка РАЗНАЯ на разных уровнях, а не одна на всю игру', () => {
  const тела = new Set<string>();
  for (let L = 1; L <= 92; L++) {
    const { N, variant } = cfgOf(L);
    тела.add(help({ level: L, N, variant, tier: 2 }).body);
  }
  // 18 вариантов + классика; при одинаковом tier тела различаются правилом и
  // разделом «как смотреть». Если справка снова станет общей, размер упадёт до 1.
  expect(тела.size).toBeGreaterThan(8);
});

test('🔴 на ОДНОМ уровне справка следует за приёмом выданной доски', () => {
  const { N, variant } = cfgOf(54);
  const лёгкая = help({ level: 54, N, variant, tier: 1 }).body;
  const трудная = help({ level: 54, N, variant, tier: 6 }).body;
  expect(лёгкая).not.toBe(трудная);
});

test('🔴 каждый ключ справки есть в словаре — иначе игрок увидит имя ключа', () => {
  const ключи = [
    'sudokuHowLabel', 'sudokuHowUnmeasured', 'sudokuScanLabel',
    'sudokuLevelHasLabel', 'sudokuLevelHas', 'label_level_short', 'btn_rules',
    'sudokuBaseRule', 'sudokuKillerRule',
    ...[1, 2, 3, 4, 5, 6].map(techniqueHowKey),
    ...[58, 66, 80, 81].map((L) => beltKey(L) as string),
    ...(['jigsaw', 'diagonal', 'hyper', 'antiknight', 'antiking', 'nonconsec', 'evenodd',
      'kropki', 'thermo', 'thermocage', 'thermoknight', 'sandwich', 'sandparity', 'arrow',
      'killerdiag', 'towers', 'unequal'] as const).map((v) => variantScanKey(v) as string),
  ];
  const пропали = ключи.filter((k) => {
    const ru = translateFor('ru', k);
    const en = translateFor('en', k);
    return !ru || ru === k || !en || en === k;
  });
  expect(`ключей без перевода: ${пропали.join(', ') || 'нет'}`).toBe('ключей без перевода: нет');
});

test('🔴 подсказки и ошибки уровня попадают в справку числами', () => {
  const h = help({ hintMax: 1, errorMax: 3 });
  expect(h.body).toContain('1');
  const h2 = help({ hintMax: 5, errorMax: 3 });
  expect(h2.body).not.toBe(h.body);
});

test('режимы со ступенями называют ступень и её предел', () => {
  expect(help({ mode: 'killer', level: 3, steps: 6 }).title).toContain('3/6');
  expect(help({ mode: 'towers', level: 2, variant: 'towers', steps: 8 }).title).toContain('2/8');
});

test('вариант без сформулированного приёма не выдумывает раздел', () => {
  expect(variantScanKey('none')).toBeNull();
  const h = help({ variant: 'none', level: 7 });
  expect(h.body).not.toContain(tr('sudokuScanLabel'));
});

test('🔴 безлимит по ошибкам печатается словом, а не «Infinity»', () => {
  const h = help({ errorMax: Infinity });
  expect(h.body).not.toContain('Infinity');
  expect(h.body).toContain(tr('sudokuLevelHasNoLimit'));
});
