/* psygames-spatial-lab-level-note · VER 2 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961 */
/**
 * 🔴 ОПИСАНИЕ УРОВНЯ ГОВОРИТ НА ЯЗЫКЕ ИГРОКА — НА ВСЕХ СТА УРОВНЯХ ЛАБОРАТОРИИ.
 *
 * Замер 16.09.2026 на стенде, английский экран, режим уровней: под кнопками
 * «Easier / Harder» стояло «Один поворот указанного блока; направление показано.»
 * Экран печатал `spec.change` из ядра — русскую рабочую заметку разработчика.
 * На 15-м уровне там же: «суммарное смещение 42 клеток, нижняя оценка 11 ходов».
 * Кириллица на одиннадцати языках из двенадцати, а на русском — слова не для игрока.
 *
 * 🔬 ПРОБА ИДЁТ ПО НАСТОЯЩИМ ЗАДАЧАМ, А НЕ ПО ТАБЛИЦЕ СПЕЦИФИКАЦИЙ: сто уровней
 * собираются тем же `createDeal`, что и на экране (замер: 0,7 с на все сто).
 * Числа «ходов в самом коротком решении» и «не меньше N» берутся у задачи —
 * проба сверяет, что на экран уходят именно они.
 *
 * ⚠️ ОТСУТСТВУЮЩИЙ ПЕРЕВОД ЛОВИМ СРАВНЕНИЕМ С АНГЛИЙСКИМ. `translateFor` без ключа
 * в файле языка молча отдаёт английскую строку (соседняя проба
 * `spatial-lab-free-play-line` на этом уже ослепла однажды). Ни одна из наших строк
 * не совпадает с английской, поэтому совпадение и есть пропажа перевода.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';
import { levelNote } from '@/src/components/spatialLabLevelNote';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * ⚠️ ЯДРО — ЧЕРЕЗ ОТДЕЛЬНЫЙ `node`, А НЕ ИМПОРТОМ. Ядро лаборатории — модули `.mjs`,
 * jest их не преобразует («Cannot use import statement outside a module»), а трогать
 * общий конфиг ради одной пробы — менять условия всем пробам. Так же, как
 * `game-versions-registry`, зовём настоящий node и берём у ядра ровно то, что
 * читает описание: уровень, спецификацию и два числа задачи.
 */
function задачиЯдра(): any[] {
  const ядро = path.join(__dirname, '..', 'games', 'spatial-core', 'snapshot.mjs');
  const код = `import(${JSON.stringify(ядро)}).then(({createDeal})=>{const out=[];` +
    `for(const mode of ['twiddle','net'])for(let level=1;level<=50;level++){const t=createDeal(mode,42,level).task;` +
    `out.push({mode,task:{level:t.level,spec:t.spec,...('minimumMoves' in t?{minimumMoves:t.minimumMoves,lowerBound:t.lowerBound}:{})}});}` +
    `process.stdout.write(JSON.stringify(out));})`;
  return JSON.parse(execFileSync(process.execPath, ['-e', код], { encoding: 'utf8', timeout: 60000 }));
}

const РЕЖИМЫ = ['twiddle', 'net'] as const;
type Строка = { язык: string; режим: string; уровень: number; текст: string; задача: any };

const ЗАДАЧИ = задачиЯдра();
const строки: Строка[] = [];
for (const { mode: режим, task: задача } of ЗАДАЧИ) {
  for (const { code } of LANGUAGES) {
    строки.push({ язык: code, режим, уровень: задача.level, задача, текст: levelNote(задача, (k) => translateFor(code, k)) });
  }
}

