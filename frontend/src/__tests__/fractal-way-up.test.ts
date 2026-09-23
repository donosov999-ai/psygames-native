/* psygames-fractal-way-up · VER 1 · 23.09.2026 */
/**
 * 🔴 ИЗ НИЖНЕЙ СЕТКИ ЕСТЬ ВИДИМЫЙ ПОДЪЁМ НАВЕРХ, А НЕ ТОЛЬКО СТРЕЛКА КАРКАСА.
 *
 * 📍 ПОВОД. Отзыв Дениса `af047c78` (iPhone 403×873, v2.54.22): «Как выйти на уровень
 * обратно фракталы». Подъём существовал: стрелка «назад» в шапке внутри нижней сетки
 * поднимала на карту. Но у ВСЕХ остальных игр та же стрелка значит «выйти из игры», и
 * человек её не трогает, боясь потерять партию, — дверь была, а выглядела как выход.
 *
 * ЧТО СТЕРЕЖЁТ:
 *   · подъём объявлен ОДИН раз (`наКарту`) — иначе два места разъедутся, как разъехались
 *     границы поясов в судоку (гейт «границы поясов живут в одном месте», 23.09);
 *   · значок «На карту» стоит в ряду служебных и показан ТОЛЬКО внутри нижней сетки:
 *     на карте подниматься некуда, а пустышка хуже отсутствия;
 *   · мини-карта «где я сейчас» — нажимаемая и ведёт туда же: человек искал выход там;
 *   · подпись есть во всех двенадцати языках.
 *
 * ⚠️ Живая проверка (экспорт, WebKit 403×873, 23.09): на карте кнопки нет; внутри сетки
 * есть, нажатие возвращает на карту; нажатие на мини-карту — тоже. Здесь закрепляется
 * то, что проверено живьём.
 */
declare const __dirname: string;
const fs = require('fs');                      // eslint-disable-line @typescript-eslint/no-require-imports
const path = require('path');                  // eslint-disable-line @typescript-eslint/no-require-imports

const ЭКРАН: string = fs.readFileSync(path.join(__dirname, '../../app/games/sudoku-fractal.tsx'), 'utf8');
const СЛОВАРЬ: string = fs.readFileSync(path.join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
const ЛОКАЛИ = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

describe('фрактал: выход на уровень выше', () => {
  it('🔴 подъём объявлен один раз и ведёт на карту', () => {
    const объявления = ЭКРАН.split('\n').filter((с) => /const наКарту = \(\)/.test(с));
    expect(`объявлений подъёма: ${объявления.length}`).toBe('объявлений подъёма: 1');
    expect(объявления[0]).toContain("setOpenChild(null)");
    expect(объявления[0]).toContain("setPhase('map')");
  });

  it('🔴 значок «На карту» — в ряду служебных и только внутри нижней сетки', () => {
    const i = ЭКРАН.indexOf("label={t('fractalToMap')}");
    expect(`значок в ряду: ${i > 0}`).toBe('значок в ряду: true');
    const кусок = ЭКРАН.slice(Math.max(0, i - 400), i + 200);
    expect(`показан по условию openChild: ${/openChild !== null \?/.test(кусок)}`)
      .toBe('показан по условию openChild: true');
    expect(`это действие каркаса: ${/<GameAuxAction/.test(кусок)}`).toBe('это действие каркаса: true');
    expect(`жмёт подъём: ${/onPress=\{наКарту\}/.test(кусок)}`).toBe('жмёт подъём: true');
  });

  it('🔴 мини-карта нажимается и ведёт наверх', () => {
    const i = ЭКРАН.indexOf('testID="fractal-minimap"');
    expect(`мини-карта на месте: ${i > 0}`).toBe('мини-карта на месте: true');
    const кусок = ЭКРАН.slice(Math.max(0, i - 400), i + 120);
    expect(`нажимаемая: ${/<Pressable/.test(кусок)}`).toBe('нажимаемая: true');
    expect(`ведёт наверх: ${/onPress=\{наКарту\}/.test(кусок)}`).toBe('ведёт наверх: true');
    expect(`чтецу названа: ${/accessibilityLabel=\{t\('fractalToMap'\)\}/.test(кусок)}`)
      .toBe('чтецу названа: true');
  });

  it('🔴 подпись «На карту» есть во всех двенадцати языках', () => {
    const нет: string[] = [];
    if (!/fractalToMap: \{ ru: '[^']+', en: '[^']+' \}/.test(СЛОВАРЬ)) нет.push('ru/en');
    for (const л of ЛОКАЛИ) {
      const файл: string = fs.readFileSync(path.join(__dirname, `../contexts/translations/${л}.ts`), 'utf8');
      if (!/"fractalToMap":\s*"[^"]+"/.test(файл)) нет.push(л);
    }
    expect(`без подписи: ${нет.join(',') || 'нет'}`).toBe('без подписи: нет');
  });
});
