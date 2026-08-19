/**
 * СНИМКИ ДЛЯ КАРТОЧКИ GOOGLE PLAY: ЕСТЬ ЛИ ОНИ И ТО ЛИ НА НИХ СНЯТО.
 *
 * 🔴 ЗАЧЕМ. До 19.08.2026 у карточки в Play не было НИ ОДНОГО снимка в
 * репозитории по пути `store/google-play/screenshots` — описание переписано на
 * двенадцать языков, а показать нечего. На установку картинки влияют сильнее
 * текста: человек листает снимки, а не читает. Снимки сняты скриптом
 * `frontend/scripts/store-shots.mjs` с живой веб-сборки; этот гейт сторожит, что
 * они на месте, годятся для Play и сняты С ПОЛЯ, а не с экрана настройки.
 *
 * ⚠️ ГЛАВНЫЙ ОБМАН, РАДИ КОТОРОГО ГЕЙТ И НАПИСАН. Экран настройки игры («Уровень
 * 1/40», карта уровней, кнопка «Начать») и само игровое поле на снимке выглядят
 * одинаково прилично: заголовок, градиент, кнопки. Подмена не выглядит как
 * ошибка — она выглядит как скриншот, и уезжает в магазин молча. Поэтому:
 *
 *   · скрипт при съёмке ищет МАРКЕР ПОЛЯ (текст, который есть только в партии) и
 *     ЗАПРЕТ (текст экрана настройки), и пишет результат в `shots.json`;
 *   · гейт сверяет sha256 каждого файла с записанным. Подменить картинку и
 *     оставить манифест нельзя: суммы разойдутся. Переписать манифест под чужую
 *     картинку — тоже: скрипт откажется её снимать, а руками сумму считать
 *     придётся осознанно, это уже не «случайно уехало».
 *
 * ⚠️ ЯКОРЯ `GameShell` ЗДЕСЬ НЕ ТРЕБУЮТСЯ, И ЭТО НЕ ПОСЛАБЛЕНИЕ. `game-toolbar`
 * и `game-header-actions` есть у 62 игр из 71, но шесть из семи новых
 * (dots-connect, one-line, faces-names, object-tracker, navigator, rhythm-pitch)
 * нарисованы своим каркасом и этих якорей не имеют — проверено grep'ом по
 * `app/games/*.tsx` 19.08.2026. Требовать их значило бы краснеть на исправных
 * играх, а ложное срабатывание хуже отсутствия проверки: гейт, который врёт,
 * перестают читать, и вместе с придуманной поломкой он пропускает настоящую.
 * Якоря МЫ ПИШЕМ В МАНИФЕСТ как есть; когда каркас доедет до новых игр —
 * поднять `SHELL_EXPECTED` ниже и начать их требовать.
 *
 * ТРЕБОВАНИЯ PLAY (сверено по support.google.com/googleplay/android-developer/answer/9866151
 * 19.08.2026 — они менялись, поэтому проверено, а не по памяти): JPEG или
 * 24-битный PNG без альфы, до 8 МБ; сторона 320…3840 px; длинная сторона не
 * больше двух коротких; от 2 до 8 снимков НА ТИП УСТРОЙСТВА.
 */
