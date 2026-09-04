/**
 * ЛАКОМСТВО ЕДЕТ В РОТ, А НЕ В СЛУЧАЙНОЕ МЕСТО.
 *
 * Отчёт ca24df45: «угостить надо всё-таки дорисовывать анимацию как он жрёт, без
 * неё особо не смотрится это угостить». Кадров состояния `eat` нет и рисовать их
 * некому, поэтому кормление собрано из имеющегося: лакомство подлетает ко рту по
 * ЯКОРЯМ КАДРА и исчезает.
 *
 * 🔴 ЗДЕСЬ ЛОМАЕТСЯ РОВНО ОДНО — ТОЧКА РТА. Своя константа «рот на 58% высоты»
 * выглядела бы верной на коте и уехала бы на роботе, а при пересъёмке кадров
 * разъехалась бы на всех: этим уже обжигались, когда бабочка у кота оказывалась
 * то на пузе, то на хвосте (репорт Вали 19.08). Поэтому рот ВЫВОДИТСЯ от якорей
 * `eyes` и `neck`, и гейт проверяет, что он между ними у КАЖДОГО облика.
 */
import { ротНаКадре, ЛАКОМСТВО, РОТ_ОТ_ГЛАЗ_К_ШЕЕ } from '@/src/components/pet/PetTreat';
import { FRAME_ANCHORS } from '@/src/components/pet/petAnchors.generated';

declare function require(m: string): any;
declare const __dirname: string;

const ОБЛИКИ = Object.keys(FRAME_ANCHORS) as (keyof typeof FRAME_ANCHORS)[];

describe('лакомство питомца', () => {
  it('есть что проверять: обликов больше одного', () => {
    expect(ОБЛИКИ.length).toBeGreaterThan(1);
  });

  it('🔴 рот у КАЖДОГО облика лежит между глазами и шеей', () => {
    const плохие: string[] = [];
    for (const skin of ОБЛИКИ) {
      const кадры = FRAME_ANCHORS[skin]?.idle;
      if (!кадры?.length) continue;
      const рот = ротНаКадре(skin);
      expect(рот).toBeTruthy();
      const a = кадры[0]!;
      const низ = Math.max(a.eyes.y, a.neck.y);
      const верх = Math.min(a.eyes.y, a.neck.y);
      if (!(рот!.y >= верх && рот!.y <= низ)) плохие.push(`${skin}: рот ${рот!.y} вне [${верх}, ${низ}]`);
      if (рот!.x !== a.eyes.x) плохие.push(`${skin}: рот сместился по горизонтали`);
    }
    expect(плохие).toEqual([]);
  });

  it('🔴 рот НИЖЕ глаз, а не на них: иначе лакомство едет в лоб', () => {
    for (const skin of ОБЛИКИ) {
      const кадры = FRAME_ANCHORS[skin]?.idle;
      if (!кадры?.length) continue;
      const a = кадры[0]!;
      const рот = ротНаКадре(skin)!;
      // шея ниже глаз по построению кадра — значит и рот обязан быть ниже
      expect(`${skin}: шея ниже глаз: ${a.neck.y > a.eyes.y}`).toBe(`${skin}: шея ниже глаз: true`);
      expect(`${skin}: рот ниже глаз: ${рот.y > a.eyes.y}`).toBe(`${skin}: рот ниже глаз: true`);
    }
    expect(РОТ_ОТ_ГЛАЗ_К_ШЕЕ).toBeGreaterThan(0);
    expect(РОТ_ОТ_ГЛАЗ_К_ШЕЕ).toBeLessThan(1);
  });

  it('🔴 у каждого облика своё лакомство', () => {
    const нет = ОБЛИКИ.filter((s) => !ЛАКОМСТВО[s]);
    expect(нет).toEqual([]);
  });

  it('🔴 экран показывает лакомство ровно во время кормления', () => {
    const fs = require('fs');
    const path = require('path');
    const экран: string = fs.readFileSync(path.join(__dirname, '../../app/pet.tsx'), 'utf8');
    expect(экран).toContain('<PetTreat');
    expect(экран).toContain('active={feastAnim}');
  });

  it('🔴 без якорей лакомство не рисуется, а не падает в угол', () => {
    expect(ротНаКадре('несуществующий' as never)).toBeNull();
  });
});
