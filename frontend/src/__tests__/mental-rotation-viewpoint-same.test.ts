/* psygames-mental-rotation-viewpoint-same · VER 1 · 12.09.2026 */
/* psygames-spatial-claude-mac · задача 148ecbb4 */
/**
 * ДВА НОВЫХ РЕЖИМА: «ТОЧКА ЗРЕНИЯ» И «ОДИНАКОВАЯ ФИГУРА».
 *
 * 🔴 ЧТО ЭТА ПРОБА НА САМОМ ДЕЛЕ СТОРОЖИТ, И ПОЧЕМУ ЭТОГО НЕ ВИДНО ГЛАЗАМ.
 * Оба режима ломаются НЕ падением, а тихим появлением ВТОРОГО ПРАВИЛЬНОГО
 * ОТВЕТА. У «Точки зрения» это два ракурса симметричной фигуры, которые рисуются
 * одинаково: человек выбирает верный по смыслу вариант, игра засчитывает промах.
 * У «Одинаковой фигуры» — зеркало плоской фигуры, которое на самом деле является
 * её законным поворотом: правильный ответ «да», а генератор объявил «нет».
 * Ни то, ни другое не видно ни в типах, ни в линте, ни на экране при беглой
 * игре: задание выглядит нормальным ровно до того момента, когда игрок окажется
 * прав, а игра — нет.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРКИ ЗДЕСЬ ИДУТ ПО ПОВЕДЕНИЮ, А НЕ ПО ЗАМЫСЛУ.
 * · различимость ракурсов меряется ТЕМ ЖЕ рисователем, которым ракурс потом
 *   рисуется на экране (`viewFingerprint` → `shapeSurface`), а не рассуждением
 *   про симметрию фигуры;
 * · честность пары меряется перебором 24 ориентаций (`isValidRotation`), а не
 *   флагом, который генератор сам себе поставил.
 *
 * 🔴 У КАЖДОЙ ПРОВЕРКИ ЕСТЬ КОНТРОЛЬ С ИЗВЕСТНЫМ ОТВЕТОМ. Проба, которая только
 * подтверждает, — это проба, про которую неизвестно, умеет ли она отказывать.
 * Поэтому рядом с настоящими заданиями сюда подаются собранные руками заведомо
 * битые, и проверяющая функция обязана их назвать. Без этого зелёный цвет ничего
 * не значит (PROJECT_REF_RULES §15).
 */
import {
  buildSameTask,
  buildViewpointTask,
  isValidRotation,
  levelParams,
  mirrorShape,
  shapeKey,
  viewFingerprint,
  viewpointAngles,
  VIEWPOINT_AXIS,
  createRng,
  type SameTask,
  type ViewpointTask,
} from '@/src/games/mental-rotation/core';
import { viewpointMarkOffset, CAMERA_AZIMUTH, MARK_ASPECT } from '@/src/components/ViewpointReference';

// ─── проверяющие: одни и те же для настоящих заданий и для контролей ──────

/** Всё, чем задание на ракурс может врать. Пустой список = задание честное. */
function viewpointFaults(task: ViewpointTask): string[] {
  const bad: string[] = [];
  const matches = task.options.filter((o) => o.isMatch);
  if (matches.length !== 1) bad.push(`правильных вариантов ${matches.length}, а не один`);
  if (task.options[task.correctIdx]?.isMatch !== true) bad.push('correctIdx смотрит не на правильный вариант');
  if (matches[0] && matches[0].degrees !== task.degrees) bad.push('угол правильного варианта не совпал с углом задания');
  if (task.degrees === 0) bad.push('правильный ракурс — 0°, то есть сам эталон');

  // Главное: две одинаковые КАРТИНКИ среди вариантов. Считается прогоном
  // рисователя, а не сравнением углов: разные углы дают одну картинку сплошь.
  const seen = new Map<string, number>();
  for (const o of task.options) {
    const key = viewFingerprint(task.shape, o.degrees);
    if (seen.has(key)) bad.push(`ракурсы ${seen.get(key)}° и ${o.degrees}° рисуются одинаково`);
    seen.set(key, o.degrees);
  }
  // …и ни один вариант не должен совпасть с эталоном, который показан под 0°.
  const base = viewFingerprint(task.shape, 0);
  for (const o of task.options) {
    if (viewFingerprint(task.shape, o.degrees) === base) bad.push(`ракурс ${o.degrees}° неотличим от эталона`);
  }
  return bad;
}

