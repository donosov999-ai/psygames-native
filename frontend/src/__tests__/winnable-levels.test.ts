/* psygames-winnable-levels · VER 1 · 22.08.2026 */
/**
 * В ЛЮБОЙ УРОВЕНЬ МОЖНО ДОИГРАТЬ.
 *
 * 🔴 КЛАСС ДЕФЕКТА, КОТОРЫЙ ПОВТОРИЛСЯ ТРИЖДЫ: победа сверяется с числом из
 * КОНФИГА, а доска собирается из того, что реально есть. Пока они совпадают —
 * всё работает; разошлись — партия не завершается НИКОГДА, и заметить это можно
 * только доиграв до того уровня.
 *
 * Где ловилось:
 *   · фрактальная судоку — починено ранее;
 *   · «Пары»: спрайтов ровно двенадцать, а формула с 22-го уровня просила
 *     тринадцать. Все карты открыты, ходов нет, счётчик висит «12/13». Игра при
 *     этом не скрыта из меню и стояла в ротации «Вызова дня».
 *
 * ⚠️ ПРОВЕРЯЕМ ПАРАМЕТРЫ УРОВНЯ ПРОТИВ ЗАПАСА МАТЕРИАЛА, а не «выглядит ли
 * разумно». Число, которого нет в наборе, попросить нельзя.
 */
import { SPRITE_COUNT } from '@/src/constants/pairThemes';
import { levelCfg } from '@/app/games/picture-pairs';
import { levelParams, answerChoices } from '@/app/games/quick-count';
import { maxGridFor } from '@/app/games/schulte';
import { emoLangFor, emoWordsFor, makeTrial, EMO_LANGS } from '@/app/games/stroop-emotional';
import { SCRIPTS, SCRIPT_IDS } from '@/src/constants/scripts';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;

