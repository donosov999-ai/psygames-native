/**
 * @jest-environment jsdom
 */
/**
 * СОВЕТ ПО СЛАБОМУ МЕСТУ ЖИВЁТ НЕ ДОЛЬШЕ НЕДЕЛИ И НЕ ВЕДЁТ В ЗАКРЫТОЕ.
 *
 * 🔴 ЗАЧЕМ. Основание «здесь пока слабее всего» в блоке «рекомендуем сегодня»
 * считалось ТОЛЬКО по оценке — формальному тесту с z-баллами раз в три месяца.
 * Пока оценки нет (а её нет почти всегда), основание не участвовало. Разбор
 * зарядки отвечает на тот же вопрос по свежим данным и подставляется запасным.
 *
 * ⚠️ ТРИ СПОСОБА СДЕЛАТЬ ИЗ ЭТОГО ВРАНЬЁ, И ВСЕ ТИХИЕ:
 *  1. Советовать по просадке месячной давности — совет выглядит персональным, а
 *     относится к делу, которого человек уже не помнит.
 *  2. Советовать упражнение, закрытое профилю — совет упереться в стену.
 *  3. Советовать РАЗВИЛКУ вместо упражнения — блок заполняется меню; этим уже
 *     обжигались 04.09, когда развилок стало двенадцать.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveWeakSkill, loadWeakSkill, gameForWeakSkill, СВЕЖЕСТЬ_ДНЕЙ } from '@/src/services/weakSkill';
import { GAMES } from '@/src/constants/games';
import type { Разбор } from '@/src/services/warmupBreakdown';

declare function require(m: string): any;
declare const __dirname: string;

const разбор = (skillKey: string | null): Разбор => ({
  навыки: skillKey ? [{ skillKey, delta: -30, игр: 2 }] : [],
  лучший: null,
  худший: skillKey ? { skillKey, delta: -30, игр: 2 } : null,
  безИстории: 0,
});

/** Навык, у которого в каталоге есть хотя бы одно НЕ-хабовое упражнение. */
const НАВЫК = GAMES.find((g) => !g.hub && !g.sandbox && g.skillKey)!.skillKey!;

describe('совет по слабому месту', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('🔴 свежая запись читается, протухшая — стирается', async () => {
    const снято = new Date('2026-09-01T10:00:00');
    await saveWeakSkill(разбор(НАВЫК), снято);
    const свежо = await loadWeakSkill(new Date('2026-09-03T10:00:00'));
    expect(свежо?.skillKey).toBe(НАВЫК);
    const старо = new Date(снято.getTime() + (СВЕЖЕСТЬ_ДНЕЙ + 1) * 86400000);
    expect(await loadWeakSkill(старо)).toBeNull();
    // и стёрлась насовсем, а не «не показалась разок»
    expect(await loadWeakSkill(new Date('2026-09-03T10:00:00'))).toBeNull();
  });

  it('🔴 нет провала — прошлая запись стирается, а не остаётся висеть', async () => {
    await saveWeakSkill(разбор(НАВЫК), new Date('2026-09-01T10:00:00'));
    await saveWeakSkill(разбор(null), new Date('2026-09-02T10:00:00'));
    expect(await loadWeakSkill(new Date('2026-09-02T12:00:00'))).toBeNull();
  });

  it('🔴 закрытое профилю не советуется', () => {
    const место = { skillKey: НАВЫК, delta: -30, date: '2026-09-03' };
    expect(gameForWeakSkill(место, new Set())).toBeNull();
  });

  it('🔴 советуется упражнение, а не развилка — по ВСЕМ навыкам каталога', () => {
    /**
     * ⚠️ ПО ВСЕМ, А НЕ НА ОДНОМ ПРИМЕРЕ. Первая редакция брала один навык, и у него
     * развилка случайно не оказывалась первой в каталоге — мутация «советовать и
     * развилки» проходила зелёной. Развилка делит `skillKey` со своими пробами,
     * поэтому промах виден только на том навыке, где она стоит раньше.
     */
    const всё = new Set(GAMES.map((g) => g.id));
    const навыки = [...new Set(GAMES.map((g) => g.skillKey).filter(Boolean))] as string[];
    const развилки: string[] = [];
    let советов = 0;
    for (const skillKey of навыки) {
      const id = gameForWeakSkill({ skillKey, delta: -30, date: '2026-09-03' }, всё);
      if (!id) continue;
      советов += 1;
      const g = GAMES.find((x) => x.id === id)!;
      if (g.hub) развилки.push(`${skillKey} → ${g.id}`);
      expect(g.skillKey).toBe(skillKey);
    }
    expect(развилки).toEqual([]);
    // и проверка не слепа: советы вообще были
    expect(`навыков с советом: ${советов > 5}`).toBe('навыков с советом: true');
  });

  it('🔴 сыгранное сегодня не советуется второй раз', () => {
    const место = { skillKey: НАВЫК, delta: -30, date: '2026-09-03' };
    const всё = new Set(GAMES.map((g) => g.id));
    const первый = gameForWeakSkill(место, всё)!;
    const второй = gameForWeakSkill(место, всё, new Set([первый]));
    expect(второй).not.toBe(первый);
  });

  it('🔴 ответ не прыгает: тот же вход — тот же совет', () => {
    const место = { skillKey: НАВЫК, delta: -30, date: '2026-09-03' };
    const всё = new Set(GAMES.map((g) => g.id));
    expect(gameForWeakSkill(место, всё)).toBe(gameForWeakSkill(место, всё));
  });

  it('🔴 оценка идёт первой, разбор — запасным', () => {
    const fs = require('fs');
    const path = require('path');
    const экран: string = fs.readFileSync(path.join(__dirname, '../../app/index.tsx'), 'utf8');
    const iОценка = экран.indexOf('weakestDomainGame()');
    const iРазбор = экран.indexOf('loadWeakSkill()');
    expect(`оценка найдена: ${iОценка >= 0}`).toBe('оценка найдена: true');
    expect(`разбор найден: ${iРазбор >= 0}`).toBe('разбор найден: true');
    expect(`оценка раньше разбора: ${iОценка < iРазбор}`).toBe('оценка раньше разбора: true');
  });
});
