/**
 * СТЫКОВКА «ЛИЦ И ИМЁН» С ПРИЛОЖЕНИЕМ — ПРОВЕРЯЕТСЯ ПОВЕДЕНИЕМ, А НЕ ТЕКСТОМ.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Модуль G4 пришёл из лаборатории самодостаточным: своё
 * ядро, свой словарь и СВОЙ экран итога. Ровно на этом уже обжигались: игра
 * показывает собственное поздравление, приложение об этом не знает, и звёзды по
 * уровням, серия чистых прохождений и глаз-разрядка молча не пишутся. Общий
 * гейт `game-standard` ловит это только у игр, ЗАРЕГИСТРИРОВАННЫХ в каталоге, а
 * запись в каталог вносится одним заходом вместе с семью соседними играми —
 * значит до тех пор экран для него невидим. Здесь то же требование, адресно.
 *
 * ⚠️ ПОЧЕМУ НАСТОЯЩИЙ РЕНДЕР, А НЕ ПОИСК ПО ИСХОДНИКУ. В SET бейдж отсчёта был
 * написан, переведён на двенадцать языков, покрыт гейтом — и не показывался ни
 * разу: гейт стерёг РАЗМЕТКУ, а элемент был мёртв. Поэтому партия ниже
 * ИГРАЕТСЯ: нажимаются настоящие кнопки живого дерева, и утверждения касаются
 * того, что реально нарисовано и реально вызвано.
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРЯЕТСЯ СМЫСЛ, А НЕ ИМЕНА. Ни одно имя функции, стиля или
 * компонента здесь не зашито: гейт на дословный вызов краснеет на ПРАВИЛЬНОЙ
 * правке (переименовал — упал), и такие гейты перестают читать. Проверяются
 * наблюдаемые свойства: что нарисовано, что вызвано, каким цветом, какого
 * размера и на каком языке.
 */
import React from 'react';
import {
  FACES_NAMES_LOCALES,
  FACT_LIBRARY,
  LEVELS,
  SYNTHETIC_PERSON_LIBRARY,
  generateFacesNamesPuzzle,
  getFacesNamesStrings,
  getFactText,
  interpolateFacesNames,
  isPassed,
  nameScript,
  personById,
  type FacesNamesLocale,
  type FacesNamesMetrics,
} from '@/src/games/faces-names/core';
import FacesNamesGame from '@/src/games/faces-names/FacesNamesGame';
import { onGradientText, contrastRatio, AA_NORMAL } from '@/src/services/onGradientText';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const TestRenderer = require('react-test-renderer');

const SCREEN = join(__dirname, '../../app/games/faces-names.tsx');
const MODULE = join(__dirname, '../games/faces-names/FacesNamesGame.tsx');
const rawScreen: string = readFileSync(SCREEN, 'utf8');
/** Комментарии режем: гейт не должен ловить собственные объяснения в шапке экрана. */
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const screen: string = strip(rawScreen);
const moduleCode: string = strip(readFileSync(MODULE, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// ЖИВОЕ ДЕРЕВО
// ─────────────────────────────────────────────────────────────────────────────

/** Все подписи-строки отрисованного дерева. */
function renderedText(node: any, acc: string[] = []): string[] {
  if (node == null || node === false) return acc;
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((n) => renderedText(n, acc)); return acc; }
  if (node.children) renderedText(node.children, acc);
  return acc;
}

/** Узлы дерева с a11y-подписью — то есть всё, что человек может нажать или услышать. */
function labelled(node: any, acc: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { node.forEach((n) => labelled(n, acc)); return acc; }
  if (node.props?.accessibilityLabel) acc.push(node);
  if (node.children) labelled(node.children, acc);
  return acc;
}

/** Стиль Pressable — функция от состояния нажатия; разворачиваем в обычный объект. */
function flatStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (typeof style === 'function') return flatStyle(style({ pressed: false }));
  if (Array.isArray(style)) return style.reduce((a: any, s: any) => ({ ...a, ...flatStyle(s) }), {});
  if (typeof style !== 'object') return {};
  return style;
}

