/**
 * КЛАССИКА НА ЯЗЫКАХ БЕЗ КУРИРОВАННОГО БАНКА.
 *
 * 🔴 ЧТО БЫЛО. Классика кормится из `anagramWords.json` с ключами `ru` и `en`, а
 * экран разруливал остальные строкой `const cl = isRu ? 'ru' : 'en'` — то есть
 * ЛЮБОЙ не-русский язык получал АНГЛИЙСКИЙ банк. Пока режим был заперт на двух
 * языках, это не проявлялось; открыть список, не тронув источник, значило бы
 * показать немцу английские слова под немецкой подписью. Замер 06.09.2026:
 * языков в классике 2, в остальных режимах 8 и 9.
 *
 * 🔴 ЧЕМ ПРОВЕРЯЕМ, ЧТО ЯЗЫК НАСТОЯЩИЙ. Не «список стал длиннее» — этого мало,
 * длиннее он станет и от подмены. Смотрим ДОЛЮ СОВПАДЕНИЯ С АНГЛИЙСКИМ: у живых
 * наборов она 12–27% (родственные написания), у подмены была бы 100%.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { PlayerLevelProvider } from '@/src/contexts/PlayerLevelContext';
import { WarmupProvider } from '@/src/contexts/WarmupContext';
import { WORD_LANG_LABEL } from '@/src/services/wordLanguage';
import { банкКлассики, словаПоДлине } from '@/src/games/anagrams/core/allWords';

/** Латинские языки, которые классика открыла: у них есть свои наборы. */
const ОТКРЫТЫЕ = ['de', 'es', 'fr', 'it', 'pt'] as const;

it('у каждого открытого языка свой банк, а не английский', () => {
  const en = new Set(словаПоДлине('en', 5));
  for (const l of ОТКРЫТЫЕ) {
    const свои = словаПоДлине(l, 5);
    expect(свои.length).toBeGreaterThan(300);
    const доля = свои.filter((w) => en.has(w)).length / свои.length;
    // 100% означало бы, что вернули английский набор под чужой подписью.
    expect(доля).toBeLessThan(0.5);
  }
});

it('слова длины 9 не существует ни у одного набора — это граница данных', () => {
  for (const l of [...ОТКРЫТЫЕ, 'ru', 'en', 'ko', 'ja', 'ar']) {
    expect(словаПоДлине(l, 9)).toHaveLength(0);
  }
});

it('незнакомый язык отдаёт пусто, а не английский', () => {
  expect(словаПоДлине('zz', 5)).toHaveLength(0);
});

it('повторный запрос отдаёт тот же массив — обход набора не гоняется заново', () => {
  expect(словаПоДлине('de', 6)).toBe(словаПоДлине('de', 6));
});

/**
 * 🔴 УРОВЕНЬ 11 НЕ ПРИХОДИТ ПУСТЫМ.
 *
 * `LEVEL_LENGTHS` просит длину 9 на уровнях 11–15, а девятибуквенных слов нет ни
 * у одного набора. Спуск по длине живёт в ядре (`банкКлассики`) ОДНИМ
 * экземпляром — раньше он был написан на экране, а проба повторяла его копией, и
 * мутация «подменить язык английским» прошла мимо обеих.
 */
it('на длине 9 банк не пуст ни у одного открытого языка', () => {
  for (const l of ОТКРЫТЫЕ) {
    const банк = банкКлассики(l, 9);
    expect(банк.length).toBeGreaterThanOrEqual(4);
    expect([...банк[0]].length).toBeLessThanOrEqual(8);
  }
});

/**
 * ⚠️ ВСЁ ВЫШЕ МЕРЯЕТ ЯДРО, А `банкЭкрана` — МОЯ КОПИЯ ОТБОРА, НЕ САМ ОТБОР.
 *
 * Такая проба зеленеет и тогда, когда экран не подключён к ядру вовсе: у меня в
 * разделе это уже случалось. Поэтому ниже экран поднимается по-настоящему и у
 * него спрашивается СПИСОК ЯЗЫКОВ — то, что человек видит кнопками.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- экран грузим лениво, как в соседних экранных пробах
const TestRenderer = require('react-test-renderer');

const МЕТРИКИ = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Подписи языков на экране: ищем по тексту кнопок, подпись у языка своя и не переводится. */
function языкиНаЭкране(root: any): string[] {
  const тексты: string[] = [];
  root.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string') тексты.push(c);
  });
  const все = Object.entries(WORD_LANG_LABEL);
  return все.filter(([, подпись]) => тексты.includes(подпись)).map(([код]) => код);
}

it('классика показывает латинские языки и не показывает ko/ja/ar', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const Экран = require('@/app/games/anagrams').default;
  let root: any;
  await TestRenderer.act(async () => {
    root = TestRenderer.create(
      <SafeAreaProvider initialMetrics={МЕТРИКИ}>
        <ProfileProvider><ThemeProvider><LanguageProvider>
          <PlayerLevelProvider><WarmupProvider><Экран /></WarmupProvider></PlayerLevelProvider>
        </LanguageProvider></ThemeProvider></ProfileProvider>
      </SafeAreaProvider>);
  });
  const видно = языкиНаЭкране(root);
  expect(видно).toEqual(expect.arrayContaining(['ru', 'en', ...ОТКРЫТЫЕ]));
  for (const чужой of ['ko', 'ja', 'ar']) expect(видно).not.toContain(чужой);
});

