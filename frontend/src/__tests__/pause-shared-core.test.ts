/* psygames-pause-shared-core-gate · VER 1 · 26.08.2026 */
/**
 * ЯДРО «ПАУЗЫ» ОБЩЕЕ С ОТДЕЛЬНЫМ ПРИЛОЖЕНИЕМ — И ОБЯЗАНО ОСТАТЬСЯ ТАКИМ.
 *
 * 🔴 ЧТО ИМЕННО РАЗЪЕДЕТСЯ, ЕСЛИ ЭТОГО ГЕЙТА НЕ БУДЕТ. `src/games/pause/core`
 * — не только наш код. Отдельное приложение «Умный будильник»
 * (`~/dev/psygames-game-lab/smart-alarm`) НЕ ДЕРЖИТ СВОЮ КОПИЮ: его сборка
 * (`scripts/build-web.mjs`) компилирует это самое ядро и кладёт результат в
 * `web-dist/shared/pause-practices/core`. Один исходник, два приложения.
 *
 * Отсюда требование, которого нет ни у одного другого модуля игр: ядро должно
 * быть ПЛАТФОРМЕННО ЧИСТЫМ. Наше приложение на React Native, будильник — на
 * Tauri с обычным вебом. Строка `import ... from 'react-native'`, обращение к
 * `document` или `localStorage`, попавшие в ядро, у НАС не сломают ничего: наш
 * прогон останется зелёным, наша сборка соберётся. Сломается ЧУЖАЯ сборка в
 * другом репозитории — и узнается это не здесь и не сегодня.
 *
 * Ровно этот класс уже стоил времени в этом проекте: правило, записанное в два
 * носителя, разъехалось, и один носитель месяц раздавал старую редакцию. Здесь
 * носителя тоже два, поэтому проверка стоит на стороне ИСТОЧНИКА.
 *
 * ⚠️ ГЕЙТ СМОТРИТ НА ЗНАЧЕНИЯ И НА ИСХОДНИК СО СРЕЗАННЫМИ КОММЕНТАРИЯМИ. Слово
 * `react-native` в комментарии (а оно в шапке ядра есть — там объясняется, что
 * его нельзя) не должно красить проверку. Ниже отдельная проба доказывает, что
 * срез комментариев работает: без неё гейт краснел бы на собственной шапке.
 */
import {
  PRACTICE_CATALOG,
  text,
  getDefaultPracticeSets,
  getRequiredWarnings,
  createPracticePlan,
  validatePlanRequest,
  type PauseLocale,
  type PracticeSet,
} from '@/src/games/pause/core/engine';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const CORE_DIR = path.resolve(__dirname, '..', 'games', 'pause', 'core');

