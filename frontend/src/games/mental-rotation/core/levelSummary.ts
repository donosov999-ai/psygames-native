/* psygames-mental-rotation-level-summary · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961, «описание проверь» */
import type {MentalRotationStrings} from './i18n';
import {interpolateMentalRotation} from './i18n';
import {rotationLevelSpec} from './levels';

/**
 * 🔴 ОПИСАНИЕ УРОВНЯ НА ЭКРАНЕ НАСТРОЙКИ — ОДНО НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ (16.09.2026).
 *
 * Было две ветки. Русскому показывалась рабочая заметка ядра `change`:
 * «4 кубиков: X90° → Y90°/180°, три варианта.» — с ошибкой согласования и записью
 * осей для разработчика. Остальным одиннадцати — «4–4 cubes · X+Y axes · oblique»:
 * «4–4», потому что у уровня теперь ровно одно число кубиков, и «oblique» там,
 * где на самом деле поворот по двум осям.
 *
 * Числа — из спецификации уровня. Углы — те же, что `buildRotationTask` кладёт
 * в `angleSum`: путь уровня по 90° за шаг, и в половине заданий последний шаг
 * повторяется ещё раз. Проба `mental-rotation-level-summary` сверяет это
 * с настоящими заданиями, а не с этим комментарием.
 */
export function levelSummary(level:number,strings:MentalRotationStrings):string{
  const s=rotationLevelSpec(level),осей=new Set(s.path).size;
  const поворот=interpolateMentalRotation(осей===1?strings.levelTurnFlat:strings.levelTurnDepth,{a:90*s.path.length,b:90*(s.path.length+1)});
  return [
    interpolateMentalRotation(strings.levelCubes,{n:s.cubes}),
    interpolateMentalRotation(strings.levelOptions,{n:s.optionCount}),
    поворот,
    s.foil==='one-cube'?strings.levelFoilOneCube:'',
  ].filter(Boolean).join(' · ');
}
