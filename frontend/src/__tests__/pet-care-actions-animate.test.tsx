/* psygames-pet-care-actions-animate · VER 1 · 11.09.2026 */
/**
 * У КАЖДОГО ДЕЙСТВИЯ ЗАБОТЫ СВОИ КАДРЫ, А НЕ ЧУЖИЕ.
 *
 * 📍 Денис 11.09.2026: «это из кнопок только кадры еды есть, других тоже нет».
 * Было ХУЖЕ, чем он прочитал: один флаг `feastAnim` включали ВСЕ три кнопки, а
 * рисовал он `eat` и выкладывал лакомство. То есть на «погладить» и «помыть» кот
 * принимался ЖЕВАТЬ — не «кадров нет», а чужие кадры на всех.
 *
 * Кадры лежали в паке всё это время. Замер 11.09.2026 по `assets/images/pet/cat`:
 * тридцать девять состояний по семь кадров, среди них ровно нужные — `groom`
 * (умывается), `wiggle` (ёрзает), `tailchase`, `dance`, `cheer`.
 *
 * ⚠️ Проба смотрит на КАДРЫ, а не на имена состояний в исходнике: подставить в
 * `state` можно что угодно, важно, что за этим есть картинки и что они РАЗНЫЕ у
 * разных действий.
 */
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { petHasState, petResolveState } = require('@/src/components/pet/PetSprite');

/** Действие экрана `/pet` → состояние, которым оно рисуется. */
const ДЕЙСТВИЯ: { кнопка: string; состояние: string }[] = [
  { кнопка: 'покормить', состояние: 'eat' },
  { кнопка: 'помыть', состояние: 'groom' },
  { кнопка: 'погладить', состояние: 'wiggle' },
];

describe('действия заботы анимируются по-своему', () => {
  it('🔴 у кота под каждое действие есть СВОИ кадры, и их не меньше четырёх', () => {
    const плохо: string[] = [];
    for (const д of ДЕЙСТВИЯ) {
      if (!petHasState('cat', д.состояние)) { плохо.push(`${д.кнопка}: у кота нет кадров ${д.состояние}`); continue; }
      const файлы = fs.readdirSync(path.resolve(__dirname, '../../assets/images/pet/cat'))
        .filter((n: string) => new RegExp(`^${д.состояние}\\d+\\.webp$`).test(n));
      if (файлы.length < 4) плохо.push(`${д.кнопка}: кадров ${файлы.length}`);
    }
    expect(плохо).toEqual([]);
  });

  /**
   * ⚠️ СРАВНИВАЕМ ФАЙЛЫ НА ДИСКЕ, А НЕ ОТВЕТ `petFrame`. Первая редакция звала
   * `petFrame('cat', состояние, 0)` и требовала три разных значения — и была
   * КРАСНОЙ там, где код верен: под jest `require()` картинки отдаёт заглушку, одну
   * и ту же для всех ассетов, так что три разных состояния давали одно значение.
   * Проба мерила мок сборщика, а не кадры.
   */
  it('🔴 три действия рисуются ТРЕМЯ разными наборами кадров', () => {
    const папка = path.resolve(__dirname, '../../assets/images/pet/cat');
    const наборы = ДЕЙСТВИЯ.map((д) => fs.readdirSync(папка)
      .filter((n: string) => new RegExp(`^${д.состояние}\\d+\\.webp$`).test(n)).sort().join(','));
    expect(наборы.filter((x: string) => !x)).toEqual([]);
    expect(new Set(наборы).size).toBe(3);
  });

  it('🔴 экран /pet зовёт именно эти состояния, а не один флаг на всех', () => {
    const экран = fs.readFileSync(path.resolve(__dirname, '../../app/pet.tsx'), 'utf8');
    // Старый флаг ушёл: он и был причиной «кот жуёт, когда его гладят».
    // ⚠️ Ищем ОБРАЩЕНИЯ к нему, а не слово: в объяснении выше оно упомянуто нарочно.
    expect(экран).not.toMatch(/setFeastAnim|\{feastAnim|feastAnim \?/);
    for (const д of ДЕЙСТВИЯ) {
      expect(экран).toContain(`'${д.состояние}'`);
    }
    // Лакомство — только к еде.
    expect(экран).toMatch(/active=\{действие === 'eat'\}/);
  });

  it('🔴 у обликов без своих кадров есть осмысленная замена, а не пустота', () => {
    const плохо: string[] = [];
    for (const облик of ['robot', 'constellation']) {
      for (const д of ДЕЙСТВИЯ) {
        const разрешено = petResolveState(облик, д.состояние);
        if (!petHasState(облик, разрешено)) плохо.push(`${облик}/${д.состояние} → ${разрешено}: кадров нет`);
      }
    }
    expect(плохо).toEqual([]);
  });
});