declare const __dirname: string;
declare function require(m: string): any;
// Тип Node в проекте не подключён (tsconfig без "types": ["node"]), а разбор PNG
// без Buffer не написать. Объявляем ровно то, чем пользуемся, — как выше сделано
// с __dirname и require.
type NodeBuf = Uint8Array & { copy(target: NodeBuf, targetStart?: number, sourceStart?: number, sourceEnd?: number): number };
declare const Buffer: {
  concat(list: Uint8Array[]): NodeBuf;
  alloc(size: number): NodeBuf;
};
const { readFileSync, existsSync, readdirSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
const { inflateSync } = require('zlib');

const ROOT: string = join(__dirname, '../../..');
const LANG = 'ru';
const DIR: string = join(ROOT, 'store', 'google-play', 'screenshots', LANG);
const MANIFEST: string = join(DIR, 'shots.json');

/**
 * СЕМЬ НОВЫХ ИГР — обязательный минимум набора. Без снимка новую игру в карточке
 * не видно вовсе: тексты про неё написаны, а показать нечего.
 */
const REQUIRED_GAMES = [
  'dots_connect', 'one_line', 'faces_names', 'object_tracker',
  'navigator', 'rhythm_pitch', 'memory_palace',
];

/** Спецификация Play. Те же числа стоят в `scripts/store-shots.mjs`. */
const PLAY = {
  MIN_SIDE: 320,
  MAX_SIDE: 3840,
  MAX_RATIO: 2,
  MAX_BYTES: 8 * 1024 * 1024,
  MAX_IN_LISTING: 8,
  MIN_IN_LISTING: 2,
};

/**
 * ПУСТОТУ МЕРЯЕМ ПО ПИКСЕЛЯМ, А НЕ ПО ВЕСУ ФАЙЛА — и вот почему.
 *
 * 🔴 Первая редакция гейта считала пустым кадр легче 25 КБ: «PNG жмёт
 * однородность почти в ничто». Проверка поломкой её и убила. Одноцветная
 * заливка 1080×1920, сделанная sharp с настройками по умолчанию, весит 32 КБ —
 * гейт пропустил её молча, а самый лёгкий НАСТОЯЩИЙ снимок набора весит 45 КБ.
 * Полоса между «пусто» и «нормально» шириной в 13 КБ — это не проверка, это
 * совпадение: другой уровень сжатия, другая заливка — и порог врёт в любую
 * сторону. Вес файла вообще не про содержимое.
 *
 * Поэтому кадр РАСПАКОВЫВАЕТСЯ и считаются цвета. У заливки цвет один, у
 * снимка приложения — сотни. Замер 19.08.2026 по набору: беднее всех
 * rhythm-pitch (тёмная тема, три кнопки) — 234 цвета, богаче всех каталог —
 * 16 668. Порог 60 оставляет четырёхкратный запас у самого бедного: гейт не
 * должен краснеть на честном тёмном экране.
 */
const MIN_COLOURS = 60;
/** И ни один цвет не должен покрывать почти весь кадр — это та же заливка. */
const MAX_DOMINANT_SHARE = 0.97;

/**
 * Игры, у которых на поле обязаны быть якоря каркаса `GameShell`. Пока пусто —
 * ни одна из семи новых каркас не использует (кроме memory-palace, но и он
 * рисует поле своим). Игра, переехавшая на каркас, дописывается сюда, и тогда
 * гейт начинает требовать якоря с неё.
 */
const SHELL_EXPECTED: string[] = [];

interface Shot {
  id: string;
  file: string;
  kind: 'game' | 'app';
  gameId: string | null;
  route: string;
  why: string;
  inListing: boolean;
  width: number;
  height: number;
  channels: number;
  bytes: number;
  sha256: string;
  onField: boolean;
  fieldMarker: string;
  forbidPattern: string;
  forbidHit: string | null;
  shell: { toolbar: boolean; headerActions: boolean };
  buttons: number;
  textLen: number;
  steps: string[];
  lang: string;
  capturedAt: string;
}

/** Ширина/высота/глубина/тип цвета берём из заголовка PNG — без библиотек. */
function readPngHeader(buf: any): { width: number; height: number; bitDepth: number; colourType: number } {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) throw new Error('файл не PNG — подпись не совпала');
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('в PNG нет заголовка IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colourType: buf[25],   // 2 = truecolour без альфы = «24-битный PNG», как требует Play
  };
}

/**
 * Разбор пикселей PNG без библиотек: zlib встроен в Node, а разжать и снять
 * фильтры — тридцать строк. Тянуть ради этого зависимость в тесты не за чем.
 *
 * Работает только с типом цвета 2 при глубине 8 — ровно тем, который требует
 * Play и который проверяет соседний тест. Другой формат сюда не доедет: он
 * покраснеет раньше.
 *
 * Считаем не все пиксели, а каждый 8-й в каждой 4-й строке: на 1080×1920 это
 * 32 тысячи проб — достаточно, чтобы отличить заливку от экрана, и в разы
 * быстрее полного прохода.
 */