describe('описание уровня лаборатории', () => {
  it('прибор жив: собраны все 100 уровней на всех языках', () => {
    expect(LANGUAGES.length).toBe(12);
    expect(строки.length).toBe(100 * 12);
  });

  it('🔴 ни на одном языке, кроме русского, нет кириллицы — тот самый дефект', () => {
    const плохо = строки.filter((с) => с.язык !== 'ru' && /[А-Яа-яЁё]/.test(с.текст));
    expect(плохо.slice(0, 3).map((с) => `${с.язык} ${с.режим} ${с.уровень}: ${с.текст}`)).toEqual([]);
  });

  it('🔴 рабочая заметка ядра на экран не попадает — даже по-русски', () => {
    const плохо = строки.filter((с) => с.текст === с.задача.spec.change);
    expect(плохо.slice(0, 3).map((с) => `${с.язык} ${с.режим} ${с.уровень}`)).toEqual([]);
  });

  it('все подстановки заполнены: ни «{w}», ни undefined', () => {
    const плохо = строки.filter((с) => /\{\w+\}|undefined|null|NaN/.test(с.текст));
    expect(плохо.slice(0, 3).map((с) => `${с.язык} ${с.режим} ${с.уровень}: ${с.текст}`)).toEqual([]);
  });

  it('в китайском и японском после «。» нет пробела — живой замер показал «以上。 ネットワーク»', () => {
    const плохо = строки.filter((с) => /[。！？] /.test(с.текст));
    expect(плохо.slice(0, 3).map((с) => `${с.язык} ${с.режим} ${с.уровень}: ${с.текст}`)).toEqual([]);
    // контроль: склейка вообще встречается у этих языков, иначе пункт проверял бы пустоту
    expect(строки.filter((с) => (с.язык === 'ja' || с.язык === 'zh') && /。.+。.+。/.test(с.текст)).length).toBeGreaterThan(20);
  });

  it('🔴 перевод есть в каждом языке, а не подставлен английский запасным ходом', () => {
    const англ = new Map(строки.filter((с) => с.язык === 'en').map((с) => [`${с.режим}${с.уровень}`, с.текст]));
    const плохо = строки.filter((с) => с.язык !== 'en' && с.текст === англ.get(`${с.режим}${с.уровень}`));
    expect(плохо.slice(0, 3).map((с) => `${с.язык} ${с.режим} ${с.уровень}: ${с.текст}`)).toEqual([]);
  });

  it('🔴 на экран уходят числа самой задачи', () => {
    const плохо: string[] = [];
    for (const с of строки) {
      if (с.уровень <= 5) continue;
      const з = с.задача, s = з.spec;
      const нужно = с.режим === 'twiddle'
        ? (з.minimumMoves !== null ? [з.minimumMoves] : [s.displacement, з.lowerBound])
        : [s.affected, s.junctions, ...(s.cycles ? [s.cycles] : [])];
      const цифры: string[] = с.текст.match(/\d+/g) ?? [];
      for (const n of [s.width, ...нужно]) if (!цифры.includes(String(n))) плохо.push(`${с.язык} ${с.режим} ${с.уровень}: нет ${n} в «${с.текст}»`);
    }
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('контроль числового пункта: у задачи и правда есть что сверять', () => {
    const з15 = ЗАДАЧИ.find((з) => з.mode === 'twiddle' && з.task.level === 15).task;
    const з50 = ЗАДАЧИ.find((з) => з.mode === 'net' && з.task.level === 50).task;
    expect([з15.minimumMoves, з15.lowerBound, з15.spec.displacement]).toEqual([null, 11, 42]);
    expect([з50.spec.affected, з50.spec.junctions, з50.spec.cycles]).toEqual([31, 6, 4]);
  });

  it('🔴 на каждом языке у пятидесяти уровней режима — пятьдесят разных описаний', () => {
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) for (const режим of РЕЖИМЫ) {
      const тексты = строки.filter((с) => с.язык === code && с.режим === режим).map((с) => с.текст);
      if (new Set(тексты).size !== 50) плохо.push(`${code} ${режим}: разных ${new Set(тексты).size} из 50`);
    }
    expect(плохо).toEqual([]);
  });

  /**
   * ⚠️ ЕДИНСТВЕННАЯ ПРОВЕРКА ПО ИСХОДНИКУ, И ОНА УЗКАЯ НАМЕРЕННО. Функция может быть
   * верной, а экран — снова печатать заметку ядра мимо неё. Ищем ровно вывод
   * `spec.change` в разметке; комментарии вырезаются, иначе история этой починки
   * в самом файле зажгла бы пробу.
   */
  it('экран печатает описание через levelNote, а не spec.change', () => {
    const код = fs.readFileSync(path.join(__dirname, '..', 'components', 'SpatialLab.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(код).not.toMatch(/spec\.change/);
    // 17.09.2026 (afb6ab5b): третьим доводом идёт упражнение — у «Сдвига чисел» и «Сети со сдвигом» своё описание
    expect(код).toMatch(/levelNote\(task,t,mode\)/);
  });
});