describe('«Пары»: групп не больше, чем картинок в наборе', () => {
  const groupsAt = (L: number) => levelCfg(L).pairs;

  it('расчёт взят из ЖИВОЙ игры, а не переписан в тесте', () => {
    expect(typeof groupsAt(1)).toBe('number');
    expect(groupsAt(1)).toBeGreaterThan(1);
  });

  it('🔴 ни на одном уровне до сотого не просят больше, чем есть', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const groups = groupsAt(L);
      if (groups > SPRITE_COUNT) bad.push(`L${L}: просит ${groups} из ${SPRITE_COUNT}`);
      if (groups < 2) bad.push(`L${L}: групп ${groups} — играть не во что`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('на 22-м уровне — том самом — просят ровно столько, сколько есть', () => {
    expect(groupsAt(22)).toBe(SPRITE_COUNT);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ: без ограничителя 22-й уровень обязан просить больше
   * набора. Иначе всё выше зеленеет на пустом месте.
   */
  it('без ограничителя дефект бы вернулся', () => {
    const raw = (L: number) => (L <= 9 ? Math.min(12, 3 + L) : L <= 12 ? 4 + (L - 10) : 4 + (L - 13));
    expect(raw(22)).toBeGreaterThan(SPRITE_COUNT);
  });
});

describe('🔴 счётчик победы берётся из доски, а не из конфига', () => {
  const screen = read('../../app/games/picture-pairs.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('число групп для победы считается по СОБРАННОЙ колоде', () => {
    expect(screen).toMatch(/setPairsCount\(new Set\(deck\.map/);
  });

  it('и больше не приходит из конфига', () => {
    expect(screen).not.toMatch(/setPairsCount\(pairs\)/);
  });
});

describe('«Быстрый счёт»: верный ответ всегда есть на экране', () => {
  /**
   * 🔴 ДИАПАЗОН ПЕРЕВОРАЧИВАЛСЯ С СОРОКОВОГО УРОВНЯ: нижняя граница росла без
   * потолка, верхняя упиралась в двадцать. На 43-м кнопка оставалась одна при
   * четырёх возможных ответах, на 45-м кнопок не оставалось НИ ОДНОЙ — партия
   * вставала намертво. Тот же класс, что у «Пар»: уровень просит того, чего
   * экран дать не может.
   */
  it('🔴 нижняя граница никогда не обгоняет верхнюю — сто уровней подряд', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const p = levelParams(L);
      if (p.minN > p.maxN) bad.push(`L${L}: ${p.minN}..${p.maxN} перевёрнут`);
      if (p.maxN - p.minN < 2) bad.push(`L${L}: разброс ${p.maxN - p.minN} — угадывание, а не счёт`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 кнопки накрывают ВЕСЬ возможный ответ', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const p = levelParams(L);
      const buttons = new Set(answerChoices(p));
      for (let n = p.minN; n <= p.maxN; n += 1) {
        if (!buttons.has(n)) bad.push(`L${L}: ответа ${n} нет на экране`);
      }
      if (buttons.size < 3) bad.push(`L${L}: кнопок ${buttons.size}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('на 45-м — том самом — кнопки есть', () => {
    expect(answerChoices(levelParams(45)).length).toBeGreaterThanOrEqual(3);
  });

  /** ⚠️ Проверка проверки: прежняя формула на 45-м давала ноль кнопок. */
  it('прежняя формула эту проверку бы завалила', () => {
    const raw = (L: number) => {
      const base = 3 + Math.floor((L - 1) / 2);
      const spread = 2 + Math.floor(L / 5);
      return { minN: base, maxN: Math.min(20, base + spread) };
    };
    expect(raw(45).minN).toBeGreaterThan(raw(45).maxN);
  });
});

describe('Шульте: сетка не больше, чем позволяет алфавит', () => {
  /**
   * 🔴 «СМЕШАННОМУ» ПОТОЛОК НЕ СТАВИЛСЯ ВОВСЕ. Шульте-Горбов раскладывает
   * половину клеток цифрами, половину буквами: на 10×10 это пятьдесят букв, а
   * латиница даёт 26, кириллица 33 — не подходит НИ ОДИН алфавит. Ограничение
   * стояло только для режима «буквы». Партия не завершалась, а таймера у Шульте
   * нет: экран висел, пока человек не уйдёт сам.
   *
   * Третий случай одного класса за час, вместе с «Парами» и «Быстрым счётом».
   */
  it('🔴 для каждого алфавита и режима потолок ЧЕСТНЫЙ', () => {
    const bad: string[] = [];
    for (const id of SCRIPT_IDS) {
      const chars = SCRIPTS[id].chars.length;
      for (const mode of ['letters', 'mixed'] as const) {
        const n = maxGridFor(mode, chars);
        const need = mode === 'letters' ? n * n : Math.ceil((n * n) / 2);
        if (need > chars) bad.push(`${id}/${mode}: сетка ${n}×${n} просит ${need} из ${chars}`);
        if (n < 2) bad.push(`${id}/${mode}: сетки нет вовсе`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('цифрам алфавит не нужен — там потолок общий', () => {
    expect(maxGridFor('numbers', 0)).toBe(10);
  });

  it('🔴 латиница «смешанным» не тянет десятку', () => {
    // 10×10 = 100 клеток, половина буквами = 50; латиницы 26.
    expect(maxGridFor('mixed', 26)).toBeLessThan(10);
  });

  it('огромный алфавит десятку тянет — потолок не занижен', () => {
    expect(maxGridFor('mixed', 999)).toBe(10);
    expect(maxGridFor('letters', 999)).toBe(10);
  });
});

describe('🔴 потолок Шульте доезжает до кнопок выбора сетки', () => {
  const screen = read('../../app/games/schulte.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('кнопки размера гасятся по потолку РЕЖИМА, а не только букв', () => {
    expect(screen).toMatch(/maxSizeFor\(contentMode\)/);
  });

  it('прежнее правило «только для букв» не вернулось', () => {
    expect(screen).not.toMatch(/contentMode === 'letters' \? lettersMaxSize : 10/);
  });

  it('и выбранный размер подрезается при смене режима или алфавита', () => {
    expect(screen).toMatch(/const cap = maxSizeFor\(contentMode\)/);
    expect(screen).toMatch(/gridSize > cap\) setGridSize\(cap\)/);
  });
});

describe('«Эмоциональный Струп»: игра не падает ни на одном языке', () => {
  /**
   * 🔴 ПАДАЛА ПРИ СТАРТЕ НА ДЕСЯТИ ЯЗЫКАХ ИЗ ДВЕНАДЦАТИ. Наборы слов есть только
   * для русского и английского, а язык приходил из `useLanguage() as any` —
   * приведение заглушило компилятор, и на французском набор оказывался
   * `undefined`. Выбор случайного слова из `undefined` роняет экран.
   */
  const ALL = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];

  it('🔴 для любого языка приложения находится рабочий набор слов', () => {
    for (const lang of ALL) {
      expect(`${lang} → ${emoLangFor(lang)}`).toBe(`${lang} → ${EMO_LANGS.includes(lang as never) ? lang : 'en'}`);
      expect(EMO_LANGS).toContain(emoLangFor(lang));
    }
  });

  it('🔴 слова находятся для КАЖДОГО языка и каждой окраски', () => {
    const bad: string[] = [];
    for (const lang of ALL) {
      for (const valence of ['threat', 'positive', 'neutral'] as const) {
        const words = emoWordsFor(valence, lang);
        if (!Array.isArray(words) || words.length < 5) bad.push(`${lang}/${valence}: ${words?.length ?? 'нет'}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 САМА ПРОБА собирается на любом языке и не падает', () => {
    const bad: string[] = [];
    for (const lang of ALL) {
      for (const ratio of [0, 0.5, 1]) {
        for (let i = 0; i < 20; i += 1) {
          try {
            const tr = makeTrial(lang, ratio);
            if (!tr.word || typeof tr.word !== 'string') bad.push(`${lang}: слова нет`);
          } catch (e) { bad.push(`${lang}: упало — ${String(e).slice(0, 40)}`); }
        }
      }
    }
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it('поддержанные языки не подменяются', () => {
    for (const lang of EMO_LANGS) expect(emoLangFor(lang)).toBe(lang);
  });

  it('мусор на входе экран не роняет', () => {
    expect(EMO_LANGS).toContain(emoLangFor(''));
    expect(EMO_LANGS).toContain(emoLangFor('не-язык'));
  });

  it('🔴 подмена языка названа игроку, а не сделана молча', () => {
    const screen = read('../../app/games/stroop-emotional.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(screen).toMatch(/emoLangFor\(language\) !== language/);
    expect(screen).toMatch(/stroopEmoLangFallback/);
  });
});
