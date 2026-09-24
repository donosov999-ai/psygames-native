/* psygames-test-router-mock · VER 1 · 23.09.2026 */
/**
 * ОБЩИЙ ФИКТИВНЫЙ РОУТЕР ДЛЯ ПРОБ, КОТОРЫЕ ПОДНИМАЮТ ЭКРАН ЦЕЛИКОМ.
 *
 * 🔴 ПОВОД. 23.09.2026 анаграммы начали зеркалить режим в адрес
 * (`роутер.setParams({ mode })`, коммит d359c068 — без этого все четыре игры за
 * одним адресом показывали одну справку). Правка экрана верная, а main покраснел
 * на трёх наборах сразу: `warmup-word-language` держал свой рукописный роутер из
 * трёх методов, `anagram-classic-langs` и `anagram-classic-lock` не держали
 * никакого. Каждый новый метод роутера ломал бы их снова.
 *
 * 🔴 ПОЭТОМУ СПИСОК НЕ ПЕРЕПИСАН РУКАМИ, А СНЯТ С САМОГО `expo-router`. Внутри
 * `useRouter.js` лежит объект `routerWithWarnings` — полный перечень методов
 * роутера этой версии. Читаем его и раздаём заглушки по именам оттуда: подняли
 * версию, появился метод — он появится и здесь, без правки этого файла.
 *
 * ⚠️ Если перечень не нашёлся — БРОСАЕМ, а не подставляем короткий запасной
 * список. Молчаливый запасной список и есть та самая беда: проба остаётся
 * зелёной, а экран в приложении зовёт метод, которого в пробе никогда не было.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const ИСТОЧНИК = path.join(
  __dirname, '..', '..', 'node_modules', 'expo-router', 'build', 'hooks', 'useRouter.js',
);

/** Имена методов роутера, как их объявляет сам expo-router. */
export function методыРоутера(): string[] {
  const код: string = fs.readFileSync(ИСТОЧНИК, 'utf8');
  const блок = /const routerWithWarnings = \{([\s\S]*?)\n\};/.exec(код);
  if (!блок) throw new Error(`не нашёл routerWithWarnings в ${ИСТОЧНИК} — expo-router сменил форму, поправь мок`);
  const имена = Array.from(блок[1].matchAll(/^\s{4}([A-Za-z]\w*):/gm)).map((m) => m[1]);
  if (имена.length < 8) throw new Error(`в routerWithWarnings нашлось ${имена.length} методов — слишком мало, разбери ${ИСТОЧНИК}`);
  return имена;
}

/**
 * Роутер-пустышка со ВСЕМИ методами. `canGoBack`/`canDismiss` отдают false —
 * у настоящего роутера вне навигации они тоже false, и экраны на это опираются.
 */
export function фиктивныйРоутер(): Record<string, any> {
  const r: Record<string, any> = {};
  for (const имя of методыРоутера()) r[имя] = /^can/.test(имя) ? () => false : () => {};
  return r;
}

/**
 * Готовый мок ВСЕГО модуля `expo-router` для проб, поднимающих экран целиком.
 *
 * Перечень вывозимого снят с приложения (23.09.2026, `grep "from 'expo-router'"`
 * по `src` и `app`): Redirect · Stack · router · useFocusEffect ·
 * useGlobalSearchParams · useLocalSearchParams · usePathname · useRouter.
 * Появится новое — добавлять СЮДА, а не рукописным объектом в своей пробе:
 * рукописные и разъехались 23.09, из-за чего main покраснел на трёх наборах.
 *
 * Зовётся ИЗНУТРИ фабрики `jest.mock`, поэтому и файл читается лениво:
 *   jest.mock('expo-router', () => require('./routerMockShared').мокМодуляРоутера());
 * Параметры адреса подставляются своей функцией, если пробе они важны:
 *   мокМодуляРоутера({ параметры: () => ({ mode: 'square' }), путь: '/games/anagrams' })
 */
export function мокМодуляРоутера(опции: {
  параметры?: () => Record<string, unknown>;
  путь?: string;
} = {}): Record<string, any> {
  const параметры = опции.параметры ?? (() => ({}));
  const путь = опции.путь ?? '/';
  const роутер = фиктивныйРоутер();
  return {
    router: роутер,
    useRouter: () => роутер,
    useLocalSearchParams: () => параметры(),
    useGlobalSearchParams: () => параметры(),
    usePathname: () => путь,
    useFocusEffect: () => {},
    Stack: { Screen: () => null },
    Redirect: () => null,
  };
}
