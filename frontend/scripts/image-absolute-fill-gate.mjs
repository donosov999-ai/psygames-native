#!/usr/bin/env node
/**
 * 🔴 `absoluteFill` НА `<Image>` В react-native-web НЕ ОГРАНИЧИВАЕТ КАРТИНКУ.
 *
 * `StyleSheet.absoluteFill` даёт `position:absolute; inset:0` — без ширины и
 * высоты. В нативном RN этого хватает, в вебе `<img>` берёт СВОЮ природную
 * ширину и вылезает за родителя. Беда повторилась три раза: плитка маджонга
 * 255 px вместо 44, клетка «Вспышки» 192 px, шар «Одной линии» — отчёт Дениса
 * 05.09.2026 со скриншотом: «что за огромные мега шары, ни хуя не видно».
 *
 * Размер задавать явно: `{ position:'absolute', left:0, top:0, width:'100%',
 * height:'100%' }`.
 */
import { readFileSync, globSync } from 'node:fs';

const файлы = globSync('{app,src}/**/*.{tsx,ts}', { cwd: process.cwd() })
  .filter((f) => !f.includes('__tests__') && !f.includes('node_modules'));

/** Комментарии выкидываем: там `absoluteFill` упоминается как раз в объяснении, почему его нет. */
const безКомментариев = (т) => т.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

const беды = [];
const подложки = [];
let сКартинками = 0;
for (const файл of файлы) {
  const сырой = readFileSync(файл, 'utf8');
  if (!/<Image\b/.test(сырой)) continue;
  сКартинками++;
  const текст = безКомментариев(сырой);
  const строки = текст.split('\n');
  for (let i = 0; i < строки.length; i++) {
    if (!/<Image\b/.test(строки[i])) continue;
    // Элемент кончается на `/>` или `</Image>`; 40 строк — с запасом на длинные стили.
    let окно = '';
    for (let j = i; j < Math.min(строки.length, i + 40); j++) {
      окно += строки[j] + '\n';
      if (/\/>\s*$|<\/Image>/.test(строки[j].trimEnd())) break;
    }
    if (/absoluteFill/.test(окно)) беды.push(`${файл}:${i + 1}`);

    /**
     * 🔴 ВТОРАЯ БЕДА ТОЙ ЖЕ ПРИРОДЫ: КАРТИНКА-ПОДЛОЖКА КРАСИТСЯ ПОВЕРХ SVG.
     *
     * Отчёт NZT-48 06.09.2026 «А где тортики ?»: на тарелках не было ни одного
     * куска. В DOM клинья были — по шесть путей с верной геометрией и цветами,
     * — но `<Image>` подложки красился поверх `<Svg>`. В родном RN порядок
     * отрисовки задаёт порядок в разметке, и картинка, объявленная ПЕРВОЙ,
     * уходит вниз; на вебе (Tauri iOS — вебвью) позиционированный элемент
     * красится выше статичного НЕЗАВИСИМО от порядка. `Image` у
     * react-native-web позиционирован, `svg` — нет.
     *
     * Лечится явным `zIndex` у `Svg`. Здесь ловим сам узор: абсолютная
     * картинка, а следом в том же блоке `<Svg` без `zIndex`.
     */
    if (/position:\s*'absolute'/.test(окно)) {
      const хвост = строки.slice(i, Math.min(строки.length, i + 40)).join('\n');
      const svg = /<Svg\b[^>]*>/.exec(хвост);
      if (svg && !/zIndex/.test(svg[0])) {
        подложки.push(`${файл}:${i + 1} — <Image> с position:absolute, ниже <Svg> без zIndex`);
      }
    }
  }
}

if (подложки.length) {
  console.error('🔴 картинка-подложка закрасит <Svg>: на вебе позиционированное красится выше статичного');
  for (const б of подложки) console.error('   ' + б);
  console.error("\nПоднять рисунок явно: <Svg style={{ position:'relative', zIndex: 1 }}>");
  process.exit(1);
}

if (беды.length) {
  console.error('🔴 absoluteFill в стиле <Image> — картинка не ограничена по ширине:');
  for (const б of беды) console.error('   ' + б);
  console.error("\nЗадать размер явно: { position:'absolute', left:0, top:0, width:'100%', height:'100%' }");
  process.exit(1);
}
console.log(`✓ absoluteFill на <Image> нет и подложка не закрывает <Svg> (файлов с картинками: ${сКартинками} из ${файлы.length})`);