const GRADIENT: [string, string] = ['#7c3f58', '#256f68'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/** Тёмная тема — самая опасная: на ней и вылезал «тёмный текст по тёмной кнопке». */
const THEME = {
  background: '#000000', surface: '#1C1C1E', card: '#2C2C2E',
  text: '#FFFFFF', textSecondary: '#8E8E93',
  primary: GRADIENT[0], onPrimary: ON_GRAD.color,
  border: '#38383A', success: '#30D158', error: '#FF453A', warning: '#FF9F0A',
};

interface PlayOptions {
  seed: string;
  level: number;
  locale?: FacesNamesLocale;
  /** Сколько первых проб ответить НЕВЕРНО по лицу (остальное — верно). */
  wrongFaces?: number;
  /** Часы партии; по умолчанию идут по 1000 мс на шаг. */
  clock?: () => number;
  /** Крючок после каждой отрисовки: подписи, узлы дерева и живые нажимаемые элементы. */
  watch?: (seen: { text: string[]; nodes: any[]; taps: any[] }) => void;
}

/**
 * Играет партию ЧЕРЕЗ ИНТЕРФЕЙС. Ответы берутся из пазла, посчитанного ядром
 * НЕЗАВИСИМО от UI: если разметка разойдётся с ядром, нажимать станет некуда и
 * тест упадёт — это и есть проверка, что нарисовано именно то, что задумано.
 */
function playThroughUi(opts: PlayOptions) {
  const locale: FacesNamesLocale = opts.locale ?? 'ru';
  const s = getFacesNamesStrings(locale);
  const puzzle = generateFacesNamesPuzzle(opts.seed, opts.level);
  const results: FacesNamesMetrics[] = [];
  let ticks = 0;
  const clock = opts.clock ?? (() => { ticks += 1000; return ticks; });
  let tree: any;

  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(FacesNamesGame, {
      seed: opts.seed,
      level: opts.level,
      locale,
      theme: THEME,
      gameGradient: GRADIENT,
      gameGradientText: ON_GRAD.color,
      now: clock,
      onComplete: (m: FacesNamesMetrics) => { results.push(m); },
      onExit: () => {},
    }));
  });

  /**
   * Нажимаемые элементы берём из ДЕРЕВА КОМПОНЕНТОВ, а не из toJSON: у host-узла
   * onPress нет — он живёт на Pressable, и без этого «нажатие» било бы в пустоту.
   */
  const taps = () => tree.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && !!n.props?.accessibilityLabel,
    { deep: true },
  );

  const snapshot = () => {
    const json = tree.toJSON();
    return { text: renderedText(json), nodes: labelled(json), taps: taps() };
  };
  const look = () => { const seen = snapshot(); opts.watch?.(seen); return seen; };

  const press = (label: string) => {
    const node = taps().find((n: any) => n.props.accessibilityLabel === label);
    if (!node) {
      const have = taps().map((n: any) => n.props.accessibilityLabel);
      throw new Error(`нажать «${label}» некуда. На экране: ${JSON.stringify(have)}`);
    }
    TestRenderer.act(() => { node.props.onPress(); });
  };

  look();
  press(s.start);                                    // правила → изучение

  for (let i = 0; i < puzzle.studiedPersonIds.length; i += 1) {
    look();
    press(i + 1 < puzzle.studiedPersonIds.length ? s.nextPerson : s.startPause);
  }

  for (const prompt of puzzle.interferencePrompts) {
    look();
    press(String(prompt.answer));
  }

  puzzle.trials.forEach((trial, index) => {
    const target = personById(puzzle, trial.targetPersonId)!;
    look();
    // Узнавание: подпись кнопки — «номер. описание портрета».
    const wrong = index < (opts.wrongFaces ?? 0);
    const pickId = wrong
      ? trial.recognitionPersonIds.find((id) => id !== trial.targetPersonId)!
      : trial.targetPersonId;
    const pickIndex = trial.recognitionPersonIds.indexOf(pickId);
    const pickPerson = personById(puzzle, pickId)!;
    press(`${pickIndex + 1}. ${labelForFace(locale, pickPerson)}`);

    look();
    const sub = nameScript(locale, target.name);
    press(sub ? `${target.name} — ${sub}` : target.name);

    if (puzzle.factRecallEnabled) {
      look();
      press(getFactText(locale, target.factId));
    }
  });

  return { tree, results, puzzle, strings: s, snapshot };
}

