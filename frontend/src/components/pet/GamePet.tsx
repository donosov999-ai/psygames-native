import React, { useEffect, useState } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import PetSprite, { petHeadCenter } from './PetSprite';
import { getPetSkin, getPetVisible, PET_VISIBLE_EVENT } from '@/src/services/pet';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { settle } from '@/src/components/juice/motion';

/**
 * 🔴 ПИТОМЕЦ В ШАПКЕ ИГРЫ — ОТВЕТ ИГРЫ, А НЕ УКРАШЕНИЕ.
 *
 * Решение Дениса 30.08.2026: «идею с маскотом в верхнем тулбаре зафиксируй,
 * надо её сквозной сделать, на все игры» и «можно тестово в них пока».
 *
 * ЗАЧЕМ. У эталона жанра лицо маскота меняется РАНЬШЕ, чем игрок успевает
 * посмотреть на счёт: серия идёт — радость, серия сорвана — грусть, уровень
 * взят — палец вверх. У нас питомец жил на главной, на своём экране, на карте
 * уровней и в перебивке — и НИ В ОДНОЙ игре, при том что шапка у 72 игр из 74
 * общая (`GameShell`).
 *
 * ⚠️ ПОЧЕМУ ПРОП, А НЕ ПОДПИСКА НА СОБЫТИЯ. Подписка — правильная цель (задача
 * `9d0503c7`), но она требует единого канала событий партии, которого пока нет.
 * Проп даёт то же поведение сегодня и не мешает завтра: когда канал появится,
 * `GameShell` будет читать его сам, а игры перестанут передавать `pet`.
 *
 * УВАЖЕНИЕ К НАСТРОЙКАМ. Скин берётся тот же, что у питомца на главной; если
 * питомец выключен в настройках — здесь его тоже нет. Щадящий режим убирает
 * подскок, оставляя смену выражения: смысл важнее движения (см. `motion.ts`).
 */

/** Что случилось в партии — на языке игры, а не спрайта. */
export type PetMood =
  | 'idle'   // ничего не происходит
  | 'good'   // верное действие
  | 'bad'    // ошибка
  | 'win';   // раунд или уровень взят

/** Сколько держится реакция, прежде чем питомец вернётся в покой. */
const HOLD_MS: Record<Exclude<PetMood, 'idle'>, number> = { good: 700, bad: 900, win: 1600 };

/**
 * Рамка вокруг питомца — по паре «обводка → фон» на каждое настроение.
 * У эталона жанра маскот сидит в рамке-медальоне, и она же меняет цвет: это
 * второй канал ответа, который виден даже боковым зрением, когда сам спрайт
 * мелкий (Денис 30.08.2026: «питомца в рамку и типа тетрайдер»).
 */
const FRAME: Record<PetMood, { ring: string; fill: string }> = {
  idle: { ring: '#a78bfa', fill: 'rgba(167,139,250,0.14)' },
  good: { ring: '#34d399', fill: 'rgba(52,211,153,0.20)' },
  bad:  { ring: '#94a3b8', fill: 'rgba(148,163,184,0.16)' },
  win:  { ring: '#fbbf24', fill: 'rgba(251,191,36,0.24)' },
};

/**
 * Во сколько раз спрайт крупнее окна медальона. Три — не «на глаз»: при кропе по
 * глазам голова занимает примерно треть кадра, значит ×3 даёт голову почти во всё
 * окно. Меньше — просьба Дениса «в два раза минимум» не выполнена, больше — в окно
 * попадает уже не морда, а один глаз.
 */
const ЗУМ = 3;

