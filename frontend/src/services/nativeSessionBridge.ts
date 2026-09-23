/**
 * 🔴 ПРИЁМНИК ПАРТИЙ ОТ НАТИВНОЙ ПОЛОВИНЫ ГИБРИДА.
 *
 * Пока идёт переезд на Flutter, приложение живёт двумя половинами: перенесённые
 * игры рисует Flutter, остальные — эта веб-сборка в WebView. Партия, сыгранная
 * нативно, обязана попасть В ТУ ЖЕ `saveSession`, что и партия из веб-игры —
 * иначе расходится всё, что на ней держится.
 *
 * ⚠️ ЧТО ЛОМАЛОСЬ ДО ЭТОГО (замер 23.09.2026, нашёл раздел «Зарядки»):
 * · зарядка двигает шаг по подписке `setSessionListener`, а нативная игра её не
 *   вызывала — серия вставала намертво. 104 шага из 891 в составах зарядок ведут
 *   в перенесённую игру, каждый девятый: человек проходит игру, серия стоит;
 * · счётчик завершённых партий читает те же записи — 36 нативных игр давали НОЛЬ;
 * · токены, достижения, серия дней, вызов дня — всё оттуда же.
 *
 * 🔴 ПОЧЕМУ ПРИЁМНИК ЗДЕСЬ, А НЕ ВТОРАЯ РЕАЛИЗАЦИЯ НА DART. `saveSession` делает
 * семь вещей разом: запись, серию чистых прогонов, вызов дня, токены,
 * подписчиков, отправку на сервер и очередь неотправленного. Вторая реализация
 * разошлась бы с первой в ту же неделю и молча.
 */
import { saveSession, type GameSession } from '@/src/services/api';

/** Отчёты, пришедшие ДО регистрации приёмника, не выбрасываются. */
const queue: GameSession[] = [];
let ready = false;

/** ⚠️ Проверка на минимальную осмысленность: без имени игры запись бесполезна и
 *  портит статистику молча — лучше отказать громко. */
function valid(s: unknown): s is GameSession {
  return !!s && typeof s === 'object'
    && typeof (s as GameSession).game_type === 'string'
    && (s as GameSession).game_type.length > 0;
}

async function accept(raw: unknown): Promise<void> {
  if (!valid(raw)) {
    console.warn('[мост] партия без имени игры — отброшена', raw);
    return;
  }
  if (!ready) { queue.push(raw); return; }
  await saveSession(raw);
}

/** Поставить приёмник. Зовётся один раз при старте приложения. */
export function installNativeSessionBridge(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__psySaveSession) return;
  w.__psySaveSession = (s: unknown) => { void accept(s); };
  ready = true;
  // Разбираем накопленное: отчёт мог прийти раньше регистрации.
  const pending = queue.splice(0, queue.length);
  for (const s of pending) void saveSession(s);
}

/** Только для проб. */
export const __test = { queue, accept, reset: () => { queue.length = 0; ready = false;
  if (typeof window !== 'undefined') delete (window as unknown as Record<string, unknown>).__psySaveSession; } };