/** Описание портрета собираем из словаря — так же, как его собирает модуль. */
function labelForFace(locale: FacesNamesLocale, person: any): string {
  const s = getFacesNamesStrings(locale);
  const ordinal = Number.parseInt(person.face.assetId.slice(-2), 10);
  return interpolateFacesNames(s.portrait, {
    n: ordinal,
    shape: s.shape[person.face.faceShape as keyof typeof s.shape],
    hair: s.hair[person.face.hairStyle as keyof typeof s.hair],
    glasses: person.face.glasses ? s.glassesSuffix : '',
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('партия доходит до конца и отдаёт итог приложению', () => {
  it('🔴 своего экрана поздравления НЕТ: после последней пробы модуль рисует пустоту', () => {
    const { tree, results } = playThroughUi({ seed: 'faces-names-8', level: 8 });

    // Метрики уехали ровно один раз — не ноль (партия не доиграна) и не два.
    expect(results.length).toBe(1);

    /**
     * Вот ради чего гейт. Своё поздравление = тихое выпадение из бухгалтерии:
     * звёзды по уровням, серия чистых и глаз-разрядка пишутся ТОЛЬКО в общем
     * LevelCleared. Поэтому после конца партии у модуля на экране НИЧЕГО: ни
     * «Проверка завершена», ни процентов, ни кнопки «ещё раз».
     */
    expect(tree.toJSON()).toBeNull();
  });

  it('🔴 итог рисует общий экран, и он же получает исход партии', () => {
    // Экран обязан показывать LevelCleared и решать «прошёл» составным правилом ядра.
    expect(/<LevelCleared/.test(screen)).toBe(true);
    expect(/isPassed\(/.test(screen)).toBe(true);
    // …и не заводить своего числа-порога рядом: два источника правды разъезжаются.
    expect(/const\s+PASS_[A-Z_]*\s*=/.test(screen)).toBe(false);
  });

  it('🔴 порог составной: идеальные лица не прикрывают рассыпавшиеся имена', () => {
    const perfect = playThroughUi({ seed: 'faces-names-9', level: 9 }).results[0];
    expect(isPassed(perfect)).toBe(true);

    // Подменяем ТОЛЬКО имена: лица и факты идеальны, имена на нуле.
    const namesGone: FacesNamesMetrics = {
      ...perfect,
      accuracy: 0.67,
      specific: { ...perfect.specific, nameRecallCorrect: 0, nameRecallAccuracy: 0 },
    };
    expect(isPassed(namesGone)).toBe(false);
  });

  /**
   * 🔴 ПОЙМАНО ГЛАЗАМИ НА ЖИВОЙ СБОРКЕ 19.08.2026, гейтами — ни одним.
   * Прошёл первый уровень, плашка сказала «Level 2 done!», и звезда легла в
   * хранилище под ключ «2»: `lvl.reach(level + 1)` поднимает уровень хука,
   * экран перерисовывается, а `level` считается ОТ хука — к моменту отрисовки
   * плашки он уже следующий. Человек видит награду за уровень, которого не
   * проходил, а за пройденный не видит. Проверяем смысл: в плашку обязана
   * уезжать ДРУГАЯ переменная, снятая ДО повышения.
   */
  it('🔴 плашка итога называет СЫГРАННЫЙ уровень, а не следующий', () => {
    const shown = /<LevelCleared[\s\S]*?\blevel=\{(\w+)\}/.exec(screen)![1];
    const advanced = /lvl\.reach\((\w+)\s*\+\s*1\)/.exec(screen)![1];
    expect(`в плашку уезжает «${shown}», повышаем от «${advanced}»`)
      .not.toBe(`в плашку уезжает «${advanced}», повышаем от «${advanced}»`);

    // …и снимок делается ДО повышения. Имя сеттера выводим из самой переменной,
    // а не зашиваем: гейт на дословное имя краснеет на переименовании.
    const setter = new RegExp(`const \\[${shown}, (set\\w+)\\]`).exec(screen)![1];
    const snapshotAt = screen.indexOf(`${setter}(`);
    const advanceAt = screen.indexOf('lvl.reach(');
    // −1 значило бы «снимка нет вовсе», и сравнение «меньше» прошло бы вслепую:
    // ровно так эта проверка промолчала на мутации «убрать строку целиком».
    expect(`снимок на позиции ${snapshotAt >= 0}, раньше повышения ${snapshotAt < advanceAt}`)
      .toBe('снимок на позиции true, раньше повышения true');
  });

  it('уровень уезжает в сессию — иначе прогресс не переживёт сброс профиля', () => {
    const m = playThroughUi({ seed: 'faces-names-12', level: 12 }).results[0];
    expect(m.details.level).toBe(12);
    expect(/details:\s*\{[\s\S]*?\blevel\b/.test(screen)).toBe(true);
  });
});

describe('строка «что делать» рисуется в каждой фазе, а не лежит мёртвой', () => {
  it('🔴 у каждой фазы партии на экране есть свой вопрос', () => {
    const s = getFacesNamesStrings('ru');
    const seenText: string[] = [];
    playThroughUi({
      seed: 'faces-names-8', level: 8,
      watch: ({ text }) => { seenText.push(...text); },
    });
    const all = seenText.join('\n');
    for (const line of [s.interferenceBody, s.recognitionPrompt, s.namePrompt, s.factPrompt]) {
      expect(`нарисовано «${line}»: ${all.includes(line)}`).toBe(`нарисовано «${line}»: true`);
    }
  });

  it('🔴 подпись поля переведена, а не «Level N» латиницей', () => {
    const seenText: string[] = [];
    playThroughUi({
      seed: 'faces-names-6', level: 6, locale: 'ru',
      watch: ({ text }) => { seenText.push(...text); },
    });
    const all = seenText.join('\n');
    expect(all).toContain('Уровень 6');
    // Английская подпись поля в русском интерфейсе — то, что было в лаборатории.
    expect(/\bLevel 6\b/.test(all)).toBe(false);
  });
});

describe('имя читается на любом языке и подсказкой не служит', () => {
  const SCRIPT_LOCALES: FacesNamesLocale[] = ['ru', 'zh', 'ja', 'ko', 'ar', 'hi'];

  it('🔴 в нелатинской локали вторая строка имени ДЕЙСТВИТЕЛЬНО показана', () => {
    const seen: string[] = [];
    const { puzzle } = playThroughUi({
      seed: 'faces-names-5', level: 5, locale: 'ru',
      watch: ({ text }) => { seen.push(...text); },
    });
    const all = seen.join('\n');
    for (const id of puzzle.studiedPersonIds) {
      const person = personById(puzzle, id)!;
      const sub = nameScript('ru', person.name)!;
      expect(`${person.name} → ${sub}: ${all.includes(sub)}`).toBe(`${person.name} → ${sub}: true`);
    }
  });

  it('🔴 вторая строка стоит у ВСЕХ вариантов, иначе она была бы подсказкой', () => {
    const puzzle = generateFacesNamesPuzzle('faces-names-11', 11);
    let checked = 0;
    playThroughUi({
      seed: 'faces-names-11', level: 11, locale: 'ru',
      watch: ({ taps }) => {
        // Фазу «выбор имени» узнаём по тому, что подписи кнопок — это имена людей.
        const names = taps
          .map((n: any) => String(n.props.accessibilityLabel))
          .filter((l: string) => SYNTHETIC_PERSON_LIBRARY.some((p) => l.startsWith(`${p.name} — `)
            || l === p.name));
        if (names.length < 2) return;
        checked += 1;
        // Ни один вариант не остался без второй строки — иначе выделялся бы.
        expect(names.filter((l: string) => !l.includes(' — '))).toEqual([]);
      },
    });
    expect(checked).toBeGreaterThan(0);
    expect(puzzle.trials.length).toBeGreaterThan(0);
  });

  it('внутри одного языка записи имён попарно различны', () => {
    const clashes: string[] = [];
    for (const locale of SCRIPT_LOCALES) {
      const seen = new Map<string, string>();
      for (const person of SYNTHETIC_PERSON_LIBRARY) {
        const sub = nameScript(locale, person.name);
        expect(`${locale}/${person.name}: ${sub !== null}`).toBe(`${locale}/${person.name}: true`);
        const already = seen.get(sub as string);
        if (already) clashes.push(`${locale}: ${already} и ${person.name} пишутся одинаково «${sub}»`);
        seen.set(sub as string, person.name);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('латинским языкам вторая строка не навязывается — она повторяла бы первую', () => {
    for (const locale of ['en', 'es', 'de', 'pt', 'fr', 'it'] as FacesNamesLocale[]) {
      expect(nameScript(locale, 'Amina')).toBeNull();
    }
  });

  /**
   * КАНОН ОДИН НА ВСЕ ЯЗЫКИ — и это не забывчивость, а условие сравнимости.
   * Ложные варианты подбираются по расстоянию между КАНОНИЧЕСКИМИ строками, и
   * средняя похожесть имён уезжает в сохранённую партию. Свой набор имён на
   * каждый язык дал бы другую сложность по тому же seed.
   */
  it('пазл по одному seed одинаков на всех двенадцати языках', () => {
    const base = JSON.stringify(generateFacesNamesPuzzle('faces-names-20', 20));
    for (const locale of FACES_NAMES_LOCALES) {
      expect(`${locale}: ${JSON.stringify(generateFacesNamesPuzzle('faces-names-20', 20)) === base}`)
        .toBe(`${locale}: true`);
    }
  });
});

describe('словарь модуля знает все двенадцать языков', () => {
  const KEYS = Object.keys(getFacesNamesStrings('en')).filter((k) => !['shape', 'hair'].includes(k));

  it('языки модуля и языки приложения — один список', () => {
    const app = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8') as string;
    const decl = /type Language =([^;]+);/.exec(app)![1];
    const appLocales = [...decl.matchAll(/'([a-z]{2})'/g)].map((m) => m[1]).sort();
    expect([...FACES_NAMES_LOCALES].sort()).toEqual(appLocales);
  });

  /**
   * Совпадение с английским — НЕ всегда недоделка: часть слов у языков и правда
   * общая. Поимённо и с причиной: проверка, которая краснеет на верном переводе,
   * врёт, а гейт, который врёт, перестают читать. Список закрыт — новые записи
   * означают, что перевод не доделали.
   */
  const SAME_AS_EN: Record<string, string> = {
    'de.rememberName': 'по-немецки это и есть «Name»; «Vorname» сузило бы смысл до имени собственного',
    'de.pause': 'слово «Pause» немецкое, английский его заимствовал',
    'fr.pause': 'французское «Pause» пишется так же',
  };

  it('исключения «слово и правда общее» существуют и объяснены', () => {
    for (const [key, why] of Object.entries(SAME_AS_EN)) {
      const [locale, name] = key.split('.');
      const s = getFacesNamesStrings(locale as FacesNamesLocale) as any;
      const en = getFacesNamesStrings('en') as any;
      // Исключение перестало быть нужным — его убирают, а не оставляют висеть.
      expect(`${key}: ${s[name] === en[name]}`).toBe(`${key}: true`);
      expect(why.length).toBeGreaterThan(25);
    }
  });

  it('🔴 ни одна строка не пустая и не осталась английской заглушкой', () => {
    const stub: string[] = [];
    const en = getFacesNamesStrings('en') as any;
    for (const locale of FACES_NAMES_LOCALES) {
      if (locale === 'en') continue;
      const s = getFacesNamesStrings(locale) as any;
      for (const key of KEYS) {
        if (!s[key] || String(s[key]).trim().length === 0) stub.push(`${locale}.${key}: пусто`);
        // Совпадение с английским допустимо только там, где переводить нечего.
        else if (s[key] === en[key] && !SAME_AS_EN[`${locale}.${key}`]) {
          stub.push(`${locale}.${key}: осталось английским`);
        }
      }
    }
    expect(stub).toEqual([]);
  });

  /**
   * У локалей со своей письменностью перевод обязан быть написан СВОИМИ знаками.
   * Строка латиницей в корейском словаре — это недоделанный перевод, который
   * сличением словарей не отличить от сделанного.
   */
  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      const s = getFacesNamesStrings(locale as FacesNamesLocale) as any;
      for (const key of KEYS) {
        // Шаблоны из одних подстановок («{shape}, {hair}») своих букв не содержат.
        const bare = String(s[key]).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(s[key]))) bad.push(`${locale}.${key}: «${s[key]}»`);
      }
      for (const face of ['oval', 'round', 'long', 'angular']) {
        if (!re.test(s.shape[face])) bad.push(`${locale}.shape.${face}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 факты — материал упражнения — переведены на все двенадцать', () => {
    const holes: string[] = [];
    for (const fact of FACT_LIBRARY) {
      for (const locale of FACES_NAMES_LOCALES) {
        const text = getFactText(locale, fact.id);
        if (!text || text === fact.id) holes.push(`${fact.id}/${locale}: нет текста`);
        else if (locale !== 'en' && text === fact.text.en) holes.push(`${fact.id}/${locale}: осталось английским`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('у каждого человека библиотеки свой факт — иначе два ответа были бы верны', () => {
    const factIds = SYNTHETIC_PERSON_LIBRARY.map((p) => p.factId);
    expect(new Set(factIds).size).toBe(factIds.length);
    expect(new Set(SYNTHETIC_PERSON_LIBRARY.map((p) => p.name)).size).toBe(SYNTHETIC_PERSON_LIBRARY.length);
  });
});

describe('часы партии — игровые, а не настенные', () => {
  it('🔴 время берётся ТОЛЬКО из пропса: остановились часы — стоит и партия', () => {
    const frozen = playThroughUi({ seed: 'faces-names-3', level: 3, clock: () => 5_000 });
    expect(frozen.results[0].durationMs).toBe(0);

    let t = 0;
    const running = playThroughUi({ seed: 'faces-names-3', level: 3, clock: () => (t += 1000) });
    expect(running.results[0].durationMs).toBeGreaterThan(0);
  });

  it('🔴 экран отдаёт модулю общие часы, а не Date.now', () => {
    expect(/now=\{gameNow\}/.test(screen)).toBe(true);
    expect(screen.includes("from '@/src/services/gamePause'")).toBe(true);
    expect(/Date\.now\(\)/.test(screen)).toBe(false);
    // И в самом модуле настенных часов не осталось ни по умолчанию, ни внутри.
    expect(/Date\.now/.test(moduleCode)).toBe(false);
  });
});

describe('цвет и размер — как в приложении, а не как в лаборатории', () => {
  it('🔴 primary — ЦВЕТ ИГРЫ, а не акцент профиля', () => {
    const value = /primary:\s*([^,\n]+)/.exec(screen)![1].trim();
    // `colors.primary` внутри партии дал бы оранжевую кнопку у одного профиля и
    // синюю у другого при том же градиенте снаружи: один экран, две схемы.
    expect(`primary = ${value}`).toBe('primary = GRADIENT[0]');
  });

  it('🔴 текст на цветной кнопке читается и в тёмной теме', () => {
    // Живое дерево: берём подпись кнопки «Начать» и её реальный цвет.
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(FacesNamesGame, {
        seed: 'faces-names-1', level: 1, locale: 'ru' as FacesNamesLocale,
        theme: THEME, gameGradient: GRADIENT, gameGradientText: ON_GRAD.color,
        now: () => 0,
      }));
    });
    const start = labelled(tree.toJSON())
      .find((n: any) => n.props.accessibilityLabel === getFacesNamesStrings('ru').start);
    const label = renderedTextNode(start);
    const color = flatStyle(label.props.style).color as string;
    expect(contrastRatio(color, THEME.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    // …и это не «просто белый»: цвет посчитан по обоим концам градиента игры.
    expect(color).toBe(ON_GRAD.color);
  });

  it('🔴 текст поверх плашки игры держит AA на ОБОИХ концах градиента', () => {
    expect(contrastRatio(ON_GRAD.color, ON_GRAD.veil ?? GRADIENT[0])).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(ON_GRAD.color, ON_GRAD.veil ?? GRADIENT[1])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('🔴 в каждую кнопку партии можно попасть пальцем: ≥48 pt', () => {
    const small: string[] = [];
    playThroughUi({
      seed: 'faces-names-17', level: 17, locale: 'ru',
      watch: ({ taps }) => {
        for (const n of taps) {
          const st = flatStyle(n.props.style);
          const h = st.minHeight ?? st.height;
          const w = st.minWidth ?? st.width;
          if (!(h >= 48) || !(w >= 48)) small.push(`«${n.props.accessibilityLabel}» → ${w}×${h}`);
        }
      },
    });
    expect(small).toEqual([]);
  });

  it('кнопка «назад» на экране настроек тоже 48×48 — на этом стоял долг у соседа', () => {
    const back = /back:\s*\{([^}]*)\}/.exec(screen)![1];
    expect(/width:\s*48/.test(back) && /height:\s*48/.test(back)).toBe(true);
  });
});

describe('лестница уровней действительно ведёт вверх', () => {
  it('33 ступени, и каждая собирается без единого нарушения правил', () => {
    expect(LEVELS).toBe(33);
    for (let level = 1; level <= LEVELS; level += 1) {
      const p = generateFacesNamesPuzzle(`faces-names-${level}`, level);
      expect(`${level}: людей ${p.studiedPersonIds.length}`).not.toBe(`${level}: людей 0`);
      // Верный ответ есть ровно один в каждом наборе вариантов.
      for (const trial of p.trials) {
        expect(trial.recognitionPersonIds.filter((id) => id === trial.targetPersonId).length).toBe(1);
        expect(trial.namePersonIds.filter((id) => id === trial.targetPersonId).length).toBe(1);
      }
    }
  });

  it('🔴 растёт СОДЕРЖАНИЕМ: объём, похожесть, варианты, отсрочка и факт', () => {
    const low = generateFacesNamesPuzzle('faces-names-2', 2);
    const mid = generateFacesNamesPuzzle('faces-names-16', 16);
    const top = generateFacesNamesPuzzle('faces-names-33', 33);

    expect(low.studiedPersonIds.length).toBeLessThan(mid.studiedPersonIds.length);
    expect(mid.studiedPersonIds.length).toBeLessThan(top.studiedPersonIds.length);
    expect(low.trials[0].recognitionPersonIds.length).toBeLessThan(top.trials[0].recognitionPersonIds.length);
    expect(low.interferencePrompts.length).toBeLessThan(top.interferencePrompts.length);
    expect(low.factRecallEnabled).toBe(false);
    expect(top.factRecallEnabled).toBe(true);
    expect(low.immediateRecall).toBe(true);
    expect(top.immediateRecall).toBe(false);
    // Ложные лица к верхним уровням подбираются ближе к верному.
    expect(top.meanRecognitionDistractorSimilarity)
      .toBeGreaterThan(low.meanRecognitionDistractorSimilarity);
    // И ни одна ось не «то же самое, но быстрее»: отсчёта времени в пазле нет.
    expect(JSON.stringify(top)).not.toMatch(/"(timeLimit|deadline|windowMs)"/);
  });
});

/** Текстовый узел внутри кнопки — тот, у которого есть строковое содержимое. */
function renderedTextNode(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) { const found = renderedTextNode(n); if (found) return found; }
    return null;
  }
  if (node.type === 'Text' && node.children?.some((c: any) => typeof c === 'string')) return node;
  return node.children ? renderedTextNode(node.children) : null;
}
