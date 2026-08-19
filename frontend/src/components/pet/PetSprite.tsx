/**
 * PetSprite — кадровая анимация Синапса (v1.135; скины v1.140-141).
 *
 * ТРИ скина по 20 кадров 512×512 (производство: Kie 4K лист 4×5 → нарезка
 * скриптом Кодекса, пакеты в _sync/synapse-v2): «cat» — нейро-кот (канон,
 * дефолт), «robot» — прежний Синапс hi-res, «constellation» — semi-realistic
 * бирюзовый (подпись в UI — «Нейрон»: имя «Созвездие» занято СТАДИЕЙ развития).
 * Выбор — экран /pet, хранение psygames_pet_skin (pet.ts).
 *
 * Все точки показа (гуляка, портрет /pet, мини-аватар шапки) — кадры текущего
 * скина; SVG-версия (SynapsePet.tsx) в UI больше не используется.
 */
import React from 'react';
import { Image, View } from 'react-native';

import { a11yDecor } from '@/src/services/a11y';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { FRAME_ANCHORS } from './petAnchors.generated';

export type PetState = 'walk' | 'idle' | 'wave' | 'jump' | 'sleep';
export type PetSkin = 'cat' | 'robot' | 'constellation';
/** Аксессуары из магазина (type 'pet' в COSMETICS). Рисуются вектором поверх
 *  кадров — не зависят от скина и не требуют перерисовки спрайт-листов. */
export type PetAccessory = 'party_hat' | 'bow' | 'glasses' | 'bow_tie';

const CAT: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/cat/walk0.webp'),
    require('../../../assets/images/pet/cat/walk1.webp'),
    require('../../../assets/images/pet/cat/walk2.webp'),
    require('../../../assets/images/pet/cat/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/cat/idle0.webp'),
    require('../../../assets/images/pet/cat/idle1.webp'),
    require('../../../assets/images/pet/cat/idle2.webp'),
    require('../../../assets/images/pet/cat/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/cat/wave0.webp'),
    require('../../../assets/images/pet/cat/wave1.webp'),
    require('../../../assets/images/pet/cat/wave2.webp'),
    require('../../../assets/images/pet/cat/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/cat/jump0.webp'),
    require('../../../assets/images/pet/cat/jump1.webp'),
    require('../../../assets/images/pet/cat/jump2.webp'),
    require('../../../assets/images/pet/cat/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/cat/sleep0.webp'),
    require('../../../assets/images/pet/cat/sleep1.webp'),
    require('../../../assets/images/pet/cat/sleep2.webp'),
    require('../../../assets/images/pet/cat/sleep3.webp'),
  ],
};

const ROBOT: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/robot/walk0.webp'),
    require('../../../assets/images/pet/robot/walk1.webp'),
    require('../../../assets/images/pet/robot/walk2.webp'),
    require('../../../assets/images/pet/robot/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/robot/idle0.webp'),
    require('../../../assets/images/pet/robot/idle1.webp'),
    require('../../../assets/images/pet/robot/idle2.webp'),
    require('../../../assets/images/pet/robot/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/robot/wave0.webp'),
    require('../../../assets/images/pet/robot/wave1.webp'),
    require('../../../assets/images/pet/robot/wave2.webp'),
    require('../../../assets/images/pet/robot/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/robot/jump0.webp'),
    require('../../../assets/images/pet/robot/jump1.webp'),
    require('../../../assets/images/pet/robot/jump2.webp'),
    require('../../../assets/images/pet/robot/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/robot/sleep0.webp'),
    require('../../../assets/images/pet/robot/sleep1.webp'),
    require('../../../assets/images/pet/robot/sleep2.webp'),
    require('../../../assets/images/pet/robot/sleep3.webp'),
  ],
};


