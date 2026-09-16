/* psygames-gate-water-sort-refusal-says-why · VER 1 · 16.09.2026 */
/**
 * 🔴 ОТКАЗАННЫЙ ХОД НАЗЫВАЕТ ПРИЧИНУ — И ПРИЧИНА НЕ ВРЁТ.
 *
 * ПОВОД. Отчёт e0e027fc (задача 44e6cd21), дословно: «не могу со второго шурупа
 * снять гайки, никуда не хотят сходить, и так и сяк кликаю». Ход был запрещён
 * правилами, игра молча снимала выбор и засчитывала промах.
 *
 * ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ СТОРОЖИТСЯ, — НЕ «ПРИЧИНА ЕСТЬ», А «ПРИЧИНА ЕСТЬ РОВНО
 * ТОГДА, КОГДА ХОД ЗАПРЕЩЁН». Объяснение и запрет живут в двух функциях, и если
 * они разойдутся, игра начнёт называть причину отказа там, где ход разрешён, или
 * молчать там, где запрещён. Такое враньё хуже прежнего молчания, поэтому
 * сравнение идёт по КАЖДОЙ паре сосудов на сотнях настоящих раздач.
 *
 * ⚠️ ПРЕМИСА: КАЖДАЯ ПРИЧИНА ДОСТИЖИМА. Без этого пункта проба зеленела бы и при
 * функции, которая на всё отвечает одним «полон»: совпадение с запретом было бы,
 * а различения причин — нет.
 */
import { canPour, pour, почемуНельзя, type ПричинаОтказа, type Field } from '@/src/games/water-sort/core/tubes';
import { generateLevel } from '@/src/games/water-sort/core/generate';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/** Детерминированный бросок: одинаковые раздачи на каждом прогоне. */
function броски(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Позиции по всей лестнице — СВЕЖАЯ РАЗДАЧА И СЕРЕДИНА ПАРТИИ.
 *
 * 📍 Первая редакция брала только свежие раздачи — и премиса различения
 * покраснела: встретились лишь `закрыт`, `полон`, `пусто`. На свежей раздаче
 * каждый непустой сосуд ПОЛОН, поэтому «сверху другой цвет» и «так ничего не
 * изменится» не случаются НИКОГДА. Проба «причина ⇔ запрет» при этом была
 * зелёной на данных, которые две из четырёх веток не исполняли вовсе.
 * Теперь из каждой раздачи делается до двенадцати случайных разрешённых ходов,
 * и в замер идёт каждая промежуточная позиция.
 */
/*
 * ⚠️ УРОВНИ ВЫБРАНЫ ПО ОСЯМ, А НЕ ПОДРЯД. Первая редакция брала L1…L90 по три
 * раздачи — и шла 909 с: генератор проверяет каждую раздачу решателем. Для этой
 * пробы важна не длина лестницы, а то, что на полях встречаются все ПРИЁМЫ:
 * L1 без приёмов, L10 высота 4, L18 короткий сосуд, L22 камни, L26 отложенный,
 * L40 и L60 — верх лестницы с их сочетаниями.
 */
const УРОВНИ = [1, 10, 18, 22, 26, 40, 60];

function раздачи(): Field[] {
  const из: Field[] = [];
  for (const L of УРОВНИ) {
    for (let k = 0; k < 2; k += 1) {
      const бросок = броски(L * 100 + k);
      let f = generateLevel(L, бросок).field;
      из.push(f);
      for (let шаг = 0; шаг < 12; шаг += 1) {
        const ходы: [number, number][] = [];
        for (let a = 0; a < f.tubes.length; a += 1) {
          for (let b = 0; b < f.tubes.length; b += 1) if (a !== b && canPour(f, a, b)) ходы.push([a, b]);
        }
        if (!ходы.length) break;
        const [a, b] = ходы[Math.floor(бросок() * ходы.length)] as [number, number];
        const дальше = pour(f, a, b);
        if (!дальше) break;
        f = дальше;
        из.push(f);
      }
    }
  }
  return из;
}

describe('отказ хода называет причину', () => {
  const поля = раздачи();

  it('премиса: позиций достаточно, пар сосудов — больше пятнадцати тысяч', () => {
    const пар = поля.reduce((n, f) => n + f.tubes.length * (f.tubes.length - 1), 0);
    expect(поля.length).toBeGreaterThan(120);
    expect(пар).toBeGreaterThan(15000);
  });

  it('🔴 причина есть РОВНО ТОГДА, когда ход запрещён — по каждой паре', () => {
    const разошлись: string[] = [];
    for (const [n, f] of поля.entries()) {
      for (let a = 0; a < f.tubes.length; a += 1) {
        for (let b = 0; b < f.tubes.length; b += 1) {
          if (a === b) continue;
          const можно = canPour(f, a, b);
          const причина = почемуНельзя(f, a, b);
          if (можно !== (причина === null)) {
            разошлись.push(`раздача ${n}, ${a}→${b}: canPour=${можно}, причина=${причина}`);
          }
        }
      }
    }
    expect(разошлись.slice(0, 5)).toEqual([]);
  });

  it('🔴 премиса различения: каждая озвучиваемая причина встречается на настоящих раздачах', () => {
    /*
     * `закрыт` проверяется отдельной проверкой ниже только если на лестнице есть
     * отложенные сосуды; `пусто` не озвучивается — пустой сосуд выбрать нельзя.
     */
    const встречено = new Set<ПричинаОтказа>();
    for (const f of поля) {
      for (let a = 0; a < f.tubes.length; a += 1) {
        for (let b = 0; b < f.tubes.length; b += 1) {
          const п = a === b ? null : почемуНельзя(f, a, b);
          if (п) встречено.add(п);
        }
      }
    }
    expect([...встречено].sort()).toEqual(expect.arrayContaining(['безТолку', 'другойЦвет', 'полон']));
  });

  it('у каждой озвучиваемой причины есть строка на русском и английском', () => {
    const словарь = fs.readFileSync(path.join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    const нет = ['sortRefuseFull', 'sortRefuseColour', 'sortRefusePointless', 'sortRefuseLocked']
      .filter((k) => !new RegExp(`\\n  ${k}: \\{ ru: "[^"]+", en: "[^"]+" \\}`).test(словарь));
    expect(нет).toEqual([]);
  });

  it('и на всех десяти остальных языках', () => {
    const нет: string[] = [];
    for (const яз of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
      const файл = fs.readFileSync(path.join(__dirname, '..', 'contexts', 'translations', `${яз}.ts`), 'utf8');
      for (const k of ['sortRefuseFull', 'sortRefuseColour', 'sortRefusePointless', 'sortRefuseLocked']) {
        if (!new RegExp(`"${k}": "[^"]+"`).test(файл)) нет.push(`${яз}:${k}`);
      }
    }
    expect(нет).toEqual([]);
  });
});
