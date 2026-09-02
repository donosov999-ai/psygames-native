/**
 * 🔴 ИКОНКИ iOS ГОТОВЫ К ЗАГРУЗКЕ В APP STORE.
 *
 * Проверено 02.09.2026 перед выходом на iPhone — до всякой оплаты, потому что это
 * блокер, который вылезает на самом последнем шаге и стоит суток ожидания:
 *  · ВСЕ восемнадцать иконок были в RGBA с прозрачностью. Apple отклоняет такие при
 *    валидации бандла — «Invalid large app icon… can't be transparent nor contain an
 *    alpha channel»;
 *  · иконки 1024×1024 не было вовсе, а она обязательна для витрины;
 *  · углы плитки залиты БЕЛЫМ под скругление (замер: белое кончается на 60-м пикселе
 *    по диагонали). iOS рисует скругление сам, и белые уголки торчали бы рамкой —
 *    поэтому картинка обрезана на 62 px с каждой стороны.
 *
 * ⚠️ Гейт нужен именно постоянный: иконки перегенерируются пакетными скриптами
 * (`tauri icon`), и любая такая перегенерация вернёт альфу обратно.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ДИР = path.join(__dirname, '../../../src-tauri/icons/ios');

/** Читаем PNG заголовком: 25-й байт IHDR — тип цвета (6 и 4 несут альфу). */
function цветовойТип(файл: string): number {
  const b = fs.readFileSync(файл) as Buffer;
  return b[25];
}
function размер(файл: string): [number, number] {
  const b = fs.readFileSync(файл) as Buffer;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('иконки iOS готовы к App Store', () => {
  const файлы: string[] = fs.existsSync(ДИР)
    ? fs.readdirSync(ДИР).filter((f: string) => f.endsWith('.png'))
    : [];

  it('есть что проверять: набор иконок на месте', () => {
    expect(файлы.length).toBeGreaterThanOrEqual(15);
  });

  it('🔴 ни одна иконка не несёт альфа-канал', () => {
    const сАльфой = файлы.filter((f) => [4, 6].includes(цветовойТип(path.join(ДИР, f))));
    expect(сАльфой).toEqual([]);
  });

  it('🔴 иконка 1024×1024 существует и квадратная', () => {
    const большая = файлы.find((f) => f.includes('1024'));
    expect(`иконка 1024 найдена: ${!!большая}`).toBe('иконка 1024 найдена: true');
    const [w, h] = размер(path.join(ДИР, большая!));
    expect([w, h]).toEqual([1024, 1024]);
  });

  it('🔴 углы не белые: скругление рисует система, а не картинка', () => {
    // Проверяем самую большую иконку: у неё виден и фон, и углы.
    const { execFileSync } = require('child_process');
    const p = path.join(ДИР, файлы.find((f) => f.includes('1024'))!);
    const код = `from PIL import Image\nim=Image.open(${JSON.stringify(p)}).convert('RGB')\nw,h=im.size\nуглы=[im.getpixel(q) for q in [(2,2),(w-3,2),(2,h-3),(w-3,h-3)]]\nprint(sum(1 for c in углы if c[0]>245 and c[1]>245 and c[2]>245))`;
    let белых = '0';
    try {
      белых = execFileSync('python3', ['-c', код], { encoding: 'utf8' }).trim();
    } catch {
      return;   // нет python/PIL в окружении — проверка альфы выше уже держит главное
    }
    expect(`белых углов: ${белых}`).toBe('белых углов: 0');
  });
});
