#!/usr/bin/env node
// УКАЗАТЕЛЬ ЗАПИСЕЙ ДЛЯ НАТИВНЫХ ЭКРАНОВ — БЕРЁТСЯ У ВЕБ-СТОРОНЫ, А НЕ СОБИРАЕТСЯ ЗАНОВО.
//
// 🔴 ПОЧЕМУ ТАК. Корпус записей живёт на psy-games.pro (1442 синтезированных семпла и
// 988 живых записей людей из Викисловаря), а рядом с кодом лежит только УКАЗАТЕЛЬ
// «слово → имя файла»: frontend/src/constants/voiceIndex.generated.ts и voiceLive.generated.ts,
// которые пишет scripts/gen_voice_samples.py. Завести для Flutter второй указатель значит
// завести второй источник правды и второе место, где он протухнет.
//
// 🔴 ИМЯ ФАЙЛА БЕРЁТСЯ ИЗ УКАЗАТЕЛЯ, А НЕ СТРОИТСЯ ИЗ СЛОВА. На сервере файлы названы
// хешем: «аэропорт» → c88ffb9f1d5b61e9.opus. Первая редакция голосового слоя складывала
// адрес из самого слова и была неправа — и пробы этого не поймали, потому что проверяли
// перенос той же формулой, которой он делался. Поэтому указатель переносится ЦЕЛИКОМ.
//
// 🔴 ПОЧЕМУ ЗАПИСЬ В ASSETS, А НЕ В КОД. Указатель — 100 КБ данных на семь языков. Данные
// в исходнике раздувают сборку Dart и попадают в каждый разбор анализатором; ассет читается
// один раз при первом обращении к звуку и только для нужного языка.
//
// ⚠️ ВЛОЖЕННЫЕ КАТАЛОГИ АССЕТОВ НЕ ПОПАДАЮТ В СБОРКУ САМИ. Строка `- assets/voice/` берёт
// только файлы самой папки. Здесь всё лежит ПЛОСКО, ровно поэтому; проба
// flutter/test/assets_bundled_test.dart сверяет диск с настоящим AssetManifest.
//
// Запуск: node flutter/tools/embed-voice-index.mjs   (из любого места)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const ROOT = join(FLUTTER, '..');
const CONST = join(ROOT, 'frontend', 'src', 'constants');
const OUT = join(FLUTTER, 'assets', 'voice');

/** Достать объект из строки `export const ИМЯ: тип = {…};` — без eval и без импорта TS. */
function вынуть(файл, имя) {
  const текст = readFileSync(join(CONST, файл), 'utf8');
  const метка = `export const ${имя}`;
  const начало = текст.indexOf(метка);
  if (начало < 0) throw new Error(`${файл}: не нашёл ${имя}`);
  const скобка = текст.indexOf('{', начало);
  let глубина = 0;
  for (let i = скобка; i < текст.length; i += 1) {
    if (текст[i] === '{') глубина += 1;
    else if (текст[i] === '}') {
      глубина -= 1;
      if (глубина === 0) {
        // ⚠️ В TS висячая запятая перед `}` законна, в JSON — нет. Замер 23.09: разбор
        // падал на позиции 33666 файла voiceLive.generated.ts ровно на ней.
        const кусок = текст.slice(скобка, i + 1).replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(кусок);
      }
    }
  }
  throw new Error(`${файл}: у ${имя} не закрылась скобка`);
}

const live = вынуть('voiceLive.generated.ts', 'VOICE_LIVE');
const samples = вынуть('voiceIndex.generated.ts', 'VOICE_INDEX');
// 🔴 БУКВЫ — ОТДЕЛЬНОЕ ПРОСТРАНСТВО ИМЁН, А НЕ ЕЩЁ ОДИН ЯЗЫК. У слов ключ уникален внутри
// языка, а буква «B» столкнулась бы с осмысленным словом «b» в любом словаре, где оно есть.
// В вебе ровно поэтому своя функция letterVoiceUrl и свой каталог /voice-live/letters/.
const letters = вынуть('letterVoice.generated.ts', 'LETTER_VOICE');

const счёт = (карта) =>
  Object.fromEntries(Object.entries(карта).map(([язык, слова]) => [язык, Object.keys(слова).length]));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'voice-index.json'), JSON.stringify({ live, samples, letters }), 'utf8');

const итогЖивых = Object.values(счёт(live)).reduce((a, b) => a + b, 0);
const итогСемплов = Object.values(счёт(samples)).reduce((a, b) => a + b, 0);
console.log('✅ assets/voice/voice-index.json');
console.log(`   живых записей ${итогЖивых} по языкам:`, счёт(live));
console.log(`   синтезированных ${итогСемплов} по языкам:`, счёт(samples));
console.log(`   имён букв ${Object.keys(letters).length}:`, Object.keys(letters).join(' '));
