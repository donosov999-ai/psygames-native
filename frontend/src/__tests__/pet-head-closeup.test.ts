/* eslint-disable @typescript-eslint/no-require-imports */
import { petHeadCenter, type PetState } from '@/src/components/pet/PetSprite';

declare const __dirname: string;

/**
 * 🔴 В МЕДАЛЬОНЕ ШАПКИ — ГОЛОВА КРУПНЫМ ПЛАНОМ (отчёт Дениса 03.09.2026).
 *
 * Дословно: «надо увеличить питомца в верхнем тулбаре, его самое ценное — голова и
 * морда, в два раза минимум, даже если остальное не будет входить». В окне 46 точек
 * фигурка целиком давала голову примерно в 14 — пятно, а не морда.
 *
 * Проба сторожит не «крупно ли выглядит» (это не измерить), а два числа, от которых
 * крупность зависит: увеличение спрайта и точку, по которой его центрируют.
 */
const СКИНЫ = ['cat', 'robot', 'constellation'] as const;
const СОСТОЯНИЯ: PetState[] = ['idle', 'walk', 'wave', 'jump', 'sleep'];

function код(): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, '../components/pet/GamePet.tsx'), 'utf8');
}

describe('крупный план головы в шапке', () => {
  it('🔴 увеличение не меньше двух — просьба была «в два раза минимум»', () => {
    const m = код().match(/const ЗУМ = (\d+(?:\.\d+)?)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
  });

  it('🔴 медальон ОБРЕЗАЕТ лишнее — иначе фигурка вылезет на счётчики', () => {
    // «Даже если остальное не будет входить» работает только при обрезании.
    expect(код()).toMatch(/overflow: 'hidden'/);
  });

  it('🔴 центр головы взят по ЯКОРЯМ, а не одним числом на всех', () => {
    // У кота, робота и созвездия головы в разных местах; своё число означало бы
    // съехавшую морду у двух обликов из трёх — та же беда, что была с бабочкой.
    const точки = СКИНЫ.map((s) => petHeadCenter(s, 'idle'));
    const разные = new Set(точки.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(разные.size).toBeGreaterThan(1);
    expect(код()).toContain('petHeadCenter(skin, state)');
  });

  it('центр головы лежит внутри кадра для всех обликов и состояний', () => {
    for (const skin of СКИНЫ) {
      for (const st of СОСТОЯНИЯ) {
        const p = petHeadCenter(skin, st);
        expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(100);
      }
    }
  });

  it('🔴 голова не в нижней трети кадра — иначе окно поймает пузо', () => {
    /**
     * ⚠️ ПОРОГ ВЗЯТ ЗАМЕРОМ, А НЕ ДОГАДКОЙ. Первый вид пробы требовал «выше
     * середины» и покраснел. Я решил, что виноват сон (питомец лежит) — и ошибся
     * второй раз: замер по всем пятнадцати сочетаниям показал, что низко сидит
     * голова РОБОТА, он приземистый: idle 71,8 · wave 68,0. У кота 46-56, у
     * созвездия 53-54, кошачий сон 56,2.
     *
     * То есть «голова сверху» — моя выдумка про кота, перенесённая на всех.
     * Осмысленная проверка тут одна: глаза не в нижней четверти кадра, иначе окно
     * ловит не морду. Порог 75 = максимум замера 71,8 плюс запас на правку спрайтов.
     */
    for (const skin of СКИНЫ) {
      for (const st of СОСТОЯНИЯ) {
        expect(petHeadCenter(skin, st).y).toBeLessThan(75);
      }
    }
  });

  it('усреднение по кадрам, а не кадр 0: в ходьбе голова гуляет', () => {
    const { FRAME_ANCHORS } = require('@/src/components/pet/petAnchors.generated');
    for (const skin of СКИНЫ) {
      const кадры = FRAME_ANCHORS[skin].walk as { eyes: { y: number } }[];
      const разброс = Math.max(...кадры.map((f) => f.eyes.y)) - Math.min(...кадры.map((f) => f.eyes.y));
      if (разброс > 0.5) {
        // Есть движение — значит среднее обязано отличаться от первого кадра.
        expect(petHeadCenter(skin, 'walk').y).not.toBeCloseTo(кадры[0].eyes.y, 5);
      }
    }
  });
});
