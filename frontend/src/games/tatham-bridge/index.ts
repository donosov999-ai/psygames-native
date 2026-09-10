/* psygames-tatham-bridge-api · VER 2 · 10.09.2026 */
/**
 * ТИПИЗИРОВАННЫЙ ДОСТУП К ДВИЖКАМ ТЭТХЭМА.
 *
 * Модуль собран одним файлом (`SINGLE_FILE=1`): wasm лежит внутри `tatham.js`, поэтому
 * Metro кладёт его в бандл как обычный модуль, отдельного ассета и загрузки по сети нет.
 *
 * ⚠️ Загружается ЛЕНИВО и один раз: 969 КБ (375 КБ в gzip) не должны ехать на главный экран.
 */
type Native = {
  ccall: (n: string, ret: string | null, types: string[], args: unknown[]) => any;
  UTF8ToString: (p: number) => string;
};

let модуль: Promise<Native> | null = null;

/** Один экземпляр на всё приложение; повторные вызовы отдают тот же. */
export function загрузить(): Promise<Native> {
  if (!модуль) {
    // require, а не import: обвязка Emscripten — CommonJS с фабрикой по умолчанию.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    модуль = (require('./tatham.js') as () => Promise<Native>)();
  }
  return модуль;
}

/** Строка, которую вернул движок, и её освобождение — память общая с C. */
function строка(M: Native, p: number): string {
  if (!p) return '';
  const s = M.UTF8ToString(p);
  M.ccall('psy_free', null, ['number'], [p]);
  return s;
}

export interface Ступень { индекс: number; имя: string; параметры: string }

export interface Движок {
  индекс: number;
  имя: string;
  умеетТекстом: boolean;
  /**
   * Есть ли у движка решатель. Замер 10.09.2026 по `game.can_solve` самого автора:
   * его нет у Cube, Pegs и Same Game — у них единственного решения не существует по
   * устройству игры. Кнопка подсказки у таких режимов не показывается: кнопка, которая
   * ничего не делает, хуже отсутствующей.
   */
  решаем: boolean;
  ступени: Ступень[];
}

/** Опись движков — что есть, как зовут, какие у автора ступени сложности. */
export async function движки(): Promise<Движок[]> {
  const M = await загрузить();
  const n = M.ccall('psy_count', 'number', [], []) as number;
  const out: Движок[] = [];
  for (let i = 0; i < n; i++) {
    const ступеней = M.ccall('psy_presets', 'number', ['number'], [i]) as number;
    const ступени: Ступень[] = [];
    for (let k = 0; k < ступеней; k++) {
      ступени.push({
        индекс: k,
        имя: строка(M, M.ccall('psy_preset_name', 'number', ['number', 'number'], [i, k])),
        параметры: строка(M, M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, k])),
      });
    }
    out.push({
      индекс: i,
      имя: M.ccall('psy_name', 'string', ['number'], [i]) as string,
      умеетТекстом: (M.ccall('psy_has_board', 'number', ['number'], [i]) as number) === 1,
      решаем: (M.ccall('psy_can_solve', 'number', ['number'], [i]) as number) === 1,
      ступени,
    });
  }
  return out;
}

/**
 * Доска строками. Формат — его же ASCII (`text_format`), один на все головоломки:
 * именно поэтому нашей стороне не нужен парсер под каждую.
 * ⚠️ Keen и Map текстом себя не показывают — вернут пустой массив.
 */
export async function доска(движок: number, параметры: string, зерно: number): Promise<string[]> {
  const M = await загрузить();
  const t = строка(M, M.ccall('psy_board', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]));
  return t.split('\n').filter((s) => s.length > 0);
}