/**
 * 🔴 САМАЯ ВАЖНАЯ ПРОБА: ЭКРАН РАЗДАЁТ СЛОВА ВЫБРАННОГО ЯЗЫКА, А НЕ АНГЛИЙСКИЕ.
 *
 * ⚠️ ЗАЧЕМ ОТДЕЛЬНО ОТ ВСЕГО ВЫШЕ. Мутация «в банке всегда английский» ВЫЖИЛА,
 * когда проб было пять: ядро проверяло само себя, а экранная проба смотрела лишь
 * СПИСОК языков — список от подмены не меняется. Список и содержимое надо
 * сторожить порознь.
 *
 * 🔴 СЧИТАТЬ НАДО СОВПАДЕНИЕ МУЛЬТИМНОЖЕСТВ, А НЕ СЛОВ, И НА ТОЙ ДЛИНЕ, КОТОРУЮ
 * ИГРАЮТ. Здесь стояло «совпадение 12%, пять партий дают 0,99997» — цифра была
 * взята для СЛОВ длиной 5, а первый уровень играет длину 4 и сравнивать надо
 * НАБОРЫ БУКВ. Замер 06.09.2026 по мультимножествам, длина 4: de 53% · es 51% ·
 * fr 63% · it 62% · pt 45%; длина 5: de 38% · es 37% · fr 48% · it 33% · pt 31%.
 * То есть под подменой почти половина партий выглядела бы «португальской», и
 * прежняя проба ловила её 3 раза из 5 — случайностью, а не устройством.
 *
 * Поэтому проба не полагается на долю совпадений: она требует, чтобы хотя бы
 * один набор букв был португальским И НЕ БЫЛ английским. Под подменой таких не
 * бывает вовсе — признак становится не вероятностным, а различающим. Португальский
 * выбран как язык с наименьшим пересечением из пяти.
 */
it('в партии на португальском плитки складываются в португальское слово', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- экран грузим лениво
  const Экран = require('@/app/games/anagrams').default;
  const ключ = (w: string) => [...w.toUpperCase()].sort().join('');
  const португальские = new Set(банкКлассики('pt', 4).map(ключ));
  expect(португальские.size).toBeGreaterThan(300);

  const текстКнопки = (b: any): string => {
    const o: string[] = [];
    const идти = (x: any) => { if (typeof x === 'string') o.push(x);
      else if (Array.isArray(x)) x.forEach(идти);
      else if (x && x.props) идти(x.props.children); };
    идти(b.props.children); return o.join('');
  };

  const английские = new Set(банкКлассики('en', 4).map(ключ));
  let совпало = 0;
  let толькоПортугальских = 0;
  const ПАРТИЙ = 10;
  for (let i = 0; i < ПАРТИЙ; i++) {
    let root: any;
    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider initialMetrics={МЕТРИКИ}>
          <ProfileProvider><ThemeProvider><LanguageProvider>
            <PlayerLevelProvider><WarmupProvider><Экран /></WarmupProvider></PlayerLevelProvider>
          </LanguageProvider></ThemeProvider></ProfileProvider>
        </SafeAreaProvider>);
    });
    const кнопки = () => root.root.findAll((n: any) => n.props
      && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function', { deep: true });
    const язык = кнопки().find((x: any) => текстКнопки(x).trim() === 'Português');
    expect(язык).toBeTruthy();
    await TestRenderer.act(async () => { язык.props.onPress(); });
    const старт = кнопки().find((x: any) => String(x.props.accessibilityLabel) === 'Start');
    expect(старт).toBeTruthy();
    await TestRenderer.act(async () => { старт.props.onPress(); });

    const плитки: string[] = [];
    root.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
      const c = n.props && n.props.children;
      if (typeof c === 'string' && /^[A-ZÀ-Ý]$/.test(c)) плитки.push(c);
    });
    expect(плитки.length).toBeGreaterThanOrEqual(4);
    const k = ключ(плитки.join(''));
    if (португальские.has(k)) совпало++;
    if (португальские.has(k) && !английские.has(k)) толькоПортугальских++;
  }
  // Каждая партия обязана складываться в португальское слово — это проверка того,
  // что банк вообще осмысленный.
  expect(совпало).toBe(ПАРТИЙ);
  /*
    А это — сам различающий признак: набор букв, которого в английском банке нет.
    Под подменой их ноль по построению. При исправном коде их ожидается больше
    половины (пересечение 45%), так что порог «хотя бы один из десяти» оставляет
    вероятность ложного провала 0,45^10 ≈ 0,03%.
  */
  expect(толькоПортугальских).toBeGreaterThanOrEqual(1);
});
