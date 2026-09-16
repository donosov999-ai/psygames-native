/* psygames-viewpoint-reference · VER 1 · 12.09.2026 */
/* psygames-spatial-claude-mac · задача 148ecbb4 · not an app release */
import React from 'react';
import {View} from 'react-native';
import Svg,{Circle,Ellipse,Line} from 'react-native-svg';
import {RotationShape} from './RotationShape';
import type {Shape} from '../games/mental-rotation/core/types';

/**
 * ЭТАЛОН ДЛЯ ПРОБЫ «ТОЧКА ЗРЕНИЯ»: фигура в исходном положении плюс МЕТКА, с
 * какой стороны на неё предлагают посмотреть.
 *
 * 🔴 БЕЗ МЕТКИ ЗАДАНИЕ НЕРЕШАЕМО, А НЕ ПРОСТО ТРУДНО. Все варианты — одна и та же
 * фигура под разными углами; если не сказать, какой угол спрашивают, верного
 * ответа нет вовсе, и любой вариант одинаково хорош. Метка — это само условие
 * задачи, а не украшение к нему.
 *
 * 🔴 ГДЕ МЕТКА СТОИТ И ПОЧЕМУ ИМЕННО ТАМ. `shapeSurface` держит камеру
 * НЕПОДВИЖНОЙ и поворачивает фигуру: вид «с угла θ» получается поворотом фигуры
 * на θ вокруг вертикали. Для человека это то же самое, как если бы он сам обошёл
 * фигуру на −θ. Поэтому наземный азимут метки = 45° − θ.
 *
 * Откуда 45°: изометрия проецирует точку (x,y,z) в
 *   sx = (x − z)·√3⁄2,  sy = (−y + (x + z)⁄2),
 * и наблюдатель стоит там, где x = z, то есть на азимуте 45°. При θ = 0 метка
 * обязана оказаться внизу по центру — «отсюда и смотрим сейчас», и формула это
 * даёт: sx = 0, sy > 0 (после приведения к радиусу — ровно `MARK_ASPECT`). Эта
 * проверка стоит пробой; она же ловит смену знака, если когда-нибудь поменяется
 * направление поворота в `turnPoint`.
 *
 * ⚠️ ЭКРАННЫЙ Y РАСТЁТ ВНИЗ. В проекции выше `(x + z)/2` со знаком плюс — значит
 * точка, которая ближе к зрителю, рисуется НИЖЕ. Знак здесь не «как красивее»,
 * а тот же самый, что в рисователе; разойдутся — метка станет показывать на
 * противоположную сторону, и подсказка начнёт врать.
 */

/** Наземный азимут наблюдателя в исходном положении — там, где x = z. */
export const CAMERA_AZIMUTH = 45;

/**
 * 🔴 ПОЛУОСИ ПРОЕКЦИИ НАЗЕМНОГО КРУГА — И ПОЧЕМУ БЕЗ НИХ МЕТКА УЕЗЖАЛА С ХОЛСТА.
 *
 * Круг под фигурой в изометрии становится эллипсом. Подставив φ + 45°, получаем
 * ровно его полуоси: по X это √2·√3⁄2 ≈ 1,22, по Y — √2⁄2 ≈ 0,71. Первая версия
 * этого файла возвращала сырые проекции и обещала в комментарии диапазон [-1..1]
 * — обещание было неверным: при радиусе 0,44 размера метка отъезжала на 0,54, то
 * есть ЗА край SVG, и при части углов просто пропадала. Ни типы, ни линт, ни
 * тринадцать проб этого не видели: задание оставалось «решаемым», только условие
 * было не видно. Поймано глазами на живом экране 12.09.2026.
 *
 * Поэтому обе координаты делятся на ОДНУ И ТУ ЖЕ полуось X: форма эллипса
 * сохраняется, а X честно укладывается в [-1..1].
 */
const GROUND_X = Math.SQRT2 * (Math.sqrt(3) / 2);
const GROUND_Y = Math.SQRT2 / 2;

/** Сплюснутость наземного эллипса: во столько раз он ниже, чем шире. */
export const MARK_ASPECT = GROUND_Y / GROUND_X;

/** Экранная точка метки в долях радиуса: X в [-1..1], Y в [-MARK_ASPECT..MARK_ASPECT]. */
export function viewpointMarkOffset(degrees: number): [number, number] {
  const phi = ((CAMERA_AZIMUTH - degrees) * Math.PI) / 180;
  const gx = Math.cos(phi), gz = Math.sin(phi);
  return [((gx - gz) * (Math.sqrt(3) / 2)) / GROUND_X, ((gx + gz) / 2) / GROUND_X];
}

export function ViewpointReference({shape, degrees, size, ink = '#6A4F99', accent = '#F5A524'}: {
  shape: Shape; degrees: number; size: number; ink?: string; accent?: string;
}) {
  // 0,42 + радиус самой метки 0,055 = 0,475 — метка целиком внутри холста при
  // ЛЮБОМ угле. Меняешь одно число — проверь пробу «метка не уезжает с холста».
  const radius = size * 0.42, cx = size / 2, cy = size / 2;
  const [ox, oy] = viewpointMarkOffset(degrees);
  const mx = cx + ox * radius, my = cy + oy * radius;
  // Короткий штрих от метки к центру: одна точка читается как пятно, точка со
  // штрихом — как взгляд, направленный на фигуру.
  const len = size * 0.09, dist = Math.hypot(mx - cx, my - cy) || 1;
  const tx = mx - ((mx - cx) / dist) * len, ty = my - ((my - cy) / dist) * len;
  return (
    <View style={{width: size, height: size}}>
      <View style={{position: 'absolute', left: 0, top: 0}}>
        <Svg testID="viewpoint-mark" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Ellipse cx={cx} cy={cy} rx={radius} ry={radius * MARK_ASPECT}
            fill="none" stroke={ink} strokeOpacity={0.28} strokeWidth={1} strokeDasharray="4 4" />
          <Line x1={mx} y1={my} x2={tx} y2={ty} stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
          <Circle cx={mx} cy={my} r={size * 0.055} fill={accent} stroke="#FFFFFF" strokeWidth={1.6} />
        </Svg>
      </View>
      <View style={{position: 'absolute', left: 0, top: 0}}>
        <RotationShape shape={shape} size={size} />
      </View>
    </View>
  );
}

export default ViewpointReference;