/** Всё, чем может врать пара «одинаковая фигура». */
function sameFaults(task: SameTask): string[] {
  const bad: string[] = [];
  // Ответ задания обязан СОВПАДАТЬ с перебором ориентаций, а не с намерением.
  const truth = isValidRotation(task.left, task.right);
  if (truth !== task.isSame) bad.push(`объявлено isSame=${task.isSame}, перебор 24 ориентаций говорит ${truth}`);
  if (task.options.length !== 2) bad.push(`кнопок ${task.options.length}, а не две`);
  if (task.options[0]?.answer !== true || task.options[1]?.answer !== false) bad.push('порядок кнопок не «да, нет»');
  if (task.options[task.correctIdx]?.answer !== task.isSame) bad.push('correctIdx смотрит не на верный ответ');
  if (task.options.filter((o) => o.isMatch).length !== 1) bad.push('верных кнопок не ровно одна');
  if (task.isSame && shapeKey(task.left) === shapeKey(task.right)) bad.push('пара «да» из двух одинаковых картинок — отвечается без поворота');
  return bad;
}

// ─── «Точка зрения» ───────────────────────────────────────────────────────

describe('«Точка зрения»: ракурсы различимы, эталон в варианты не попадает', () => {
  it('🔴 двести заданий подряд — ни одного с двумя одинаковыми ракурсами', () => {
    const bad: string[] = [];
    for (const level of [7, 11, 20, 33, 48]) {
      for (let i = 0; i < 40; i++) {
        const task = buildViewpointTask(level, createRng(`vp-${level}-${i}`));
        for (const fault of viewpointFaults(task)) bad.push(`уровень ${level}, семя ${i}: ${fault}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  /**
   * 🔴 КОНТРОЛЬ. Собрано руками задание, где вариант стоит на 0° — то есть
   * повторяет эталон. Если `viewpointFaults` этого НЕ назовёт, значит проба выше
   * зелёная не потому, что заданий нет битых, а потому, что она слепа.
   */
  it('🔴 прибор умеет отказывать: подложенный ракурс 0° назван по имени', () => {
    const honest = buildViewpointTask(11, createRng('control'));
    const broken: ViewpointTask = {
      ...honest,
      options: [{ degrees: 0, isMatch: false }, ...honest.options.slice(1)],
    };
    const faults = viewpointFaults(broken);
    expect(faults.join(' | ')).toMatch(/неотличим от эталона/);
  });

  it('🔴 прибор умеет отказывать: два одинаковых угла среди вариантов названы', () => {
    const honest = buildViewpointTask(11, createRng('control-2'));
    const dup = honest.options[0].degrees;
    const broken: ViewpointTask = {
      ...honest,
      options: [honest.options[0], { degrees: dup, isMatch: false }, ...honest.options.slice(2)],
    };
    expect(viewpointFaults(broken).join(' | ')).toMatch(/рисуются одинаково/);
  });

  it('лестница: на составных уровнях появляются промежуточные ракурсы, а не только четверти', () => {
    // Уровень 1 — только четверти оборота; уровень 4 — шаг 45°. Литералы взяты из
    // лестницы поворота (levelParams(...).compound), но записаны сюда ЧИСЛАМИ:
    // возьми их из того же кода — и проба перестанет замечать его изменение.
    expect(viewpointAngles(1)).toEqual([0, 90, 180, 270]);
    expect(viewpointAngles(4)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(levelParams(4).compound).toBe(true);
    expect(levelParams(1).compound).toBe(false);
  });

  it('обход идёт вокруг вертикали — иначе метка на экране показывает не туда', () => {
    expect(VIEWPOINT_AXIS).toBe('y');
  });
});

describe('метка «откуда смотрим» согласована с рисователем', () => {
  /**
   * 🔴 ЗАЧЕМ ЭТО ПРИБИТО ЧИСЛОМ. Метка — единственное, что превращает «четыре
   * картинки одной фигуры» в решаемую задачу. Если знак угла разойдётся с
   * `turnPoint`, метка будет показывать на противоположную сторону, и задание
   * станет не трудным, а нечестным — молча, без единой ошибки на экране.
   */
  it('🔴 при нулевом угле метка стоит внизу по центру — «отсюда и смотрим сейчас»', () => {
    const [x, y] = viewpointMarkOffset(0);
    expect(x).toBeCloseTo(0, 10);          // ровно по центру по горизонтали
    expect(y).toBeCloseTo(MARK_ASPECT, 10); // и ближе к зрителю, то есть НИЖЕ центра
    expect(y).toBeGreaterThan(0);           // экранный Y растёт вниз
  });

  /**
   * 🔴 ЭТА ПРОБА ЗАВЕДЕНА ПО СЛЕДАМ НАСТОЯЩЕГО ДЕФЕКТА, А НЕ «НА ВСЯКИЙ СЛУЧАЙ».
   * 12.09.2026 метка при части углов уезжала за край холста и пропадала с экрана:
   * координаты возвращались сырыми, а комментарий обещал [-1..1]. Задание при этом
   * оставалось «нормальным» — просто без условия. Тринадцать зелёных проб этого не
   * заметили, увидел глаз на живом экране.
   *
   * Числа здесь ЛИТЕРАЛЫ: 0,42 — радиус круга обхода в долях холста, 0,055 — радиус
   * самой метки, оба из `ViewpointReference`. Взять их импортом — значит проверять
   * код им же самим: подними радиус до 0,9, и проба останется зелёной.
   */
  it('🔴 метка не уезжает с холста ни при одном угле', () => {
    const RADIUS = 0.42, MARK = 0.055;
    const outside: string[] = [];
    for (let a = 0; a < 360; a += 1) {
      const [x, y] = viewpointMarkOffset(a);
      if (Math.abs(x) * RADIUS + MARK > 0.5) outside.push(`${a}°: по X вылезает на ${(Math.abs(x) * RADIUS + MARK).toFixed(3)}`);
      if (Math.abs(y) * RADIUS + MARK > 0.5) outside.push(`${a}°: по Y вылезает на ${(Math.abs(y) * RADIUS + MARK).toFixed(3)}`);
    }
    expect(outside.slice(0, 3)).toEqual([]);
  });

  it('метка обходит фигуру кругом: 90° уводит её с центра, 180° — на другую сторону', () => {
    const [x0, y0] = viewpointMarkOffset(0);
    const [x90] = viewpointMarkOffset(90);
    const [x180, y180] = viewpointMarkOffset(180);
    expect(Math.abs(x90)).toBeGreaterThan(0.5);
    expect(x180).toBeCloseTo(-x0, 10);
    expect(y180).toBeCloseTo(-y0, 10);
  });

  it('исходное положение наблюдателя — там, где x = z', () => {
    expect(CAMERA_AZIMUTH).toBe(45);
  });
});

// ─── «Одинаковая фигура» ──────────────────────────────────────────────────

describe('«Одинаковая фигура»: ответ считается перебором, а не назначается', () => {
  it('🔴 триста пар подряд — объявленный ответ всегда сходится с перебором 24 ориентаций', () => {
    const bad: string[] = [];
    for (const level of [9, 12, 25, 40, 50]) {
      for (let i = 0; i < 60; i++) {
        const task = buildSameTask(level, createRng(`same-${level}-${i}`));
        for (const fault of sameFaults(task)) bad.push(`уровень ${level}, семя ${i}: ${fault}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('оба ответа встречаются, и примерно поровну — иначе «всегда да» выигрывает не думая', () => {
    let yes = 0;
    const total = 240;
    for (let i = 0; i < total; i++) if (buildSameTask(12, createRng(`balance-${i}`)).isSame) yes += 1;
    expect(yes).toBeGreaterThan(total * 0.35);
    expect(yes).toBeLessThan(total * 0.65);
  });

  /**
   * 🔴 КОНТРОЛЬ. Пара, где справа стоит просто повёрнутая копия, но объявлено
   * «нет». Это ровно тот дефект, ради которого проба и написана: на экране такая
   * пара выглядит безупречно.
   */
  it('🔴 прибор умеет отказывать: поворот, объявленный чужой фигурой, назван по имени', () => {
    const honest = buildSameTask(12, createRng('control-same'));
    const broken: SameTask = { ...honest, left: honest.left, right: honest.left.map((c) => [...c] as typeof c), isSame: false, correctIdx: 1, options: [{ answer: true, isMatch: false }, { answer: false, isMatch: true }] };
    expect(sameFaults(broken).join(' | ')).toMatch(/перебор 24 ориентаций говорит true/);
  });

  it('🔴 прибор умеет отказывать: пара «да» из двух одинаковых картинок названа', () => {
    const honest = buildSameTask(12, createRng('control-same-2'));
    const broken: SameTask = { ...honest, right: honest.left.map((c) => [...c] as typeof c), isSame: true, correctIdx: 0, options: [{ answer: true, isMatch: true }, { answer: false, isMatch: false }] };
    expect(sameFaults(broken).join(' | ')).toMatch(/отвечается без поворота/);
  });

  it('зеркальная подделка и правда зеркало, а не другая фигура', () => {
    const bad: string[] = [];
    for (let i = 0; i < 60; i++) {
      const task = buildSameTask(12, createRng(`mirror-${i}`));
      if (task.flaw !== 'mirror') continue;
      if (!isValidRotation(mirrorShape(task.left), task.right)) bad.push(`семя ${i}: подделка помечена зеркалом, но зеркалом не является`);
    }
    expect(bad.slice(0, 3)).toEqual([]);
  });
});
