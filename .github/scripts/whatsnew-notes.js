/* psygames-whatsnew-notes · VER 1 · 19.08.2026 */
/**
 * ЧТЕНИЕ «ЧТО НОВОГО» ДЛЯ КАРТОЧКИ МАГАЗИНА — один разбор на выкладку и на гейт.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. Разбор жил внутри скрипта выкладки, и проверить его
 * до релиза было нечем: ошибка вылезала на последнем шаге, когда сборки под все
 * платформы уже готовы. 19.08.2026 так и вышло — выкладка встала на «нет записи
 * для 1.206.1», хотя запись была. Теперь этот же разбор зовёт гейт перед сборкой.
 *
 * ⚠️ ПОЧЕМУ ОШИБКА БЫЛА ВРАНЬЁМ. Строки в `whatsNew.ts` бывают и в одинарных
 * кавычках, и в двойных (двойные удобны, когда внутри апостроф). Разбор понимал
 * только одинарные: запись находилась, а её строки — нет, и наружу шло «записи
 * нет». Отличать «нет записи» от «есть, но не прочиталась» обязательно: это две
 * разные починки, и час уходит на поиск не там.
 */
const fs = require('fs');
const path = require('path');

const WHATS_NEW = path.join(__dirname, '../../frontend/src/constants/whatsNew.ts');

/** Строки массива: и 'одинарные', и "двойные". Экранированные кавычки внутри допускаются. */
function stringsIn(block, lang) {
  /**
   * ⚠️ ПЕРЕНОС СТРОКИ НЕ ЧАСТЬ ПРАВИЛА. Здесь стояло `\n\s*\],` — то есть массив
   * обязан был кончаться на отдельной строке. Запись 2.34.1, написанная в одну
   * строку (`ru: ['…'],`), — совершенно правильный JS, — не прочиталась, и гейт
   * доложил «ни ru, ни en не прочитались: проверь кавычки и запятые». Кавычки были
   * в порядке; ошибка была в проверке.
   *
   * Ложное срабатывание на исправной записи стоит дороже пропуска: оно посылает
   * искать несуществующую опечатку. Ищем закрывающую скобку с любым пробельным
   * разделителем.
   */
  const m = block.match(new RegExp(`${lang}:\\s*\\[([\\s\\S]*?)\\]\\s*,`));
  if (!m) return null;
  const items = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
    .map((x) => (x[1] ?? x[2]).replace(/\\(['"])/g, '$1'));
  return items.length ? items : null;
}

/**
 * @returns {{ru: string[], en: string[]} | {error: string}}
 * Никогда не возвращает пустоту молча: у неудачи есть причина, и она читаемая.
 */
function extractNotes(version, file = WHATS_NEW) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf(`version: '${version}'`);
  if (at === -1) return { error: `в whatsNew.ts нет записи для ${version}` };

  const next = src.indexOf("version: '", at + 10);
  const block = next === -1 ? src.slice(at) : src.slice(at, next);

  const ru = stringsIn(block, 'ru');
  const en = stringsIn(block, 'en');
  if (!ru && !en) return { error: `запись ${version} есть, но ни ru, ни en не прочитались — проверь кавычки и запятые в массивах` };
  if (!ru) return { error: `у записи ${version} не прочитался ru` };
  if (!en) return { error: `у записи ${version} не прочитался en` };
  return { ru, en };
}

/** Жёсткий лимит Google на язык. */
const PLAY_NOTES_LIMIT = 500;

/** Пункты → текст карточки, ровно столько, сколько влезает. */
function format(items, limit = PLAY_NOTES_LIMIT) {
  const out = [];
  let len = 0;
  for (const item of items) {
    const line = `• ${item}`;
    if (len + line.length + 1 > limit) break;
    out.push(line);
    len += line.length + 1;
  }
  return out.join('\n');
}

module.exports = { extractNotes, format, PLAY_NOTES_LIMIT, WHATS_NEW };