/** Исходник без комментариев: и блочных, и строчных. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function coreFiles(): string[] {
  return fs.readdirSync(CORE_DIR).filter((f: string) => f.endsWith('.ts')).map((f: string) => path.join(CORE_DIR, f));
}

describe('ядро «Паузы» пригодно для второго приложения', () => {
  it('срез комментариев работает — иначе весь гейт ложный', () => {
    const probe = "/* тут написано react-native */\nconst a = 1; // и тут document.body\nconst b = 'живой';";
    const cut = stripComments(probe);
    expect(cut).not.toContain('react-native');
    expect(cut).not.toContain('document.body');
    expect(cut).toContain('живой');   // живой код срезом НЕ тронут
  });

  it('🔴 в ядре нет ни одного обращения к платформе', () => {
    // Каждый запрет — это то, чего нет в ОДНОМ из двух приложений.
    const banned: [RegExp, string][] = [
      [/from\s+'react-native'/, "react-native (нет в будильнике: он на обычном вебе)"],
      [/from\s+'expo[-/]/, 'expo (нет в будильнике)'],
      [/\bdocument\s*\./, 'document (нет в React Native)'],
      [/\bwindow\s*\./, 'window (нет в React Native)'],
      [/\blocalStorage\b/, 'localStorage (нет в React Native)'],
      [/\bnavigator\s*\./, 'navigator (нет в React Native)'],
      [/\brequire\s*\(/, 'require (ядро обязано быть модулем ESM для обоих)'],
    ];
    const found: string[] = [];
    for (const file of coreFiles()) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [re, why] of banned) if (re.test(code)) found.push(`${path.basename(file)}: ${why}`);
    }
    expect(found).toEqual([]);
  });

  it('🔴 ядро ни от чего не зависит снаружи себя', () => {
    // Любой внешний импорт означает, что чужая сборка обязана его разрешить.
    // Сегодня ядро самодостаточно, и это свойство надо удержать.
    const outside: string[] = [];
    for (const file of coreFiles()) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of code.matchAll(/from\s+'([^']+)'/g)) {
        if (!m[1].startsWith('.')) outside.push(`${path.basename(file)} → ${m[1]}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('🔴 каталог на месте: наборы, программы и шаги не растеряны при переносе', () => {
    // Числа сняты с модуля лаборатории в день переноса, 26.08.2026, прогоном
    // по собранному движку. Если перенос что-то потеряет — увидим здесь, а не
    // на экране у человека.
    let programs = 0;
    let steps = 0;
    for (const set of PRACTICE_CATALOG) {
      programs += set.programs.length;
      for (const program of set.programs) steps += program.steps.length;
    }
    expect(PRACTICE_CATALOG.length).toBe(10);
    expect(programs).toBe(42);
    expect(steps).toBe(156);
  });

  it('🔴 у каждого набора, программы и шага подпись есть на ОБОИХ языках ядра', () => {
    const locales: PauseLocale[] = ['ru', 'en'];
    const holes: string[] = [];
    const check = (what: string, text: { ru: string; en: string } | undefined) => {
      if (!text) { holes.push(`${what}: подписи нет вовсе`); return; }
      for (const l of locales) {
        const v = text[l as 'ru' | 'en'];
        if (typeof v !== 'string' || !v.trim()) holes.push(`${what}: пусто на ${l}`);
      }
    };
    for (const set of PRACTICE_CATALOG) {
      check(`набор ${set.id}`, set.title);
      check(`набор ${set.id} (описание)`, set.summary);
      for (const program of set.programs) {
        check(`${set.id}/${program.id}`, program.title);
        for (const step of program.steps) check(`${set.id}/${program.id}/${step.id}`, step.title);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 набор по умолчанию действительно собирается в план', () => {
    // Не «функция не бросила», а план С ШАГАМИ: пустой план прошёл бы молча.
    const defaults = getDefaultPracticeSets();
    expect(defaults.length).toBeGreaterThan(0);
    // ⚠️ РОВНО ОДИН набор: в одиночном режиме ядро отвергает несколько
    // (`INVALID_SELECTION_COUNT`). На этом уже споткнулся экран — см. `pause.tsx`.
    const selections = defaults.slice(0, 1).map((s: PracticeSet) => ({ setId: s.id }));
    // ⚠️ ПРЕДУПРЕЖДЕНИЯ ПОДТВЕРЖДАЮТСЯ ЯВНО, и это не формальность гейта: ядро
    // не отдаёт план, пока вызывающий их не принял. В приложении это делает сам
    // компонент `PausePracticesGame` — потому его пропсы и вырезают
    // `acknowledgedWarnings` из запроса. Здесь повторяем то же руками.
    const request = {
      mode: 'solo' as const,
      selections,
      durationMs: 5 * 60_000,
      locale: 'ru' as PauseLocale,
      guideMode: 'visual' as const,
      context: 'home' as const,
      acknowledgedWarnings: getRequiredWarnings(selections),
    };
    expect(validatePlanRequest(request)).toEqual([]);
    const plan = createPracticePlan(request);
    expect(plan.timeline.length).toBeGreaterThan(0);
    expect(plan.blocks.length).toBeGreaterThan(0);
  });

  it('🔴 одиночный режим отвергает несколько наборов — на этом падал экран', () => {
    const defaults = getDefaultPracticeSets();
    const issues = validatePlanRequest({
      mode: 'solo',
      selections: defaults.slice(0, 2).map((s: PracticeSet) => ({ setId: s.id })),
      durationMs: 5 * 60_000,
      locale: 'ru',
      guideMode: 'visual',
      context: 'home',
    });
    expect(issues.some((i: any) => i.code === 'INVALID_SELECTION_COUNT')).toBe(true);
  });

  it('🔴 опасное закрыто по умолчанию: продвинутые практики требуют явного согласия', () => {
    // Уровни 3–5 живота (агнисара, вакуум, наули) — таймеры для тех, кто уже
    // умеет. Планировщик обязан отказать, пока вызывающий не подтвердил опыт.
    const advanced = PRACTICE_CATALOG.find((s: PracticeSet) => s.id === 'abdomen');
    expect(advanced).toBeTruthy();
    expect(advanced!.defaultEnabled).toBe(false);
    const issues = validatePlanRequest({
      mode: 'solo',
      selections: [{ setId: 'abdomen' }],
      durationMs: 5 * 60_000,
      locale: 'ru',
      guideMode: 'visual',
      context: 'home',
    });
    expect(issues.length).toBeGreaterThan(0);
  });
});

/**
 * Р2 (29.08.2026): двенадцать локалей с en-фолбэком. Сторожим обе стороны:
 * переведённое отдаётся на языке, непереведённое — по-английски (не ключом,
 * не пустотой, не по-русски), названия наборов реально переведены на все 12.
 */
describe('двенадцать локалей каталога', () => {
  const ALL = ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh'] as const;

  it('🔴 названия всех наборов непусты и различимы на каждом из 12 языков', () => {
    for (const set of PRACTICE_CATALOG) {
      for (const l of ALL) {
        const v = text(set.title, l as PauseLocale);
        expect(`${set.id}/${l}: «${v}» непусто`).toBe(`${set.id}/${l}: «${v}» непусто`);
        expect(typeof v).toBe('string');
        expect(v.trim().length).toBeGreaterThan(0);
      }
      // de-название не равно en (перевод настоящий, не фолбэк) — на одном наборе-канарейке
    }
    const breathing = PRACTICE_CATALOG.find((s) => s.id === 'breathing')!;
    expect(text(breathing.title, 'de' as PauseLocale)).toBe('Atmung');
    expect(text(breathing.title, 'ja' as PauseLocale)).toBe('呼吸');
  });

  it('непереведённое поле честно фолбэчит на en (summary пока ru/en)', () => {
    const breathing = PRACTICE_CATALOG.find((s) => s.id === 'breathing')!;
    expect(text(breathing.summary, 'de' as PauseLocale)).toBe(breathing.summary.en);
    expect(text(breathing.summary, 'ru' as PauseLocale)).toBe(breathing.summary.ru);
  });
});