function colourStats(buf: any): { colours: number; dominantShare: number } {
  const idat: any[] = [];
  let off = 8;
  let width = 0;
  let height = 0;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 3;                                   // тип цвета 2, глубина 8
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const counts = new Map<number, number>();
  let total = 0;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    if (rowStart + stride >= raw.length + 1) break;
    const filter = raw[rowStart];
    raw.copy(cur, 0, rowStart + 1, rowStart + 1 + stride);
    // Снятие фильтров по спецификации PNG: 0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth.
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        add = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = (cur[i] + add) & 0xff;
    }
    if (y % 4 === 0) {
      for (let x = 0; x < width; x += 8) {
        const i = x * bpp;
        const key = (cur[i] << 16) | (cur[i + 1] << 8) | cur[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total++;
      }
    }
    cur.copy(prev);
  }
  let top = 0;
  counts.forEach((n) => { if (n > top) top = n; });
  return { colours: counts.size, dominantShare: total ? top / total : 1 };
}

const manifestExists = existsSync(MANIFEST);
const manifest = manifestExists ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { shots: [] };
const shots: Shot[] = manifest.shots ?? [];

describe('снимки карточки Google Play', () => {
  it('манифест на месте и не пуст', () => {
    // Без манифеста дальше проверять нечего, и молчать об этом нельзя: зелёный
    // гейт на пустой папке — ровно то враньё, из-за которого карточка и осталась
    // без картинок.
    expect(manifestExists ? MANIFEST : 'манифеста нет — сними набор: node scripts/store-shots.mjs').toBe(MANIFEST);
    expect(shots.length).toBeGreaterThan(0);
  });

  it('у каждой из семи новых игр есть снимок игрового поля', () => {
    const have = new Set(shots.filter((s) => s.kind === 'game').map((s) => s.gameId));
    const missing = REQUIRED_GAMES.filter((g) => !have.has(g));
    expect(missing.join(', ') || 'все на месте').toBe('все на месте');
  });

  it('файлы на диске совпадают с манифестом — байт в байт', () => {
    const bad: string[] = [];
    for (const s of shots) {
      const file = join(DIR, s.file);
      if (!existsSync(file)) { bad.push(`${s.id}: файла ${s.file} нет`); continue; }
      const buf = readFileSync(file);
      if (buf.length !== s.bytes) { bad.push(`${s.id}: ${buf.length} байт на диске против ${s.bytes} в манифесте`); continue; }
      const sum = createHash('sha256').update(buf).digest('hex');
      // Расхождение суммы = картинку подменили, а манифест оставили. Именно так
      // в магазин уезжает снимок экрана настройки вместо поля.
      if (sum !== s.sha256) bad.push(`${s.id}: sha256 разошлась — файл подменён после съёмки`);
    }
    expect(bad.join('\n') || 'совпадают').toBe('совпадают');
  });

  it('размер и формат каждого файла проходят требования Play', () => {
    const bad: string[] = [];
    for (const s of shots) {
      const file = join(DIR, s.file);
      if (!existsSync(file)) continue;                   // отсутствие ловит проверка выше
      const buf = readFileSync(file);
      let head;
      try { head = readPngHeader(buf); } catch (e: any) { bad.push(`${s.id}: ${e.message}`); continue; }

      const min = Math.min(head.width, head.height);
      const max = Math.max(head.width, head.height);
      if (head.width !== s.width || head.height !== s.height) {
        bad.push(`${s.id}: в файле ${head.width}×${head.height}, в манифесте ${s.width}×${s.height}`);
      }
      if (min < PLAY.MIN_SIDE) bad.push(`${s.id}: короткая сторона ${min} < ${PLAY.MIN_SIDE}`);
      if (max > PLAY.MAX_SIDE) bad.push(`${s.id}: длинная сторона ${max} > ${PLAY.MAX_SIDE}`);
      if (max > min * PLAY.MAX_RATIO) bad.push(`${s.id}: ${max}/${min} — длинная сторона больше двух коротких`);
      if (buf.length > PLAY.MAX_BYTES) bad.push(`${s.id}: ${buf.length} байт > ${PLAY.MAX_BYTES}`);
      // Play принимает «24-битный PNG без альфы» — это тип цвета 2 при глубине 8.
      // Playwright отдаёт RGBA (тип 6), поэтому альфу снимает скрипт; проверяем,
      // что снял, а не «наверное снял».
      if (head.colourType !== 2 || head.bitDepth !== 8) {
        bad.push(`${s.id}: PNG тип цвета ${head.colourType}/глубина ${head.bitDepth} — Play ждёт 24-битный без альфы (2/8)`);
      }
    }
    expect(bad.join('\n') || 'по требованиям Play').toBe('по требованиям Play');
  });

  it('ни один снимок не пустой', () => {
    const bad: string[] = [];
    for (const s of shots) {
      const file = join(DIR, s.file);
      if (!existsSync(file)) continue;
      // Проверка НА ДИСКЕ, независимая от манифеста: распаковываем и считаем цвета.
      const { colours, dominantShare } = colourStats(readFileSync(file));
      if (colours < MIN_COLOURS) {
        bad.push(`${s.id}: во всём кадре ${colours} цветов — это заливка, а не экран приложения`);
      }
      if (dominantShare > MAX_DOMINANT_SHARE) {
        bad.push(`${s.id}: ${(dominantShare * 100).toFixed(1)}% кадра одного цвета — экран не отрисовался`);
      }
      // И то же самое со стороны съёмки: экран без текста — не экран приложения.
      if (s.textLen < 60) bad.push(`${s.id}: на экране было ${s.textLen} символов текста — приложение не отрисовалось`);
      if (s.buttons < 2) bad.push(`${s.id}: на экране было ${s.buttons} кнопок — приложение не отрисовалось`);
    }
    expect(bad.join('\n') || 'все с содержимым').toBe('все с содержимым');
  });

  it('снимки игр сделаны с ПОЛЯ, а не с экрана настройки', () => {
    const bad: string[] = [];
    for (const s of shots.filter((x) => x.kind === 'game')) {
      // Доказательство поля собрано в момент съёмки и лежит рядом со снимком.
      if (!s.onField) bad.push(`${s.id}: не помечен как снятый с поля`);
      if (!s.fieldMarker || s.fieldMarker.length < 3) {
        bad.push(`${s.id}: маркера поля нет — доказательства, что снята партия, не осталось`);
      }
      if (s.forbidHit) {
        bad.push(`${s.id}: при съёмке на экране был запрещённый текст «${s.forbidHit}» — это экран настройки/правил`);
      }
      if (!s.forbidPattern) bad.push(`${s.id}: не записано, что именно было запрещено — проверка не доказуема`);
      // Игра без карты уровней в кадре — это поле. Обратное («Уровень 1/40»)
      // означает карту уровней экрана настройки и в снимок игры попасть не может.
      if (/Уровень \d+\/\d+/.test(s.fieldMarker)) {
        bad.push(`${s.id}: маркером поля записана карта уровней «${s.fieldMarker}» — это экран настройки`);
      }
      if (SHELL_EXPECTED.includes(s.gameId ?? '') && !s.shell.toolbar && !s.shell.headerActions) {
        bad.push(`${s.id}: игра заявлена на каркасе GameShell, а якорей в момент съёмки не было`);
      }
    }
    expect(bad.join('\n') || 'все с поля').toBe('все с поля');
  });

  it('для карточки помечено от 2 до 8 снимков — лимит Play на тип устройства', () => {
    const n = shots.filter((s) => s.inListing).length;
    expect(`${n} помечено`).toBe(`${Math.min(Math.max(n, PLAY.MIN_IN_LISTING), PLAY.MAX_IN_LISTING)} помечено`);
  });

  it('в папке нет снимков мимо манифеста', () => {
    if (!existsSync(DIR)) return;
    const onDisk: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.png'));
    const known = new Set(shots.map((s) => s.file));
    // Подброшенный руками файл — снимок без доказательства: неизвестно, что на
    // нём и откуда он взялся. Либо снимать скриптом, либо удалять.
    const stray = onDisk.filter((f) => !known.has(f));
    expect(stray.join(', ') || 'нет').toBe('нет');
  });

  it('у каждого снимка записано, зачем он в наборе', () => {
    // Кадр без обоснования через месяц никто не оспорит: непонятно, менять его,
    // выкидывать или он единственный, что продаёт функцию.
    const bad = shots.filter((s) => !s.why || s.why.length < 25).map((s) => s.id);
    expect(bad.join(', ') || 'у всех').toBe('у всех');
  });
});
