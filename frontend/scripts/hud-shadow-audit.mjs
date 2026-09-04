/* psygames-hud-shadow-audit · VER 1 · 04.09.2026 */
/**
 * ТЕНЬ СЧЁТЧИКА ОБЯЗАНА ПОВТОРЯТЬ ВИДИМУЮ ФИГУРУ, А НЕ ОБЛАСТЬ КАСАНИЯ.
 *
 * ЗАЧЕМ. Отчёт Дениса 03.09.2026 по маджонгу: «верхний тулбар выглядит будто две
 * кнопки». На кадре под каждой цветной пилюлей — белый прямоугольник с тенью
 * почти той же высоты: читается как второй ряд пустых кнопок. Замер вскрыл две
 * причины сразу, и обе невидимы в исходнике:
 *
 *   1. у ряда счётчиков в игре не задан `alignItems`, а по умолчанию флексбокс
 *      ставит `stretch` — все пилюли строки дотягиваются до самой высокой;
 *   2. самая высокая берётся из цели нажатия: пилюля с пояснением обёрнута в
 *      прозрачную область 48 точек (норма Material), сама пилюля — 29.
 *
 * Итого тень обводила 19 точек пустоты под каждым числом. В jest этого не видно:
 * дефект живёт в РАСКЛАДКЕ, а не в разметке. Отсюда браузерный гейт.
 *
 * ЧТО ПРОВЕРЯЕТ. Заходит в партию и для каждого элемента, отбрасывающего тень в
 * плашке счётчиков, требует: высота тени = высоте видимой пилюли внутри неё
 * (допуск 2 точки на скругления). Больше — под пилюлей пустая коробка.
 *
 * Запуск (нужен поднятый веб-билд):
 *   cd ~/dev/psygames/frontend && node scripts/hud-shadow-audit.mjs --base=http://127.0.0.1:8127
 */
import { chromium } from 'playwright';

const арг = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = арг.base ?? 'http://127.0.0.1:8127';
/** Экраны со СВОИМИ рядами счётчиков — каждый рисует их сам, поэтому проверяем несколько. */
const ЭКРАНЫ = ['mahjong', 'picture-pairs', 'memory-matrix'];
const ДОПУСК = 2;

const бр = await chromium.launch();
let провалов = 0;