export default function GamePet({ mood = 'idle', size = 46 }: { mood?: PetMood; size?: number }) {
  const reduced = useReducedMotion();
  const [skin, setSkin] = useState<'cat' | 'robot' | 'constellation'>('cat');
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState<PetMood>('idle');
  // ⚠️ `useState`, а не `useRef(...).current`: чтение `.current` в теле
  // компонента — обращение к рефу во время рендера, и линтер справедливо на
  // это ругается. Ленивый инициализатор даёт то же самое (значение создаётся
  // один раз) и не растит долг линта.
  const [pop] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let alive = true;
    getPetSkin().then((s) => { if (alive) setSkin(s); }).catch(() => {});
    getPetVisible().then((v) => { if (alive) setVisible(v); }).catch(() => {});
    /**
     * Настройку могли переключить, пока игра открыта.
     *
     * ⚠️ Проверяем САМ МЕТОД, а не только наличие `window`. Питомец теперь стоит
     * в шапке ВСЕХ игр, то есть монтируется в каждом тесте экрана, а там `window`
     * существует, но без `addEventListener` — проверка «typeof window !==
     * undefined» пропускала вызов и роняла 45 тестов сразу. На нативной сборке
     * бывает ровно то же самое.
     */
    const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    const onVis = (e: Event) => setVisible(Boolean((e as CustomEvent).detail));
    if (canListen) window.addEventListener(PET_VISIBLE_EVENT, onVis as EventListener);
    return () => {
      alive = false;
      if (canListen) window.removeEventListener(PET_VISIBLE_EVENT, onVis as EventListener);
    };
  }, []);

  useEffect(() => {
    if (mood === 'idle') { setShown('idle'); return; }
    setShown(mood);
    // Подскок только на удаче: на ошибке дёргать питомца — насмешка над игроком.
    if (mood !== 'bad') {
      settle(pop, 1.18, reduced, { friction: 4, tension: 260 });
      setTimeout(() => settle(pop, 1, reduced, { friction: 6, tension: 200 }), 140);
    }
    const t = setTimeout(() => setShown('idle'), HOLD_MS[mood]);
    return () => clearTimeout(t);
  }, [mood, reduced, pop]);

  if (!visible) return null;

  const state =
    shown === 'good' ? 'jump' :
    shown === 'win' ? 'wave' :
    shown === 'bad' ? 'sleep' : 'idle';

  return (
    // Питомец — не кнопка и не сообщение: скринридер его пропускает, состояние
    // партии он получает от самих клеток и счётчиков.
    <Animated.View
      style={[styles.box, { transform: [{ scale: pop }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View
        style={[
          styles.frame,
          {
            width: size + 14, height: size + 14,
            borderRadius: (size + 14) / 3,
            borderColor: FRAME[shown].ring,
            backgroundColor: FRAME[shown].fill,
            shadowColor: FRAME[shown].ring,
          },
        ]}
      >
        {/*
          🔴 В МЕДАЛЬОНЕ КРУПНЫМ ПЛАНОМ ГОЛОВА, А НЕ ФИГУРКА ЦЕЛИКОМ.
          Отчёт Дениса 03.09.2026 со скриншотом: «надо увеличить питомца в верхнем
          тулбаре, его самое ценное — голова и морда, в два раза минимум, даже если
          остальное не будет входить».

          Он прав по существу: в окошке 46 точек фигурка целиком даёт голову
          примерно в 14 точек — это пятно, а не морда. Увеличивать сам медальон
          нельзя, он и так занимает высоту шапки.

          Поэтому спрайт рисуется ВТРОЕ крупнее окна и сдвигается так, чтобы
          ГЛАЗА оказались в центре: голова получается ~42 точки вместо 14 — втрое,
          а не вдвое, как просил Денис, потому что кроп по глазам даёт запас.
          Хвост и лапы уходят за край медальона, и это ровно то, что он и просил:
          «типа в окошке голова торчит».

          ⚠️ Смещение считается ПО ЯКОРЯМ КАДРА, а не одним числом на облик: у кота,
          робота и созвездия головы в разных местах, и в прыжке они выше, чем в
          покое. Своё число здесь означало бы съехавшую морду у двух обликов из трёх
          — ровно та беда, из-за которой якоря и заводились (бабочка на пузе).
        */}
        <View pointerEvents="none" style={{ width: size, height: size, overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
          <View style={{
            width: size * ЗУМ,
            height: size * ЗУМ,
            marginLeft: -(petHeadCenter(skin, state).x / 100) * size * ЗУМ + size / 2,
            marginTop: -(petHeadCenter(skin, state).y / 100) * size * ЗУМ + size / 2,
          }}>
            <PetSprite state={state} size={size * ЗУМ} skin={skin} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  // Медальон: обводка цветом настроения + мягкое свечение того же цвета.
  frame: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, overflow: 'hidden',
    shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
});