const CONSTELLATION: Record<PetState, any[]> = {
  walk: [
    require('../../../assets/images/pet/constellation/walk0.webp'),
    require('../../../assets/images/pet/constellation/walk1.webp'),
    require('../../../assets/images/pet/constellation/walk2.webp'),
    require('../../../assets/images/pet/constellation/walk3.webp'),
  ],
  idle: [
    require('../../../assets/images/pet/constellation/idle0.webp'),
    require('../../../assets/images/pet/constellation/idle1.webp'),
    require('../../../assets/images/pet/constellation/idle2.webp'),
    require('../../../assets/images/pet/constellation/idle3.webp'),
  ],
  wave: [
    require('../../../assets/images/pet/constellation/wave0.webp'),
    require('../../../assets/images/pet/constellation/wave1.webp'),
    require('../../../assets/images/pet/constellation/wave2.webp'),
    require('../../../assets/images/pet/constellation/wave3.webp'),
  ],
  jump: [
    require('../../../assets/images/pet/constellation/jump0.webp'),
    require('../../../assets/images/pet/constellation/jump1.webp'),
    require('../../../assets/images/pet/constellation/jump2.webp'),
    require('../../../assets/images/pet/constellation/jump3.webp'),
  ],
  sleep: [
    require('../../../assets/images/pet/constellation/sleep0.webp'),
    require('../../../assets/images/pet/constellation/sleep1.webp'),
    require('../../../assets/images/pet/constellation/sleep2.webp'),
    require('../../../assets/images/pet/constellation/sleep3.webp'),
  ],
};

const SKINS: Record<PetSkin, Record<PetState, any[]>> = { cat: CAT, robot: ROBOT, constellation: CONSTELLATION };

/** Один кадр скина (для превью выбора и мини-аватара шапки). */
export function petFrame(skin: PetSkin, state: PetState = 'idle', frame = 0) {
  return SKINS[skin][state][frame];
}

/** Кадровая частота по состоянию: шаг бодрый, сон медленный. */
const FRAME_MS: Record<PetState, number> = {
  walk: 140, idle: 420, wave: 180, jump: 150, sleep: 600,
};

/**
 * v1.170: ЯКОРНЫЕ ТОЧКИ ВМЕСТО ОБЩИХ КООРДИНАТ.
 *
 * ЗАЧЕМ. Аксессуары сидели ОДНИМИ координатами на всех трёх скинах: на коте
 * попадало, на роботе и Созвездии съезжало — головы и шеи у них в других
 * местах. Вещи при этом продаются в магазине за очки, то есть человек платит
 * за криво надетый предмет.
 *
 * КОНТРАКТ. Формат задал mascot-claude-mac (02.08): проценты 0..100 внутри
 * кадра, origin в левом верхнем углу. Точка = МЕСТО КРЕПЛЕНИЯ, а не центр
 * предмета; какой стороной предмет садится на точку — задаётся один раз на ТИП
 * аксессуара (ниже), а не на облик.
 *
 * ⚠️ 20.08.2026: ЯКОРЬ ТЕПЕРЬ У КАЖДОГО КАДРА, А НЕ ОДИН НА ОБЛИК.
 *
 * Валя 19.08.2026, экран магазина: «Почему бабочка на пузе, папочка должна быть
 * на шее? Она то на пузе, то на хвосте». Так и было: якоря снимали по ОДНОМУ
 * кадру idle0 и ставили константой на весь облик, а у облика двадцать кадров —
 * пять состояний по четыре, и питомец в них ездит по кадру целиком. У кота шея
 * стояла намертво на 62.5% высоты: в sleep кот лежит — это пузо, в jump2 поза
 * другая — это хвост. Ровно то, что она описала, слово в слово.
 *
 * Таблица теперь снимается скриптом со ВСЕХ 60 кадров и лежит в
 * petAnchors.generated.ts. Руками её не правят: `node scripts/measure-pet-anchors.mjs`.
 * Правило замера — в шапке скрипта, сторожит гейт src/__tests__/pet-anchors.test.ts.
 */
type AnchorName = 'head_top' | 'eyes' | 'neck';

/**
 * Насколько облик шире или уже среднего — множитель размера вещи.
 *
 * ⚠️ Это НЕ из покадрового замера, а прежняя константа облика, оставленная как
 * была. Размер вещи никто не ругал (жалоба была про МЕСТО), а по силуэтам эти
 * числа не воспроизводятся — они пришли из инструмента маскот-движка. Менять
 * то, на что нет ни замера, ни жалобы, — лишний риск.
 */
const SKIN_SCALE: Record<PetSkin, number> = { cat: 1.0, robot: 0.896, constellation: 0.817 };

/**
 * Якорь КОНКРЕТНОГО кадра. Единственный вход в таблицу — чтобы «взять idle0 для
 * чужого кадра» нельзя было даже случайно: состояние и номер кадра обязательны.
 */
export function petAnchor(skin: PetSkin, state: PetState, frame: number, at: AnchorName) {
  const list = FRAME_ANCHORS[skin][state];
  return list[((frame % list.length) + list.length) % list.length][at];
}