for (const игра of ЭКРАНЫ) {
  const стр = await бр.newPage({ viewport: { width: 403, height: 873 } });
  try {
    await стр.goto(BASE, { waitUntil: 'domcontentloaded' });
    await стр.evaluate(() => { localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0'); });
    await стр.goto(`${BASE}/games/${игра}`, { waitUntil: 'networkidle' });
    await стр.waitForTimeout(2000);
    /**
     * ⚠️ ВХОД В ПАРТИЮ — ПО ТОЧНОЙ КНОПКЕ. Первая редакция жала по первой попавшейся
     * кнопке со словом «играть» и попадала в подсказку «Не понимаешь, как играть?
     * Правила» — в партию не заходила, счётчиков не видела и печатала зелёное.
     * Мутация это и вскрыла: дефект вернули в сборку, гейт остался доволен.
     */
    // Подсказку правил закрываем ДО входа: она перехватывает нажатие.
    const пон0 = стр.locator('text=Понятно').first();
    if (await пон0.count() && await пон0.isVisible().catch(() => false)) { await пон0.click(); await стр.waitForTimeout(500); }
    const вошли = await стр.evaluate(() => {
      /**
       * ⚠️ ПОДПИСЬ КНОПКИ ЧИСТИМ, А НЕ ПРОСТО trim(). В кнопке «Начать» перед словом
       * стоит невидимый символ от значка, и `String.trim()` его НЕ убирает — из-за
       * этого якорь `^начать$` не совпадал, вход не находился, и гейт зеленел на
       * пустом экране. Оставляем только буквы, цифры, пробелы и тире.
       */
      const чисто = (e) => (e.innerText || '')
        .replace(/[^\p{L}\p{N} \n—-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const кнопки = [...document.querySelectorAll('[role="button"],button')];
      const старт = кнопки.find((e) => /^(начать|играть|start|играть [—-] уровень \d+|уровень \d+ [—-] играть)$/.test(чисто(e)));
      if (!старт) return false;
      старт.click();
      return true;
    });
    if (!вошли) {
      провалов++;
      const кнопки = await стр.evaluate(() => [...document.querySelectorAll('[role="button"],button')].map((e) => (e.innerText || '').trim().slice(0, 24)).filter(Boolean).join(' | '));
      console.log(`❌ ${игра}: не нашёл кнопку входа в партию — проверять нечего. Кнопки: ${кнопки}`);
      continue;
    }
    await стр.waitForTimeout(2500);
    const пон = стр.locator('text=Понятно').first();
    if (await пон.count() && await пон.isVisible().catch(() => false)) { await пон.click(); await стр.waitForTimeout(600); }

    const { плохие, всего } = await стр.evaluate((допуск) => {
      const итог = []; let счёт = 0;
      for (const e of document.querySelectorAll('div')) {
        const s = getComputedStyle(e);
        if (!s.boxShadow || s.boxShadow === 'none') continue;
        const r = e.getBoundingClientRect();
        if (r.height < 12 || r.height > 90 || r.width < 20) continue;   // не пилюля
        /**
         * 🔴 ЕСЛИ ЭЛЕМЕНТ САМ ЗАКРАШЕН — ТЕНЬ ПО НЕМУ И ИДЁТ, ВОПРОСА НЕТ.
         * Первая редакция сравнивала тень с самым высоким ПОТОМКОМ и на
         * починенной сборке ругалась на всё подряд: у здоровой пилюли фон
         * лежит на ней самой, а внутри остаётся только блик в 45% высоты.
         * Дефект — это тень вокруг ПРОЗРАЧНОЙ коробки, внутри которой
         * закрашенная фигура ниже неё.
         */
        const свой = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none';
        if (свой) { счёт++; continue; }
        let видимая = 0;
        for (const c of e.querySelectorAll('div')) {
          const cs = getComputedStyle(c);
          const непрозрачный = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none';
          if (непрозрачный) видимая = Math.max(видимая, c.getBoundingClientRect().height);
        }
        if (!видимая) continue;                                          // тень не вокруг пилюли
        счёт++;
        if (r.height - видимая > допуск) {
          итог.push(`тень ${Math.round(r.height)} при видимой ${Math.round(видимая)} — под фигурой ${Math.round(r.height - видимая)} точек пустоты («${(e.textContent || '').trim().slice(0, 14)}»)`);
        }
      }
      return { плохие: итог, всего: счёт };
    }, ДОПУСК);

    /**
     * 🔴 НОЛЬ НАЙДЕННЫХ — ЭТО КРАСНЫЙ, А НЕ ЗЕЛЁНЫЙ. Гейт, который ничего не
     * измерил, обязан падать: иначе любая поломка входа превращает его в
     * украшение. Число проверенных печатается всегда.
     */
    if (!всего) { провалов++; console.log(`❌ ${игра}: счётчиков с тенью не найдено — гейт ничего не померил`); continue; }
    if (плохие.length) {
      провалов += плохие.length;
      console.log(`❌ ${игра}: ${плохие.length}`);
      плохие.slice(0, 6).forEach((с) => console.log(`   ${с}`));
    } else {
      console.log(`✅ ${игра}: тени по фигуре (проверено ${всего})`);
    }
  } catch (e) {
    console.log(`⚠️ ${игра}: не удалось проверить — ${String(e).slice(0, 120)}`);
  } finally {
    await стр.close();
  }
}
await бр.close();

if (провалов) {
  console.log(`\n🔴 ТЕНЬ ОБВОДИТ ПУСТОТУ: ${провалов} шт. Так тулбар и стал выглядеть «будто две кнопки».`);
  console.log('   Лечение: тень на самой пилюле (styles.pill), обёртка — alignSelf: center (см. HudBadge).');
  process.exit(1);
}
console.log('\n✅ счётчики: тень везде повторяет видимую пилюлю');
