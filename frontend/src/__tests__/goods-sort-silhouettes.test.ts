/**
 * НАБОР ПО УМОЛЧАНИЮ НЕ ДОЛЖЕН СОСТОЯТЬ ИЗ ОДИНАКОВЫХ СИЛУЭТОВ.
 *
 * 🔴 ЗАЧЕМ. В «Миксе» лежала ВСЯ молочка (23…31) плюс базовые кефир, молоко и
 * йогурт — двенадцать позиций с одним силуэтом бутылки, различимых только
 * оттенком этикетки. Игрок путал их не потому, что задача трудная, а потому что
 * предметы не читаются: шесть пар-двойников в наборе, который видит каждый
 * новичок.
 *
 * ⚠️ У «Молочного» правило ПЕРЕВЁРНУТО намеренно: там неразличимость и есть
 * суть набора (`alike: true`). Гейт обязан это учитывать, иначе он потребует
 * сломать единственную игру, ради которой набор существует.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { GOOD_SETS } from '@/src/games/goods-sort/core/level';

declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

/**
 * Двойники по виду — БЕЛЫЕ МОЛОЧНЫЕ бутылки. Задано руками по спрайтам.
 *
 * ⚠️ Первая редакция списка считала двойниками все бутылки подряд, включая колу,
 * лимонад и соки, и требовала оставить в «Миксе» три штуки из восьми. Это
 * неверно: цветной напиток отличим с одного взгляда — путаются именно светлые
 * молочные, у которых совпадают и форма, и цвет, а разнится только этикетка.
 * Кола и сок остаются: они держат тему магазина и никого не путают.
 */
const MILKY = [2, 3, 5, 23, 24, 25, 26, 27, 28, 29, 30, 31];

describe('силуэты в наборах', () => {
  it('есть что проверять: наборы на месте и «Микс» первый', () => {
    expect(GOOD_SETS.length).toBeGreaterThan(3);
    expect(GOOD_SETS[0].key).toBe('mix');
  });

  it('🔴 в «Миксе» не больше трёх молочных — иначе это набор двойников', () => {
    const mix = GOOD_SETS.find((s) => s.key === 'mix')!;
    const milky = mix.pool.filter((t) => MILKY.includes(t));
    // Было двенадцать: шесть пар, которые новичок путает не из-за трудности.
    expect(`молочных в миксе: ${milky.length}`).toBe('молочных в миксе: 3');
  });

  it('🔴 девять бутылок «Молочного» ушли из набора по умолчанию', () => {
    const mix = GOOD_SETS.find((s) => s.key === 'mix')!;
    const dairyOnly = [23, 24, 25, 26, 27, 28, 29, 30, 31];
    expect(mix.pool.filter((t) => dairyOnly.includes(t))).toEqual([]);
  });

  it('«Молочное» их сохранило: там неразличимость — суть набора', () => {
    const dairy = GOOD_SETS.find((s) => s.key === 'dairy')!;
    expect(dairy.pool.length).toBeGreaterThanOrEqual(9);
    expect(dairy.alike).toBe(true);
  });

  it('«Микс» не обеднел: тем по-прежнему много', () => {
    const mix = GOOD_SETS.find((s) => s.key === 'mix')!;
    expect(mix.pool.length).toBeGreaterThanOrEqual(30);
  });
});

/**
 * ПОДПИСЬ НИШИ НАЗЫВАЕТ ПРЕПЯТСТВИЕ.
 *
 * 🔴 Замок, цепь со счётчиком и примёрзший ряд нарисованы поверх ниши — зрячий
 * видит их сразу. Незрячему не сообщалось ничего: подпись говорила «Полка 6:
 * пусто», человек выбирал её и получал отказ без причины. Пустая и запертая
 * звучали одинаково, хотя ведут себя по-разному.
 */
describe('скринридер знает про препятствия', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'goods-sort.tsx'), 'utf8');
  const dict = fs.readFileSync(path.join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');

  it('🔴 подпись ниши собирает состояние, а не только товар', () => {
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(/const obstacleWord = /.test(clean)).toBe(true);
    // Все три вида препятствия названы словом из словаря.
    for (const key of ['a11yShelfBlocked', 'a11yShelfOpensIn', 'a11yShelfFrozen']) {
      expect(`${key}: ${clean.includes(key)}`).toBe(`${key}: true`);
    }
    // И состояние попадает в саму подпись, а не лежит без дела.
    expect(/const cellLabel[\s\S]{0,400}state \?/.test(clean)).toBe(true);
  });

  it('слова препятствий есть в словаре', () => {
    for (const key of ['a11yShelfBlocked', 'a11yShelfOpensIn', 'a11yShelfFrozen']) {
      expect(`${key}: ${dict.includes(`${key}:`)}`).toBe(`${key}: true`);
    }
  });
});
