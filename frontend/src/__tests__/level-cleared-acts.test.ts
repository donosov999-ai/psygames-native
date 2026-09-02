/**
 * 🔴 ИТОГ УРОВНЯ ПРИХОДИТ АКТАМИ — И УСПЕВАЕТ ДО АВТО-ПЕРЕХОДА.
 *
 * Приём «блоки въезжают по очереди» был написан 30.08.2026 внутри `GameResult` и
 * работал только там — на экране КОНЦА ПАРТИИ. А между уровнями человек видит
 * `LevelCleared`, и за сессию тот показывается в разы чаще. 02.09.2026 приём
 * вынесен в общий `juice/Act` и включён в обоих местах.
 *
 * ⚠️ ГЛАВНАЯ ОПАСНОСТЬ ЗДЕСЬ — НЕ КРАСОТА, А ВРЕМЯ. Баннер уровня живёт `autoMs`
 * (≈2,2 с) и сам запускает следующий. Расписание актов, скопированное с финала
 * (до 760 мс + 260 мс въезда), съело бы половину окна: человек увидел бы, как
 * блоки въезжают, — и сразу как они исчезают. Гейт проверяет, что последний акт
 * заканчивается заметно раньше авто-перехода.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('акты на экране «уровень взят»', () => {
  const SRC = read('src/components/LevelCleared.tsx');

  it('приём живёт в одном месте, а не двумя копиями', () => {
    // Общий компонент существует и подключён обоими экранами.
    expect(fs.existsSync(path.join(ROOT, 'src/components/juice/Act.tsx'))).toBe(true);
    expect(SRC).toContain("import Act from '@/src/components/juice/Act'");
    expect(read('src/components/GameResult.tsx')).toContain("import Act from '@/src/components/juice/Act'");
    // И в GameResult не осталось СВОЕЙ реализации: копия разъехалась бы молча.
    expect(read('src/components/GameResult.tsx')).not.toMatch(/function Act\(\{\s*at/);
  });

  it('🔴 акты расставлены по блокам итога, а не по одному', () => {
    const акты = SRC.match(/<Act at=\{ACT\.(\w+)\}/g) ?? [];
    expect(акты.length).toBeGreaterThanOrEqual(5);
    for (const ключ of ['stars', 'earn', 'record']) {
      expect(SRC).toContain(`<Act at={ACT.${ключ}}`);
    }
  });

  it('🔴 последний акт успевает закончиться до авто-перехода', () => {
    const m = /const ACT = \{([^}]+)\}/.exec(SRC);
    expect(m).toBeTruthy();
    const времена = [...m![1].matchAll(/(\w+):\s*(\d+)/g)].map((x) => Number(x[2]));
    expect(времена.length).toBeGreaterThanOrEqual(5);
    // Расписание возрастает: акт «позже» не может стоять раньше акта «раньше».
    for (let i = 1; i < времена.length; i++) expect(времена[i]).toBeGreaterThan(времена[i - 1]);
    const конец = Math.max(...времена) + 260;                     // + длительность въезда
    const auto = Number(/autoMs = (\d+)/.exec(SRC)?.[1] ?? 0);
    expect(auto).toBeGreaterThan(0);
    // Запас на чтение — не меньше секунды: иначе блок «увидел и потерял».
    expect(auto - конец).toBeGreaterThanOrEqual(1000);
  });

  it('щадящий режим показывает всё сразу', () => {
    const act = read('src/components/juice/Act.tsx');
    expect(act).toContain('useReducedMotion');
    expect(act).toMatch(/if \(reduced\)/);
  });
});
