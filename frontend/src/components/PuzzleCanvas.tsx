/* psygames-puzzle-canvas · VER 2 · 10.09.2026 */
/**
 * ДОСКА ГОЛОВОЛОМКИ ТЭТХЭМА, НАРИСОВАННАЯ НАШИМ SVG.
 *
 * Движок отдаёт список примитивов — прямоугольники, линии, круги, многоугольники,
 * текст. Здесь они превращаются в SVG и масштабируются под ширину экрана. Нажатие
 * пересчитывается обратно в ЕГО координаты и уходит в движок: правила знает он.
 *
 * ⚠️ Цвета берём из ЕГО палитры, но фон подменяем нашим: у него он чисто белый, а у
 * нас тема бывает тёмной. Индекс 0 в его палитре — всегда фон (`frontend_default_colour`).
 */
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle, Polygon, Text as SvgText } from 'react-native-svg';
import type { Партия, Примитив, Жест } from '@/src/games/tatham-bridge/play';

interface Props {
  партия: Партия;
  /** Доступная ширина в точках — доска впишется в неё целиком. */
  ширина: number;
  /**
   * 🔴 ЖЕСТ ЦЕЛИКОМ, А НЕ ОДИН ТАП. Пять головоломок из сорока (Untangle, Pegs,
   * Rectangles, Loopy, Slant) без протяжки не играются вовсе: узел надо тащить,
   * прямоугольник растягивать, линию вести. Родные оболочки автора шлют ровно эти
   * три события, поэтому и мы шлём их, а не «нажатие» одним махом.
   */
  onЖест: (x: number, y: number, жест: Жест, правой: boolean) => void;
  фон: string;
}

export default function PuzzleCanvas({ партия, ширина, onЖест, фон }: Props) {
  const { ширина: W, высота: H, палитра, примитивы } = партия;
  const масштаб = W > 0 ? Math.min(ширина / W, 1.6) : 1;

  const цвет = useCallback((i: number): string => {
    if (i < 0) return 'transparent';
    if (i === 0) return фон;                       // фон — наш, не его белый
    return палитра[i] ?? '#888';
  }, [палитра, фон]);

  /** Экранная точка → координата его поля. */
  const точка = useCallback((e: any): [number, number] => {
    const { locationX, locationY } = e.nativeEvent;
    return [locationX / масштаб, locationY / масштаб];
  }, [масштаб]);

  /**
   * ⚠️ Во ВРЕМЯ протяжки `locationX` считается от того элемента, где жест начался, —
   * это ровно наш холст, поэтому пересчёт один и тот же на всех трёх событиях.
   */
  const шаг = useCallback((e: any, жест: Жест) => {
    const [x, y] = точка(e);
    onЖест(x, y, жест, false);
  }, [точка, onЖест]);

  return (
    <View
      /**
       * 🔴 ВЫДЕЛЕНИЕ ТЕКСТА КРАЛО ЖЕСТ — ОТСЮДА «СЛОМАНА ИГРОВАЯ МЕХАНИКА».
       *
       * 📍 Снимок Дениса 10.09.2026, «Чёт-нечет»: поперёк экрана голубая полоса и
       * синяя точка над подсказкой. Это не артефакт отрисовки — это ВЫДЕЛЕНИЕ
       * ТЕКСТА и его ползунок. Приложение на iOS и Android — Tauri, то есть
       * WebView; долгое нажатие там начинает выделять текст и ЗАБИРАЕТ жест себе.
       * До холста он не доходит, и головоломка перестаёт отвечать на протяжку.
       *
       * ⚠️ Задеты все, где надо вести пальцем: Untangle, Pegs, Loopy, Pearl,
       * Tracks, Slant, Galaxies… Замер по мосту: сам движок при этом ЦЕЛ — из
       * сорока открываются все сорок, на программный тычок отвечают тридцать два.
       * Ломалось именно наше касание, а не его правила.
       *
       * `userSelect: 'none'` снимает выделение, `touchAction: 'none'` — прокрутку
       * и масштаб щипком под пальцем на доске. Свойства веб-специфичные, поэтому
       * идут через `as any`: react-native-web их пробрасывает, нативная сборка
       * молча пропускает.
       */
      style={[styles.box, { width: W * масштаб, height: H * масштаб },
        { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' } as any]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => шаг(e, 'нажал')}
      onResponderMove={(e) => шаг(e, 'ведёт')}
      onResponderRelease={(e) => шаг(e, 'отпустил')}
      onResponderTerminate={(e) => шаг(e, 'отпустил')}
    >
      <Svg width={W * масштаб} height={H * масштаб} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={фон} />
        {примитивы.map((п, k) => рисовать(п, k, цвет))}
      </Svg>
    </View>
  );
}

function рисовать(п: Примитив, k: number, цвет: (i: number) => string) {
  switch (п.вид) {
    case 'прямоугольник':
      return <Rect key={k} x={п.x} y={п.y} width={п.ш} height={п.в} fill={цвет(п.цвет)} />;
    case 'линия':
      return <Line key={k} x1={п.x1} y1={п.y1} x2={п.x2} y2={п.y2}
        stroke={цвет(п.цвет)} strokeWidth={п.толщина ?? 1} strokeLinecap="round" />;
    case 'круг':
      return <Circle key={k} cx={п.x} cy={п.y} r={п.r}
        fill={цвет(п.заливка)} stroke={цвет(п.контур)} strokeWidth={1} />;
    case 'многоугольник':
      return <Polygon key={k} points={пары(п.точки)}
        fill={цвет(п.заливка)} stroke={цвет(п.контур)} strokeWidth={1} />;
    case 'текст': {
      // его выравнивание: 0 — влево, 1 — по центру, 2 — вправо (ALIGN_HLEFT/HCENTRE/HRIGHT)
      const якорь = (п.выравнивание & 1) ? 'middle' : (п.выравнивание & 2) ? 'end' : 'start';
      return <SvgText key={k} x={п.x} y={п.y} fontSize={п.размер} fill={цвет(п.цвет)}
        textAnchor={якорь} fontWeight="600">{п.текст}</SvgText>;
    }
    default:
      return null;
  }
}

const пары = (т: number[]): string => {
  const out: string[] = [];
  for (let i = 0; i + 1 < т.length; i += 2) out.push(`${т[i]},${т[i + 1]}`);
  return out.join(' ');
};

const styles = StyleSheet.create({
  box: { alignSelf: 'center' },
});
