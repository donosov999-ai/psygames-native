/**
 * useGameKeyboard — управление играми с клавиатуры.
 *
 * ЗАЧЕМ. Приложение собирается под Windows и macOS (Tauri), и там оно оказывалось
 * портом телефона: все 62 упражнения управлялись только мышью. Человек за компьютером
 * тянется к цифрам на клавиатуре рефлекторно — в судоку, в устном счёте, в запоминании
 * последовательностей, — и каждый раз, когда нажатие ничего не делает, он делает вывод
 * не «тут не поддержали клавиатуру», а «приложение подтормаживает».
 *
 * Заодно это доступность: человек, который не работает мышью, до сих пор не мог играть
 * вообще. Скринридеры мы починили в v1.18x, а ввод остался мышиным.
 *
 * ПОЧЕМУ ОБЩИЙ СЛОЙ, А НЕ ОБРАБОТЧИК В КАЖДОЙ ИГРЕ. Игр шесть десятков, и три вещи
 * в них ошибиться легко и одинаково: снять слушателя при уходе с экрана, не перехватить
 * ввод, когда человек печатает в поле, и не дать браузеру прокрутить страницу стрелками.
 * Один раз здесь — вместо шестидесяти шансов забыть.
 *
 * ⚠️ ГЛАВНАЯ ЛОВУШКА — ПОЛЯ ВВОДА. Внутри приложения живёт кнопка отзыва с текстовым
 * полем. Без проверки на фокус набор слова «судоку» в жалобе расставил бы цифры по доске
 * под ней. Поэтому события из input, textarea и contenteditable игнорируем всегда.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Ключ — значение `KeyboardEvent.key`: '1'…'9', 'Backspace', 'ArrowUp', 'Enter', 'a'… */
export type KeyMap = Record<string, (event: KeyboardEvent) => void>;

/** Печатает ли человек прямо сейчас в поле — тогда игра ввод не трогает. */
export function isTypingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * Клавиши, у которых есть своё поведение в браузере: стрелки прокручивают страницу,
 * пробел листает её вниз. Если игра их обрабатывает, прокрутку надо погасить, иначе
 * при каждом ходе экран будет уезжать.
 */
const BROWSER_OWNS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Enter', 'Tab',
]);

/**
 * @param map      клавиша → что делать
 * @param enabled  выключать на экранах результата и в настройках, иначе цифры
 *                 продолжают ходить по доске, которой уже нет на экране
 */
export function useGameKeyboard(map: KeyMap, enabled = true): void {
  // Карта в ref: обработчики замыкают состояние игры и меняются на каждый ход.
  // Без ref пришлось бы переподписываться на каждый рендер — лишняя работа и
  // источник гонок при быстром вводе.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    if (typeof window === 'undefined' || !window.addEventListener) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField(e.target)) return;
      // Сочетания оставляем системе: Ctrl+R перезагружает, Cmd+Q закрывает.
      // Перехватить их — отобрать у человека привычные действия.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const fn = mapRef.current[e.key];
      if (!fn) return;
      if (BROWSER_OWNS.has(e.key)) e.preventDefault();
      fn(e);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Готовая раскладка для игр с цифровым вводом: 1…9 ставят цифру, 0, Backspace
 * и Delete стирают. Собрана здесь, потому что повторяется в судоку, самурае,
 * запоминании цифр и устном счёте — а расхождение между ними человек воспримет
 * как поломку: привык стирать Backspace в одной игре, жмёт в другой, ничего.
 *
 * @param maxDigit  9 для обычной судоку, 6 для 6×6 — лишние цифры не должны проходить
 */
export function digitKeys(
  onDigit: (n: number) => void,
  opts: { maxDigit?: number; onErase?: () => void } = {},
): KeyMap {
  const max = opts.maxDigit ?? 9;
  const erase = opts.onErase ?? (() => onDigit(0));
  const map: KeyMap = {
    Backspace: erase,
    Delete: erase,
    '0': erase,
  };
  for (let n = 1; n <= max; n++) map[String(n)] = () => onDigit(n);
  return map;
}