/** Куда крепится каждый ТИП аксессуара и какой стороной садится на точку. */
const ACCESSORY_MOUNT: Record<PetAccessory, { at: AnchorName; edge: 'bottom' | 'center' | 'top' }> = {
  party_hat: { at: 'head_top', edge: 'bottom' },   // колпак нижней кромкой на макушку
  // ⚠️ БАНТ — ГОЛОВНОЙ УБОР, А НЕ БАБОЧКА НА ШЕЮ. Решение Дениса 14.08.2026:
  // «бант надо чтобы на голове был, как раньше, как девчачий головной убор».
  bow:       { at: 'head_top', edge: 'center' },  // бант СЕРЕДИНОЙ на макушку — заколка сидит НА голове, а не парит над ней
  glasses:   { at: 'eyes',     edge: 'center' },   // очки центром на глаза
  /**
   * Бабочка — отдельный предмет, тот самый «третий вариант» из разбора банта:
   * бант остался заколкой на голове, а на шею есть чем повязать.
   *
   * ВЕРХНИМ краем на шею, а не серединой. Середина увела бы половину бабочки
   * выше точки шеи — коту прямо на морду, то есть ровно в ту жалобу, из-за
   * которой бант и переезжал: «когда на шее половину лица не видно».
   */
  bow_tie:   { at: 'neck',     edge: 'top' },
};

/**
 * Картинки аксессуаров. Раньше это были примитивы SVG — треугольник, два
 * треугольника и два кружка. Отзыв тестировщицы дословно: «праздничный колпак
 * выглядит как треугольник, нарисованный трёхлетним ребёнком», и она права:
 * человек платит очками за вещь, которая выглядит как заглушка.
 * Теперь объёмные PNG с альфой, 512×512, нарезаны из сгенерированных листов.
 */
const ACCESSORY_IMG: Record<PetAccessory, any> = {
  party_hat: require('@/assets/images/pet/accessories/party_hat.png'),
  bow:       require('@/assets/images/pet/accessories/bow.png'),
  glasses:   require('@/assets/images/pet/accessories/glasses.png'),
  // Готовая картинка из уже нарисованного набора: бабочка с узлом посередине,
  // рисовать заново нечего. Синяя — чтобы не путалась с розовым бантом-заколкой.
  bow_tie:   require('@/assets/images/pet/accessories/bow_blue.png'),
};

/** Доля от размера питомца: колпак уже очков, очки шире банта. */
const ACCESSORY_REL: Record<PetAccessory, number> = {
  party_hat: 0.46,
  bow:       0.50,
  glasses:   0.60,
  bow_tie:   0.44,   // уже банта: бабочка не должна перекрывать грудь целиком
};

/** Поле вокруг предмета внутри PNG — задано при нарезке (6% с каждой стороны). */
/**
 * Сколько пустоты внутри картинки предмета сверху и снизу — ЗАМЕРЕНО по альфе
 * каждого PNG (canvas, порог 24). Раньше здесь стояла одна общая константа 0.06,
 * и она верна только для колпака: у него содержимое занимает почти весь кадр.
 *
 * ⚠️ У БАНТА ПУСТОТЫ ТРЕТЬ КАДРА СВЕРХУ. Бант — широкий и низкий, в квадратном
 * кадре он лежит полосой посередине: содержимое с 29.7% до 69.9%. Пока бант
 * вешался ЦЕНТРОМ КАДРА на точку шеи, видимая часть уезжала вверх и закрывала
 * коту морду. Валя 14.08.2026: «Когда на шее половину лица не видно».
 */
const ACCESSORY_INSET: Record<PetAccessory, { top: number; height: number }> = {
  party_hat: { top: 0.059, height: 0.881 },
  bow:       { top: 0.297, height: 0.402 },
  glasses:   { top: 0.318, height: 0.361 },
  bow_tie:   { top: 0.287, height: 0.426 },   // замер bow_blue.png тем же правилом
};

