/* psygames-puzzle-canvas-owns-the-touch · VER 1 · 10.09.2026 */
/**
 * ДОСКА ГОЛОВОЛОМКИ ЗАБИРАЕТ КАСАНИЕ СЕБЕ, А НЕ ОТДАЁТ ВЫДЕЛЕНИЮ ТЕКСТА.
 *
 * 🔴 ПОВОД — снимок Дениса 10.09.2026 («Чёт-нечет»): поперёк экрана голубая полоса
 * и синяя точка над подсказкой. Это не артефакт отрисовки, а ВЫДЕЛЕНИЕ ТЕКСТА и его
 * ползунок. Приложение на iOS и Android — Tauri, то есть WebView: долгое нажатие
 * начинает выделять текст и ЗАБИРАЕТ жест себе, до холста он не доходит. Денис:
 * «игры что перенёс не работают, сломана игровая механика… почти все».
 *
 * ⚠️ ДВИЖКИ ПРИ ЭТОМ ЦЕЛЫ, И ЭТО ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО. Прогон моста
 * 10.09.2026 по всем сорока: открываются 40 из 40, на программный тычок отвечают
 * 32, на протяжку — 24, на стрелки — 33. Ломалось наше касание, а не его правила.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ ПО ИСХОДНИКУ, А НЕ ПО ЖИВОМУ ЭКРАНУ. `userSelect` — свойство
 * веб-слоя; в jsdom-окружении проб оно не вычисляется. Живьём проверено на
 * собранном бандле (userSelect: none, touchAction: none, протяжка меняет доску).
 */
declare const __dirname: string;
const { readFileSync } = require('fs');   // eslint-disable-line @typescript-eslint/no-require-imports
const { join } = require('path');         // eslint-disable-line @typescript-eslint/no-require-imports

const код = () => readFileSync(join(__dirname, '../components/PuzzleCanvas.tsx'), 'utf8');

describe('доска головоломки владеет касанием', () => {
  it('есть что проверять — холст на месте', () => {
    expect(код()).toContain('onStartShouldSetResponder');
  });

  it('🔴 выделение текста на доске отключено', () => {
    const с = код();
    expect(с).toContain("userSelect: 'none'");
    // Safari в WebView слушает свой префикс — без него выделение остаётся.
    expect(с).toContain("WebkitUserSelect: 'none'");
  });

  it('🔴 прокрутка и щипок под пальцем на доске отключены', () => {
    expect(код()).toContain("touchAction: 'none'");
  });

  it('🔴 холст принимает полный жест, а не только тычок', () => {
    const с = код();
    for (const событие of ['onResponderGrant', 'onResponderMove', 'onResponderRelease']) {
      expect(с).toContain(событие);
    }
  });
});
