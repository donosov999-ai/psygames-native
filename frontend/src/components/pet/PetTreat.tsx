/* psygames-pet-treat · VER 1 · 04.09.2026 */
/**
 * ЛАКОМСТВО, КОТОРОЕ ПИТОМЕЦ СЪЕДАЕТ.
 *
 * 🔴 ЗАЧЕМ. Отчёт ca24df45: «угостить надо всё-таки дорисовывать анимацию как он
 * жрёт, без неё особо не смотрится это угостить». Кнопка списывала жетоны,
 * питомец прыгал от радости — а самого угощения на экране не было вовсе.
 *
 * ⚠️ БЕЗ НОВЫХ КАДРОВ, И ЭТО НЕ ЭКОНОМИЯ. Кадров состояния `eat` нет (заявка
 * 00218752 висит с 26.08 без ответа), а рисовать их некому. Но у питомца есть
 * ЯКОРЯ ПО КАЖДОМУ КАДРУ — `eyes` и `neck`, снятые по силуэту. Между ними и
 * находится рот: лакомство едет туда и исчезает, а сам питомец в это время
 * играет уже существующий `jump`. Это ровно тот подход, что записан в проекте
 * правилом: питомец — риг из частей, а не цельный спрайт.
 *
 * ⚠️ РОТ ВЫВОДИТСЯ, А НЕ ЗАДАЁТСЯ ЧИСЛОМ. Своя константа «рот на 58%» разъехалась
 * бы с якорями при первой же пересъёмке кадров — этим уже обжигались, когда
 * бабочка у кота оказывалась то на пузе, то на хвосте. Здесь рот берётся ОТ
 * якорей: чуть ниже глаз, в сторону шеи.
 */
import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { FRAME_ANCHORS } from './petAnchors.generated';
import type { PetSkin } from './PetSprite';

/** Насколько рот ниже глаз в долях расстояния «глаза → шея». */
export const РОТ_ОТ_ГЛАЗ_К_ШЕЕ = 0.45;

/** Чем угощают каждый облик. Эмодзи, а не картинка: своих файлов еды в проекте нет. */
export const ЛАКОМСТВО: Record<PetSkin, string> = {
  cat: '🐟',
  robot: '🔋',
  constellation: '✨',
};

/**
 * Где рот на кадре, в процентах от размера спрайта.
 * Возвращает null, если у облика нет якорей — тогда лакомство просто не рисуем.
 */
export function ротНаКадре(skin: PetSkin, frame = 0): { x: number; y: number } | null {
  const кадры = FRAME_ANCHORS[skin]?.idle;
  if (!кадры || !кадры.length) return null;
  const a = кадры[((frame % кадры.length) + кадры.length) % кадры.length];
  if (!a) return null;
  return {
    x: a.eyes.x,
    y: a.eyes.y + (a.neck.y - a.eyes.y) * РОТ_ОТ_ГЛАЗ_К_ШЕЕ,
  };
}

/**
 * Лакомство подлетает ко рту и исчезает. Показывается только пока `active`.
 *
 * @param size размер спрайта питомца — тот же, что у `PetSprite`
 */
export default function PetTreat({ skin, size, active }: {
  skin: PetSkin;
  size: number;
  active: boolean;
}) {
  /**
   * ⚠️ `useState` с ленивым созданием, а не `useRef(...).current`. Второе читает
   * ref во время отрисовки — линтер прав, это тот же класс ошибки, что уже ловили
   * в каркасе игр. Значение создаётся ровно один раз, как и с ref.
   */
  const [ход] = React.useState(() => new Animated.Value(0));
  /**
   * ⚠️ ЩАДЯЩИЙ РЕЖИМ ГАСИТ ПОЛЁТ, А НЕ САМО УГОЩЕНИЕ. Кому движение мешает —
   * увидит лакомство неподвижно у рта и поймёт, что питомца покормили; убрать его
   * целиком значило бы вернуть ровно ту жалобу, с которой всё началось: «без
   * анимации не смотрится это угостить».
   */
  const щадящий = useReducedMotion();

  React.useEffect(() => {
    if (!active) { ход.setValue(0); return; }
    if (щадящий) { ход.setValue(0.85); return; }   // сразу у рта, без полёта
    ход.setValue(0);
    const анимация = Animated.timing(ход, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    анимация.start();
    return () => анимация.stop();
  }, [active, ход, щадящий]);

  const рот = ротНаКадре(skin);
  if (!active || !рот) return null;

  // Летит снизу-справа ко рту и тает: доехало — значит съедено.
  const dy = ход.interpolate({ inputRange: [0, 1], outputRange: [size * 0.28, 0] });
  const dx = ход.interpolate({ inputRange: [0, 1], outputRange: [size * 0.18, 0] });
  const масштаб = ход.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0.2] });
  const прозрачность = ход.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });

  return (
    <View pointerEvents="none" style={[styles.слой, { width: size, height: size }]}>
      <Animated.View
        style={{
          position: 'absolute',
          left: (рот.x / 100) * size,
          top: (рот.y / 100) * size,
          transform: [
            { translateX: -size * 0.09 },
            { translateY: -size * 0.09 },
            { translateX: dx },
            { translateY: dy },
            { scale: масштаб },
          ],
          opacity: прозрачность,
        }}
      >
        <Text style={{ fontSize: size * 0.18 }}>{ЛАКОМСТВО[skin] ?? '🍪'}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  слой: { position: 'absolute', left: 0, top: 0, alignItems: 'flex-start', justifyContent: 'flex-start' },
});
