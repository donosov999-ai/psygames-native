/*
 * eslint-disable @typescript-eslint/no-require-imports — `require` для fs/path: типов node в проекте нет, и остальные гейты читают
 * файлы ровно так же.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

/**
 * НОВАЯ КНОПКА ПОДСКАЗКИ/ОТМЕНЫ ОБЯЗАНА НАЗВАТЬ КЛЮЧ ЛЕСТНИЦЫ.
 *
 * ⚠️ Это редкий случай, когда проверять исходник ПРАВИЛЬНО: под проверкой не
 * поведение (его проверяет feature-ladder-locks по нарисованному), а сам факт,
 * что автор назвал приём. Без ключа замок просто не появится — и появится он
 * молча, без единой красной пробы, ровно как это уже случалось с забытыми
 * отступами в шести играх.
 *
 * Поэтому ищем не слова «подсказка»/«отмена» (переименование их сломает), а
 * ЭЛЕМЕНТ `GameAuxAction`, внутри которого стоит ключ словаря `btn_hint` или
 * `btn_undo`, — и требуем в нём `ladder=`.
 */
const КОРЕНЬ = path.resolve(__dirname, '../..');
const ПРИЁМЫ: Record<string, string> = { btn_hint: 'hint', btn_undo: 'undo' };

function файлыИгр(): string[] {
  const out: string[] = [];
  const обойти = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) обойти(p);
      else if (e.name.endsWith('.tsx')) out.push(p);
    }
  };
  обойти(path.join(КОРЕНЬ, 'app/games'));
  обойти(path.join(КОРЕНЬ, 'src/games'));
  обойти(path.join(КОРЕНЬ, 'src/components'));
  return out;
}

/** Куски исходника от `<GameAuxAction` до закрывающей `/>` или `>`. */
function элементы(код: string): string[] {
  const куски: string[] = [];
  let i = код.indexOf('<GameAuxAction');
  while (i !== -1) {
    let глубина = 0;
    let j = i;
    for (; j < код.length; j += 1) {
      const c = код[j];
      if (c === '{') глубина += 1;
      else if (c === '}') глубина -= 1;
      else if (c === '>' && глубина === 0) break;
    }
    куски.push(код.slice(i, j + 1));
    i = код.indexOf('<GameAuxAction', j);
  }
  return куски;
}

describe('покрытие лестницы замков', () => {
  /**
   * ⚠️ Проверка ИСХОДНИКА, и она здесь единственно возможная. Сквозная проба
   * (`feature-ladder-screen`) подаёт уровень сама, поэтому она осталась бы
   * зелёной и с провайдером, снятым из корня, — а именно так дефект и выглядел:
   * провайдер стоял ВНУТРИ каркаса игры, кнопка подсказки судоку живёт в самом
   * экране, уровня не видела, и замок молча не появлялся.
   */
  it('🔴 провайдер уровня стоит в корне приложения, выше экранов игр', () => {
    const layout = fs.readFileSync(path.join(КОРЕНЬ, 'app/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/<PlayerLevelProvider>/);
    expect(layout).toMatch(/<\/PlayerLevelProvider>/);
    // и провайдер должен охватывать <Stack…>, а не стоять рядом с ним
    const начало = layout.indexOf('<PlayerLevelProvider>');
    const конец = layout.indexOf('</PlayerLevelProvider>');
    expect(начало).toBeGreaterThan(-1);
    expect(конец).toBeGreaterThan(начало);
  });

  it('🔴 каждая кнопка подсказки и отмены объявляет ключ лестницы', () => {
    const голые: string[] = [];
    for (const f of файлыИгр()) {
      const код = fs.readFileSync(f, 'utf8');
      for (const эл of элементы(код)) {
        for (const [ключ, приём] of Object.entries(ПРИЁМЫ)) {
          if (!эл.includes(`'${ключ}'`)) continue;
          if (!new RegExp(`ladder=["']${приём}["']`).test(эл)) {
            голые.push(`${path.relative(КОРЕНЬ, f)} → ${ключ} без ladder="${приём}"`);
          }
        }
      }
    }
    expect(голые).toEqual([]);
  });

  it('проба сама находит кнопки — иначе она зеленела бы на пустоте', () => {
    const найдено = файлыИгр()
      .flatMap((f) => элементы(fs.readFileSync(f, 'utf8')))
      .filter((э) => Object.keys(ПРИЁМЫ).some((k) => э.includes(`'${k}'`)));
    expect(найдено.length).toBeGreaterThanOrEqual(9);
  });
});
