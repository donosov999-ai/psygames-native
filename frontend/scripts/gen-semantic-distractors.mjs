// Генератор умных дистракторов для «Сортировки слов» (semantic-sort, V3).
// Офлайн-предрасчёт: эмбеддинги считаются ОДИН раз через brainkit (bge-m3, 37.60.245.18),
// в приложение попадает готовая таблица src/data/semantic-distractors.ts.
//
// Для каждого слова словаря TRANSLATION_VOCAB (в каждом из 7 языков) берём топ похожих
// по cosine слов ТОГО ЖЕ языка из ДРУГИХ категорий — это «коварные» дистракторы:
// игра мапит их обратно в категории и подсовывает семантически близкие варианты ответа.
// Ключ таблицы — "<lang>:<слово>" (без префикса языка ключи бы коллизили: es/pt "casa").
// На категорию — не больше PER_CAT_CAP слов, чтобы в топ-8 попадало ≥3 разных категорий.
//
// Запуск: node scripts/gen-semantic-distractors.mjs
// Эндпоинт: POST {BRAINKIT_EMBED_URL | http://37.60.245.18:8080/embed} {"texts": [...]}
//   → {"model": "BAAI/bge-m3", "embeddings": [[...1024]]}
// Если brainkit недоступен — пишет пустую заглушку (только если таблицы ещё нет) и падает с exit 1.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../src/constants/translationVocab.ts');
const OUT = join(__dirname, '../src/data/semantic-distractors.ts');
const EMBED_URL = process.env.BRAINKIT_EMBED_URL || 'http://37.60.245.18:8080/embed';
const TOP_N = 8;        // слов-дистракторов на целевое слово
const PER_CAT_CAP = 3;  // максимум слов одной категории в топе (гарантия ≥3 разных категорий)
const BATCH = 32;       // текстов на один запрос /embed
const RETRIES = 4;      // повторы запроса при сетевых сбоях (CPU-хост может резать коннект)

// ── словарь игры: тот же источник, что у semantic-sort (TRANSLATION_VOCAB) ──
function loadVocab() {
  const src = readFileSync(SRC, 'utf8');
  const m = src.match(/export const TRANSLATION_VOCAB[^=]*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error(`TRANSLATION_VOCAB не найден в ${SRC}`);
  return new Function(`return ${m[1]};`)(); // чистый литерал данных (объекты строк + комменты)
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function embed(texts) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(EMBED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      });
      if (!r.ok) throw new Error(`embed HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      if (!Array.isArray(d.embeddings) || d.embeddings.length !== texts.length) {
        throw new Error('embed: неожиданный формат ответа (нет embeddings нужной длины)');
      }
      return { model: d.model, embeddings: d.embeddings };
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) {
        console.warn(`  embed попытка ${attempt}/${RETRIES} не удалась (${e.message}), повтор...`);
        await sleep(2000 * attempt);
      }
    }
  }
  throw lastErr;
}

function writeStubIfMissing(reason) {
  if (existsSync(OUT)) {
    console.error(`Существующая таблица ${OUT} НЕ тронута.`);
    return;
  }
  writeFileSync(
    OUT,
    `// АВТОСГЕНЕРИРОВАНО скриптом scripts/gen-semantic-distractors.mjs — НЕ ПРАВИТЬ РУКАМИ.\n` +
      `// TODO: заглушка — brainkit /embed был недоступен при генерации (${reason}).\n` +
      `// Перегенерировать: node scripts/gen-semantic-distractors.mjs\n` +
      `// Пустая таблица безопасна: игра падает в фолбэк — случайные категории, как раньше.\n\n` +
      `export const SEMANTIC_DISTRACTORS: Record<string, string[]> = {};\n`,
  );
  console.error(`Записана пустая заглушка ${OUT}.`);
}

async function main() {
  const vocab = loadVocab();
  const langs = [...new Set(vocab.flatMap((e) => Object.keys(e)))].filter((k) => k !== 'cat');
  console.log(`Словарь: ${vocab.length} статей, языки: ${langs.join(' ')}`);

  // прогрев/проверка доступности — чтобы честно упасть до основной работы
  const probe = await embed(['ping']);
  console.log(`brainkit ок: ${EMBED_URL} → ${probe.model}, dim=${probe.embeddings[0].length}`);

  const table = {};
  let model = probe.model;
  let words = 0;
  let pairs = 0;

  for (const lang of langs) {
    // слова языка с категорией; дубликаты внутри языка отбрасываем (первая статья выигрывает)
    const entries = [];
    const seen = new Set();
    for (const e of vocab) {
      const w = e[lang];
      if (!w || !e.cat || seen.has(w)) continue;
      seen.add(w);
      entries.push({ w, cat: e.cat });
    }

    const vecs = [];
    for (let i = 0; i < entries.length; i += BATCH) {
      const res = await embed(entries.slice(i, i + BATCH).map((e) => e.w));
      model = res.model || model;
      vecs.push(...res.embeddings);
    }
    const norms = vecs.map((v) => {
      let s = 0;
      for (let k = 0; k < v.length; k++) s += v[k] * v[k];
      return Math.sqrt(s);
    });

    for (let i = 0; i < entries.length; i++) {
      const sims = [];
      for (let j = 0; j < entries.length; j++) {
        if (entries[j].cat === entries[i].cat) continue; // только ДРУГИЕ категории
        const a = vecs[i], b = vecs[j];
        let dot = 0;
        for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
        sims.push([dot / (norms[i] * norms[j]), j]);
      }
      sims.sort((x, y) => y[0] - x[0]);
      const picked = [];
      const perCat = {};
      for (const [, j] of sims) {
        const c = entries[j].cat;
        if ((perCat[c] || 0) >= PER_CAT_CAP) continue;
        perCat[c] = (perCat[c] || 0) + 1;
        picked.push(entries[j].w);
        if (picked.length >= TOP_N) break;
      }
      if (picked.length) {
        table[`${lang}:${entries[i].w}`] = picked;
        words += 1;
        pairs += picked.length;
      }
    }
    console.log(`  ${lang}: ${entries.length} слов`);
  }

  const lines = Object.entries(table).map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  writeFileSync(
    OUT,
    `// АВТОСГЕНЕРИРОВАНО скриптом scripts/gen-semantic-distractors.mjs — НЕ ПРАВИТЬ РУКАМИ.\n` +
      `// Перегенерация: node scripts/gen-semantic-distractors.mjs (нужен доступ к brainkit /embed).\n` +
      `// Модель: ${model} · сгенерировано: ${new Date().toISOString().slice(0, 10)}\n` +
      `// Ключ "<lang>:<слово>" → топ-${TOP_N} похожих слов ТОГО ЖЕ языка из ДРУГИХ категорий\n` +
      `// (cosine, ≤${PER_CAT_CAP} слов на категорию). semantic-sort мапит слова → категории-дистракторы.\n\n` +
      `export const SEMANTIC_DISTRACTORS: Record<string, string[]> = {\n${lines.join('\n')}\n};\n`,
  );
  console.log(`Готово: ${OUT}`);
  console.log(`Слов в таблице: ${words}, пар слово→дистрактор: ${pairs}`);
}

main().catch((e) => {
  console.error(`ОШИБКА генерации: ${e.message}`);
  writeStubIfMissing(e.message);
  process.exit(1);
});