function AccessoryOverlay({ kind, size, skin, state, frame }: {
  kind: PetAccessory; size: number; skin: PetSkin; state: PetState; frame: number;
}) {
  const mount = ACCESSORY_MOUNT[kind];
  // ⚠️ Якорь ТЕКУЩЕГО кадра, а не idle0. Кадр компонент и так знает — он им
  // анимирует; брать чужой и была та самая «бабочка на пузе».
  const a = petAnchor(skin, state, frame, mount.at);
  const scale = SKIN_SCALE[skin];

  // Якорь задан в процентах кадра — переводим в пиксели текущего размера питомца.
  const ax = (a.x / 100) * size;
  const ay = (a.y / 100) * size;
  const img = ACCESSORY_REL[kind] * size * scale;

  /**
   * Считаем от ВИДИМОЙ части предмета, а не от границ картинки: в квадратном кадре
   * предмет может занимать лишь полосу посередине, и тогда «центр кадра» и «центр
   * предмета» — разные точки. Именно на этом бант заезжал коту на морду.
   *
   *   bottom — нижний край видимой части на якорь (колпак садится на макушку);
   *   top    — верхний край видимой части на якорь (бабочка висит НИЖЕ подбородка);
   *   center — середина видимой части на якорь (очки на линии глаз).
   */
  const ins = ACCESSORY_INSET[kind];
  const top =
    mount.edge === 'bottom' ? ay - img * (ins.top + ins.height)
    : mount.edge === 'top'  ? ay - img * ins.top
    :                         ay - img * (ins.top + ins.height / 2);
  const left = ax - img / 2;

  return (
    // Обёртка ради pointerEvents: у Image его нет ни в пропсах, ни в стиле,
    // а тап должен доставаться питомцу под аксессуаром.
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: img, height: img }}>
      <Image
        {...a11yDecor}
        source={ACCESSORY_IMG[kind]}
        style={{ width: img, height: img }}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

export default function PetSprite({ state, size = 56, skin = 'cat', accessory = null }: {
  state: PetState; size?: number; skin?: PetSkin; accessory?: PetAccessory | null;
}) {
  const frames = SKINS[skin][state];
  const [frame, setFrame] = React.useState(0);
  const reduced = useReducedMotion();
  React.useEffect(() => {
    setFrame(0);
    /**
     * Щадящий режим: кадры замирают на первом.
     *
     * Это ЖИВАЯ вечная петля приложения — питомец перебирает кадры всё время,
     * пока открыт экран (idle 420 мс, ходьба 140 мс), и показывается он сразу
     * в трёх местах: гуляка внизу, портрет на /pet, мини-аватар в шапке. Для
     * вестибулярной чувствительности непрерывное движение хуже любого разового
     * эффекта: разовый можно переждать, отведя глаза, а это не заканчивается.
     *
     * Питомца не убираем — он собеседник, а не украшение: реплики, подсказка
     * слабой шкалы, тап на экран /pet остаются. Смена состояния (тапнули —
     * `jump`, погладили — `wave`) тоже работает и по-прежнему видна: меняется
     * поза, просто без перелистывания. То есть ответ на действие сохраняется,
     * исчезает только фоновое шевеление.
     */
    if (reduced) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), FRAME_MS[state]);
    return () => clearInterval(t);
  }, [state, skin, frames.length, reduced]);

  /**
   * Все кадры лежат стопкой, анимация — переключение видимости.
   *
   * Раньше здесь была ОДНА картинка, которой подменяли source по таймеру. На
   * нативе это гасит `fadeDuration={0}`, а в вебе — нет: Chromium на смену src
   * показывает пустой кадр, пока декодирует новый файл. Android-сборка у нас
   * это WebView, поэтому питомец на телефоне подмигивал и «исчезал на мгновение»
   * (репорт тестировщика, v1.170). Смонтированные картинки уже декодированы,
   * переключение opacity ничего не подгружает — мигать нечему.
   *
   * Кадров в состоянии 2-4 штуки, так что стопка ничего не стоит по памяти.
   */
  // Один индекс на всё: картинки показывают ЭТОТ кадр, аксессуар берёт якорь
  // ЭТОГО ЖЕ кадра. Две разные формулы здесь и разъехались бы молча.
  const shown = ((frame % frames.length) + frames.length) % frames.length;

  return (
    <View style={{ width: size, height: size }}>
      {frames.map((src, i) => (
        <Image
          key={i}
          {...a11yDecor}
          source={src}
          style={{
            width: size, height: size,
            ...(i === 0 ? null : { position: 'absolute', top: 0, left: 0 }),
            opacity: i === shown ? 1 : 0,
          }}
          resizeMode="contain"
          fadeDuration={0}
        />
      ))}
      {accessory && <AccessoryOverlay kind={accessory} size={size} skin={skin} state={state} frame={shown} />}
    </View>
  );
}
