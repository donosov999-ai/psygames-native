/*
 * eslint-disable @typescript-eslint/no-require-imports — типов node в проекте нет,
 * остальные гейты читают файлы так же.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { petFrame, petAnchor, petHasState, petResolveState, type PetState } from '@/src/components/pet/PetSprite';

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

  it('🔴 замена ОСМЫСЛЕННАЯ: праздник берёт кульбит, кормление — помахивание', () => {
    for (const skin of СКИНЫ) {
      expect(petResolveState(skin, 'celebrate')).toBe('jump');
      expect(petResolveState(skin, 'eat')).toBe('wave');
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

  it('🔴 celebrate и eat пока НЕ имеют своих кадров — это честный признак, а не догадка', () => {
    // Когда кадры появятся в паках, эта проба покраснеет — и её надо будет
    // перевернуть на `toBe(true)`. Красное здесь означает «пришли кадры», а не поломку.
    for (const skin of СКИНЫ) {
      expect(petHasState(skin, 'celebrate')).toBe(false);
      expect(petHasState(skin, 'eat')).toBe(false);
    }
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
