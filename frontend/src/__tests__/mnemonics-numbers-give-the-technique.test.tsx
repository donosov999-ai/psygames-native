/* psygames-mnemonics-numbers-give-the-technique · VER 1 · 23.09.2026 */
/**
 * «МНЕМОНИКА», РЕЖИМ ЦИФР: ИГРА ОБЯЗАНА ДАВАТЬ ПРИЁМ, А НЕ ТОЛЬКО ЗАДАНИЕ.
 *
 * 📍 ОТКУДА. Отчёт NZT-48 (app_feedback bf1f53cc, 13.09.2026, версия 2.54.9):
 * «надо проработать алфавит магический до 100, ввести словарь с подсказками и
 * отдельный режим для запоминания цифр». Замер по origin/main 16.09: режим цифр
 * выдавал восемь случайных двузначных чисел и НИ ОДНОГО способа их удержать —
 * единственной подсказкой было «сверху вниз». Игра звалась «Мнемоника» и
 * мнемотехнике не учила.
 *
 * ⚠️ ПОЧЕМУ ПРОБА НАЖИМАЕТ, А НЕ ЧИТАЕТ ИСХОДНИК. Наличие строки с `pegFor` в
 * файле ничего не доказывает: её может отрезать любое условие выше по дереву.
 * Здесь экран монтируется целиком, переключается в режим цифр и запускается —
 * а потом в ДЕРЕВЕ ищется слово-опора рядом с числом.
 *
 * Сами сто опор и их разбор сторожит `mnemonics-pegs-cover-00-99`.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import MnemonicsGame from '@/app/games/mnemonics';
import { PEG_WORDS, pegFor } from '@/src/games/mnemonics/pegs';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee', success: '#0a0', error: '#a00' }, isDark: false }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'nzt48', allowed_games: 'all' } }) }));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ session: null, recordResult: jest.fn(), next: jest.fn(), isActive: false }),
  useWarmupSafe: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

/** ⚠️ Имя с `mock` — требование jest: фабрика мока не берёт посторонних переменных. */
let mockLang = 'ru';
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: mockLang }),
}));

const тексты = (tr: TestRenderer.ReactTestRenderer): string[] =>
  tr.root.findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children))
    .filter((x): x is string => typeof x === 'string');

const нажать = async (tr: TestRenderer.ReactTestRenderer, подпись: RegExp | string) => {
  const кнопки = tr.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props.accessibilityRole === 'button');
  const цель = кнопки.find((b) => {
    const свои = b.findAllByType(Text).map((x) => String(x.props.children ?? ''));
    return свои.some((s) => (typeof подпись === 'string' ? s === подпись : подпись.test(s)));
  });
  if (!цель) throw new Error(`нет кнопки ${подпись}: ${кнопки.length} кнопок на экране`);
  await act(async () => { цель.props.onPress(); });
};

const врежимЦифр = async () => {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<MnemonicsGame />); });
  await нажать(tr, 'catVocab_numbers');
  return tr;
};

describe('«Мнемоника», режим цифр — приём на экране', () => {
  beforeEach(() => { mockLang = 'ru'; });

  it('🔴 под числом стоит его слово-опора из таблицы', async () => {
    const tr = await врежимЦифр();
    await нажать(tr, /^(start|startGame|play)$/i).catch(async () => { await нажать(tr, /start/i); });
    const все = тексты(tr);
    const числа = все.filter((s) => /^\d{2}$/.test(s)).map(Number);
    expect(числа.length).toBeGreaterThan(0);
    const без = числа.filter((n) => !все.includes(pegFor(n, 'ru') ?? '\u0000'));
    expect(без).toEqual([]);
  });

  it('🔴 экран настройки учит самому коду: все десять цифр с буквами', async () => {
    const tr = await врежимЦифр();
    const все = тексты(tr).join(' | ');
    expect(все).toContain('Код: цифра → согласные');
    ['с з ц', 'т д', 'н', 'м', 'р', 'л', 'ш ж ч щ', 'к г х', 'в ф', 'п б']
      .forEach((буквы) => expect(все).toContain(буквы));
  });

  it('опору можно убрать — и тогда под числом её нет', async () => {
    const tr = await врежимЦифр();
    const переключатель = tr.root.findAll((n) => n.props?.testID === 'mnemonics-peg-aid')[0];
    await act(async () => { переключатель.props.onPress(); });
    await нажать(tr, /start/i);
    const все = тексты(tr);
    const числа = все.filter((s) => /^\d{2}$/.test(s)).map(Number);
    const видимые = числа.filter((n) => все.includes(pegFor(n, 'ru') ?? '\u0000'));
    expect(видимые).toEqual([]);
  });

  it('🔴 язык без таблицы не получает ни опор, ни переключателя — вместо бессмыслицы', async () => {
    mockLang = 'de';
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<MnemonicsGame />); });
    await нажать(tr, 'catVocab_numbers');
    expect(tr.root.findAll((n) => n.props?.testID === 'mnemonics-peg-aid')).toEqual([]);
    const все = тексты(tr).join(' | ');
    PEG_WORDS.ru.slice(0, 20).forEach((w) => expect(все).not.toContain(` ${w} `));
  });

  it('🔴 третий режим есть и он про саму таблицу', async () => {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<MnemonicsGame />); });
    // ⚠️ `findAll` отдаёт и хост-узел, и обёртки с тем же testID — считаем по имени, не по числу узлов.
    const кнопка = tr.root.findAll((n) => n.props?.testID === 'mnemonics-mode-pegs');
    expect(кнопка.length).toBeGreaterThan(0);
    await act(async () => { кнопка[0].props.onPress(); });
    await нажать(tr, /start/i);

    // Вопрос на экране: загадка и ровно четыре варианта в ряду каркаса.
    const варианты = [...new Set(tr.root
      .findAll((n) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('peg-option-'))
      .map((v) => String(v.props.testID)))];
    expect(варианты).toHaveLength(4);
    const все = тексты(tr);
    const загадка = все.find((s) => /^\d{2}$/.test(s)) ?? '';
    expect(загадка).not.toBe('');
    const верное = pegFor(Number(загадка), 'ru');
    expect(варианты.map((id) => id.replace('peg-option-', ''))).toContain(верное);
  });

  it('🔴 промах показывает верную опору и её разбор, а не просто «мимо»', async () => {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<MnemonicsGame />); });
    await act(async () => { tr.root.findAll((n) => n.props?.testID === 'mnemonics-mode-pegs')[0].props.onPress(); });
    await нажать(tr, /start/i);
    const все = тексты(tr);
    const загадка = Number(все.find((s) => /^\d{2}$/.test(s)));
    const верное = pegFor(загадка, 'ru');
    const мимо = tr.root
      .findAll((n) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('peg-option-'))
      .find((v) => String(v.props.testID) !== `peg-option-${верное}`);
    await act(async () => { мимо!.props.onPress(); });
    const после = тексты(tr).join(' | ');
    expect(после).toContain(верное);
    expect(после).toMatch(/=\d \+ .?=\d/);
  });

  it('режим слов опору не показывает: там приём другой', async () => {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<MnemonicsGame />); });
    expect(tr.root.findAll((n) => n.props?.testID === 'mnemonics-peg-aid')).toEqual([]);
  });
});
