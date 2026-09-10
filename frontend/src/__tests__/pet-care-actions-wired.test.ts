/* psygames-pet-care-actions-wired · VER 1 · 10.09.2026 */
/**
 * ЧЕТЫРЕ ДЕЙСТВИЯ ЗАБОТЫ ДОХОДЯТ ДО ИГРОКА, А НЕ ЛЕЖАТ В СЛУЖБЕ.
 *
 * 🔴 ПОВОД. Экран питомца писал «Пора помыть — неделя без мытья», а помыть было
 * НЕЧЕМ: `markWashed()` объявлена в `services/pet.ts` и не вызывалась ниоткуда —
 * проверено грепом по `src` и `app` 10.09.2026, единственное вхождение было само
 * объявление. Человеку показывали упрёк без способа его снять. Механизм написали,
 * до игрока не довели — тот же класс, что уже записан в память проекта.
 *
 * ⚠️ ПОЧЕМУ «ПОИГРАТЬ» ВЕДЁТ В ИГРУ, А НЕ ДВИГАЕТ ШКАЛУ. Настроение и здоровье
 * считаются по `daysSincePlay`, а он берётся из РЕАЛЬНЫХ сессий (`getSessions`,
 * pet.ts). Кнопка, поднимающая шкалу сама, была бы обманом: питомец повеселел бы,
 * а тренировки не случилось. Проба это и сторожит.
 */
declare const __dirname: string;
const { readFileSync } = require('fs');   // eslint-disable-line @typescript-eslint/no-require-imports
const { join } = require('path');         // eslint-disable-line @typescript-eslint/no-require-imports

const экран = () => readFileSync(join(__dirname, '../../app/pet.tsx'), 'utf8');
const служба = () => readFileSync(join(__dirname, '../services/pet.ts'), 'utf8');

describe('действия заботы подключены', () => {
  it('есть что проверять — экран и служба на месте', () => {
    expect(экран().length).toBeGreaterThan(1000);
    expect(служба()).toContain('export async function markWashed');
  });

  it('🔴 мытьё вызывается С ЭКРАНА, а не только объявлено в службе', () => {
    expect(экран()).toContain('markWashed()');
  });

  it('🔴 на экране четыре действия заботы: угостить, помыть, погладить, поиграть', () => {
    const с = экран();
    const нет = ['petFeed', 'petWash', 'petStroke', 'petPlay'].filter((к) => !с.includes(`t('${к}')`));
    expect(нет).toEqual([]);
  });

  it('🔴 «поиграть» уводит в игры, а не поднимает шкалу на месте', () => {
    const с = экран();
    const i = с.indexOf("t('petPlay')");
    // Обработчик кнопки стоит выше её подписи в том же элементе.
    const кусок = с.slice(Math.max(0, i - 900), i + 200);
    expect(кусок).toContain('router.push');
    // Шкала настроения не должна двигаться отсюда: её считает служба по сессиям.
    expect(кусок).not.toContain('markPlayed');
  });

  it('🔴 мытьё не бесконечное: повторное в тот же день недоступно', () => {
    const с = экран();
    expect(с).toContain('мытьДоступно');
    expect(с).toMatch(/disabled=\{!мытьДоступно\}/);
  });
});
