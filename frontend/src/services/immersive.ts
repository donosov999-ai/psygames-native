/* psygames-immersive · VER 1 · 16.09.2026 */
/**
 * ПОЛНОЭКРАННЫЙ РЕЖИМ ИГРЫ: СИСТЕМНЫЕ ПОЛОСЫ ТЕЛЕФОНА УХОДЯТ, ПОКА ИДЁТ ПАРТИЯ.
 *
 * 🔴 ЗАЧЕМ. Денис 16.09.2026, про «Числовой забег»: «надо добавить и продумать
 * управление полноэкранным режимом». Дорогу чат «Поиска» растянул на весь WebView
 * (69 % → 90 % экрана). Выше и ниже остались полосы ОС: часы, батарея, навигация
 * Android, полоска «домой» на iPhone. Из WebView их не убрать — это нативный
 * слой, команда `set_immersive` в `src-tauri/src/immersive.rs`.
 *
 * КАК УПРАВЛЯЕТСЯ — одно место, `useImmersive(идётПартия)`:
 *   · полосы уходят САМИ, когда партия идёт, — кнопки «на весь экран» нет;
 *   · возвращаются на паузе, в отзыве, на карточке итога, при выходе с экрана
 *     и после сворачивания приложения. Остановился — видишь часы и можешь уйти;
 *   · вытащить полосы можно всегда: свайп от края (Android показывает их поверх
 *     игры на пару секунд, iPhone первым свайпом снизу только подсвечивает полоску);
 *   · кому полосы нужны всегда — пункт «Полноэкранный режим» в меню паузы той же
 *     игры. Выбор запоминается на устройстве и действует во всех таких играх.
 *
 * ⚠️ ЭКРАН ТОЛЬКО ОБЪЯВЛЯЕТ, ЧТО ПАРТИЯ ИДЁТ. Паузу хук слушает сам через
 * `gamePause`: иначе каждая игра заново решала бы, что считать паузой, и первая же
 * забытая ветка (отзыв поверх партии) оставила бы человека без часов на экране меню.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'psygames_immersive';

/** Настройка человека. По умолчанию включено: режим и заводился ради игры на весь экран. */
let _enabled = true;
let _loaded: Promise<void> | null = null;
const _prefListeners = new Set<() => void>();

export function immersiveEnabled(): boolean { return _enabled; }

/** Прочитать сохранённый выбор один раз за запуск. */
export function loadImmersivePref(): Promise<void> {
  if (!_loaded) {
    _loaded = AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'false' && _enabled) { _enabled = false; emitPref(); }
      })
      .catch(() => { /* хранилище недоступно — остаёмся на значении по умолчанию */ });
  }
  return _loaded;
}

export async function setImmersiveEnabled(v: boolean): Promise<void> {
  if (_enabled === v) return;
  _enabled = v;
  emitPref();
  try { await AsyncStorage.setItem(KEY, String(v)); } catch { /* выбор живёт до перезапуска */ }
}

export function onImmersivePref(l: () => void): () => void {
  _prefListeners.add(l);
  return () => { _prefListeners.delete(l); };
}

function emitPref(): void {
  _prefListeners.forEach((l) => { try { l(); } catch { /* слушатель умер — не наша беда */ } });
}

/**
 * Экраны, которые умеют играть на весь экран. Счётчик, а не флаг: при переходе
 * push под новым экраном остаётся смонтированным старый.
 * По этому счётчику меню паузы решает, показывать ли свой пункт.
 */
let _capable = 0;
const _capableListeners = new Set<(capable: boolean) => void>();

export function immersiveCapable(): boolean { return _capable > 0; }

export function declareImmersiveCapable(): () => void {
  _capable += 1;
  if (_capable === 1) emitCapable();
  let снято = false;
  return () => {
    if (снято) return;
    снято = true;
    _capable = Math.max(0, _capable - 1);
    if (_capable === 0) emitCapable();
  };
}

export function onImmersiveCapable(l: (capable: boolean) => void): () => void {
  _capableListeners.add(l);
  return () => { _capableListeners.delete(l); };
}

function emitCapable(): void {
  const c = _capable > 0;
  _capableListeners.forEach((l) => { try { l(c); } catch { /* слушатель умер — не наша беда */ } });
}

/** Последнее, что ушло в нативный слой. `null` — не отправляли или отправка упала. */
let _applied: boolean | null = null;

/**
 * Нативная команда. На вебе (семплы на сайте) и в прогоне проб Tauri нет — тихо
 * ничего. Настольная сборка команду примет и ничего не сделает.
 *
 * `force` — повторить, даже если значение не менялось: после сворачивания ОС
 * возвращает полосы сама, а запомненное здесь «уже спрятаны» было бы ложью.
 */
export function applyImmersive(on: boolean, force = false): void {
  const invoke = (globalThis as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } })
    .__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return;
  if (!force && _applied === on) return;
  _applied = on;
  Promise.resolve()
    .then(() => invoke('set_immersive', { on }))
    .catch(() => { _applied = null; });
}

/** Только для проб: вернуть модуль в исходное состояние между сценариями. */
export function __resetImmersive(): void {
  _enabled = true;
  _loaded = null;
  _capable = 0;
  _applied = null;
  _prefListeners.clear();
  _capableListeners.clear();
}
