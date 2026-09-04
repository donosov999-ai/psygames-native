/*
 * eslint-disable @typescript-eslint/no-require-imports — типов node в проекте нет,
 * остальные гейты читают файлы так же.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { petFrame, petAnchor, petHasState, petResolveState, type PetState } from '@/src/components/pet/PetSprite';

declare const __dirname: string;

/**
 * 🔴 ПРАЗДНИК И КОРМЛЕНИЕ НАЗЫВАЮТСЯ СВОИМИ ИМЕНАМИ (задача 00218752).
 *
 * Кадров `celebrate` и `eat` нет ещё ни в одном паке — их производит маскот-сервис,
 * и упирается это в чужой бюджет генерации. Но ЗАЯВКА не повод оставлять в коде
 * `jump` там, где по смыслу праздник: «подключу за час, когда кадры появятся»
 * означало бы найти три места в трёх файлах и не забыть ни одного, а забытое
 * молчит — питомец просто прыгает вместо праздника, и это никак не видно.
 *
 * Поэтому замена одна и живёт в `PetSprite`. Проба сторожит обе стороны: что
 * состояние без кадров не роняет отрисовку И что оно опирается на осмысленную
 * замену, а не на первый попавшийся набор.
 */
const СКИНЫ = ['cat', 'robot', 'constellation'] as const;

describe('состояния питомца: celebrate и eat', () => {
  it('🔴 состояние без своих кадров не роняет отрисовку ни в одном скине', () => {
    for (const skin of СКИНЫ) {
      for (const st of ['celebrate', 'eat'] as PetState[]) {
        for (const f of [0, 1, 2, 3, 7, 99]) {
          expect(petFrame(skin, st, f)).toBeTruthy();
          expect(petAnchor(skin, st, f, 'head_top')).toBeTruthy();
        }
      }
    }
  });

  /**
   * ⚠️ 04.09.2026 ЗАМЕНА БОЛЬШЕ НЕ ВЕЗДЕ. Кадры пришли не одновременно: у кота есть
   * и `eat`, и `celebrate`, у робота — только `celebrate`, у созвездия пока ничего.
   * Поэтому проверяется ПРАВИЛО, а не одинаковый ответ: у кого кадры есть — играет
   * своё, у кого нет — берёт осмысленную замену. Прежняя редакция требовала замены
   * ото всех и покраснела бы на первом же пришедшем наборе — что и произошло.
   */
  it('🔴 у кого кадры есть — играет своё; у кого нет — осмысленная замена', () => {
    for (const skin of СКИНЫ) {
      for (const [st, замена] of [['celebrate', 'jump'], ['eat', 'wave']] as [PetState, PetState][]) {
        const ожидание = petHasState(skin, st) ? st : замена;
        expect(`${skin}/${st} → ${petResolveState(skin, st)}`).toBe(`${skin}/${st} → ${ожидание}`);
      }
    }
  });

  it('пять базовых состояний есть у КАЖДОГО скина своими кадрами', () => {
    for (const skin of СКИНЫ) {
      for (const st of ['walk', 'idle', 'wave', 'jump', 'sleep'] as PetState[]) {
        expect(petHasState(skin, st)).toBe(true);
        expect(petResolveState(skin, st)).toBe(st);
      }
    }
  });

  /**
   * 🔴 КАДРЫ ПРИШЛИ 04.09.2026 — И НЕ ОТ МАСКОТ-СЕРВИСА, А ИЗ СОСЕДНЕГО РЕПОЗИТОРИЯ.
   *
   * Прежняя редакция этой пробы держала «кадров нет» и обещала покраснеть, когда они
   * появятся. Она покраснела — но не потому, что кто-то ответил на заявку 00218752
   * (она висела девять дней), а потому что исходные листы всё это время лежали в
   * `~/dev/mascot-engine-psygames-actions`, в папках `ref` каждого пака. Их не искали.
   *
   * Теперь проба сторожит обратное: набор, который УЖЕ есть, не должен пропасть.
   * Список ниже растёт по мере прихода наборов и никогда не сокращается.
   */
  it('🔴 пришедшие наборы не пропадают', () => {
    expect(petHasState('cat', 'eat')).toBe(true);
    expect(petHasState('cat', 'celebrate')).toBe(true);
    expect(petHasState('robot', 'celebrate')).toBe(true);
  });

  it('🔴 экраны зовут состояния по СМЫСЛУ, а не подставляют замену сами', () => {
    const fs = require('fs');
    const path = require('path');
    const корень = path.resolve(__dirname, '../..');
    const walking = fs.readFileSync(path.join(корень, 'src/components/pet/WalkingPet.tsx'), 'utf8') as string;
    const pet = fs.readFileSync(path.join(корень, 'app/pet.tsx'), 'utf8') as string;
    // Праздник рекорда и кормление — именно те два места из задачи.
    expect(walking).toContain("setSprite('celebrate')");
    expect(pet).toMatch(/feastAnim \? 'eat'/);
  });
});
