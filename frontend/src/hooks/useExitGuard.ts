/**
 * useExitGuard — выход из игры не стирает партию.
 *
 * ЗАЧЕМ. Замер 19.08.2026: подтверждения выхода не было НИ В ОДНОЙ из 64 игр
 * (`Alert.alert`/`confirm(` по `app/games/*.tsx` — ноль совпадений), каркас
 * `GameShell` звал `onBack` напрямую, и у 45 экранов это был голый
 * `goBackOrHome()`. Человек разбирает маджонг двадцать минут, промахивается
 * пальцем по кнопке «назад» в шапке — доска исчезает молча, без вопроса и без
 * возможности вернуться. Аппаратная «назад» на Android не была перехвачена
 * нигде: единственный `BackHandler` в проекте — в `WarmupContext`, и он про
 * зарядку.
 *
 * ДВЕ ПОЛОВИНЫ ОДНОЙ ЗАЩИТЫ, и обе обязательны:
 *   1. СПРОСИТЬ, когда есть что терять. Вопрос там, где терять нечего, —
 *      раздражает сильнее, чем помогает, поэтому «есть что терять» решает сама
 *      игра и передаёт сюда флагом `armed`.
 *   2. ДОПИСАТЬ партию перед уходом (`onSave`) — и при подтверждении, и при
 *      сносе экрана. Второе важнее: экран сносят не только кнопкой «назад», но
 *      и переходом зарядки, и убийством приложения системой.
 *
 * ⚠️ ОТКУДА ЯДРО ОТДЕЛЬНО ОТ ХУКА. `createExitGuard` — обычный объект без React:
 * его можно прогнать в тесте по-настоящему, нажатие за нажатием. Хук тестов в
 * этом проекте нет (`testMatch` — только `*.test.ts`, рендерера компонентов в
 * зависимостях нет), а проверять эту логику надо поведением, а не чтением
 * исходников.
 *
 * ⚠️ АППАРАТНАЯ «НАЗАД» — ДВА РАЗНЫХ МЕХАНИЗМА, потому что сборок две:
 *   · нативная сборка (Expo/EAS) — `BackHandler`;
 *   · Android у нас Tauri-WebView, там `Platform.OS === 'web'` и
 *     `BackHandler` из react-native-web — заглушка, которая ещё и печатает
 *     console.error. Физическая кнопка отдаётся в историю webview, значит
 *     ловить надо `popstate`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

export interface ExitGuardDeps {
  /**
   * Есть ли ПРЯМО СЕЙЧАС что терять. Читается в момент нажатия, а не при
   * создании: партия начинается и кончается, пока экран жив.
   */
  isArmed: () => boolean;
  /** Дописать незаконченную партию в хранилище. */
  save?: () => void;
  /** Уйти с экрана (обычно goBackOrHome). */
  exit: () => void;
  /** Показать/спрятать вопрос. */
  setAsking: (asking: boolean) => void;
}

export interface ExitGuardCore {
  /** Нажали «назад» — в шапке или аппаратную. Спросит либо выйдет сразу. */
  requestExit: () => void;
  /** «Выйти» в вопросе. */
  confirmExit: () => void;
  /** «Продолжить игру» в вопросе. */
  stay: () => void;
  /** Экран сносят — последний шанс дописать партию. */
  teardown: () => void;
  /** Висит ли вопрос. */
  readonly asking: boolean;
}

/**
 * Ядро без React. Правила, ради которых оно вообще есть:
 *  · терять нечего → уходим МОЛЧА (никакого «вы уверены?»);
 *  · есть что терять → сохраняем СРАЗУ и спрашиваем. Сохранение до ответа —
 *    страховка: пока висит вопрос, телефон могут выключить, и партия должна
 *    быть уже на диске;
 *  · уходим ровно один раз — двойное нажатие по «Выйти» не должно давать
 *    вторую навигацию (на вебе это уводило бы на два экрана назад).
 */
/**
 * 🔴 Через сколько защёлка «уже ушли» отпускается сама. Обычный выход сносит
 * экран, и защёлка умирает вместе с ним. Но «выход» бывает ВНУТРИЭКРАННЫМ:
 * карта и дочерняя сетка фрактала — один GameShell в одной позиции дерева,
 * React его не перемонтирует, и вечная защёлка после «назад» из сетки хоронила
 * кнопку «назад» карты насовсем (Валя 21.08 «работает через раз», Денис 28.08
 * «не выйти из упражнения» — requestExit умирал на `if (left) return`).
 * Двойное нажатие «Выйти» защёлка гасит по-прежнему: вторая навигация успевает
 * только в первые сотни миллисекунд, дольше вопрос просто не живёт.
 */
const LEFT_RELEASE_MS = 600;

export function createExitGuard(deps: ExitGuardDeps): ExitGuardCore {
  let asking = false;
  let left = false;
  let leftTimer: ReturnType<typeof setTimeout> | null = null;

  const show = (v: boolean) => {
    if (asking === v) return;
    asking = v;
    deps.setAsking(v);
  };

  /** Уйти ровно один раз — и не навсегда: экран мог остаться жив (см. LEFT_RELEASE_MS). */
  const leaveOnce = () => {
    left = true;
    if (leftTimer) clearTimeout(leftTimer);
    leftTimer = setTimeout(() => { left = false; }, LEFT_RELEASE_MS);
    deps.exit();
  };

  return {
    get asking() { return asking; },

    requestExit() {
      if (left) return;
      if (!deps.isArmed()) { leaveOnce(); return; }
      deps.save?.();
      show(true);
    },

    confirmExit() {
      if (left) return;
      deps.save?.();
      show(false);
      leaveOnce();
    },

    stay() { show(false); },

    teardown() {
      // Ушли по своей воле — партия уже дописана в confirmExit, второй раз незачем.
      if (left) return;
      if (deps.isArmed()) deps.save?.();
    },
  };
}

export interface UseExitGuardOptions {
  /** Партия идёт и в ней есть что терять. */
  armed: boolean;
  /** Куда уходим после подтверждения. */
  onExit: () => void;
  /** Дописать партию (в слой `services/resume`). */
  onSave?: () => void;
}

export interface UseExitGuardResult {
  asking: boolean;
  requestExit: () => void;
  confirmExit: () => void;
  stay: () => void;
}

/** Метка нашей записи в истории webview. */
const GUARD_MARK = '__psygamesExitGuard';

/** Сколько ждём popstate после history.back(), прежде чем уйти всё равно. */
const POP_TIMEOUT_MS = 150;

const isWebHistory = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.history !== 'undefined';

export function useExitGuard({ armed, onExit, onSave }: UseExitGuardOptions): UseExitGuardResult {
  const [asking, setAsking] = useState(false);

  // Ядро создаётся один раз, а свежие armed/onExit/onSave берёт отсюда: иначе
  // при каждом ходе пересоздавался бы обработчик аппаратной кнопки.
  const live = useRef({ armed, onExit, onSave });
  live.current = { armed, onExit, onSave };

  /** Наш popstate, а не человеческий: снимаем сторож сами и вопрос не задаём. */
  const selfPop = useRef(false);

  /**
   * Снять сторож из истории и только ПОТОМ уйти. Порядок принципиален: если
   * сначала позвать router.back(), он съест наш сторож вместо предыдущего
   * экрана, и человек останется на той же игре.
   */
  const leaveWeb = useCallback((go: () => void) => {
    if (!isWebHistory() || !(window.history.state as any)?.[GUARD_MARK]) { go(); return; }
    selfPop.current = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', finish);
      go();
    };
    window.addEventListener('popstate', finish);
    window.history.back();
    // Страховка: если popstate почему-то не придёт, выход не должен зависнуть.
    setTimeout(finish, POP_TIMEOUT_MS);
  }, []);

  const coreRef = useRef<ExitGuardCore | null>(null);
  if (!coreRef.current) {
    coreRef.current = createExitGuard({
      isArmed: () => live.current.armed,
      save: () => live.current.onSave?.(),
      exit: () => leaveWeb(() => live.current.onExit()),
      setAsking,
    });
  }
  const core = coreRef.current;

  // Снос экрана — партия дописывается даже если «назад» никто не нажимал:
  // так переживается переход зарядки и убийство приложения системой.
  useEffect(() => () => { core.teardown(); }, [core]);

  // Аппаратная «назад» в нативной сборке. Перехватываем ВСЕГДА, даже когда
  // терять нечего: смысл требования — кнопка ведёт себя как та, что в шапке,
  // а не выбрасывает из игры мимо всех проверок.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      core.requestExit();
      return true;
    });
    return () => sub.remove();
  }, [core]);

  // Аппаратная «назад» в Tauri-WebView и в браузере.
  //
  // ⚠️ Сторож ставим ТОЛЬКО когда есть что терять. Пока терять нечего, историю
  // не трогаем вовсе — обычная навигация остаётся ровно такой, какой была.
  //
  // ⚠️ Сторож — КОПИЯ текущей записи (`...history.state`) плюс метка. Ключ `id`
  // внутри — это то, по чему expo-router (fork createMemoryHistory) находит
  // свою запись в списке. Потеряем `id` — роутер при возврате сочтёт запись
  // чужой и пересоберёт корень навигации, то есть перемонтирует игру и сотрёт
  // доску тем самым способом, от которого мы защищаемся.
  useEffect(() => {
    if (!isWebHistory() || !armed) return;

    const pushGuard = () => {
      const st = (window.history.state ?? {}) as Record<string, unknown>;
      if (st[GUARD_MARK]) return;
      window.history.pushState({ ...st, [GUARD_MARK]: true }, '');
    };

    const onPop = () => {
      if (selfPop.current) { selfPop.current = false; return; }
      pushGuard();          // вернуть сторож на место — с экрана не уходим
      core.requestExit();
    };

    // Начинаем с чистого флага. Партия в игре с уровнями кончается и начинается
    // заново, не сходя с экрана (собрал раскладку → «дальше» → новая): флаг,
    // оставшийся с прошлой партии, съел бы ПЕРВОЕ настоящее нажатие «назад» на
    // следующем уровне — молча, то есть ровно тем способом, от которого защита.
    selfPop.current = false;
    pushGuard();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Партия кончилась (armed стал false) — сторож обязан уйти, иначе кнопка
      // «домой» на карточке итога съест его вместо выхода.
      // Флаг здесь НЕ ставим: обработчик уже снят строкой выше, глотать этот
      // popstate некому, а поставленный флаг дожил бы до следующей партии.
      if ((window.history.state as any)?.[GUARD_MARK]) window.history.back();
    };
  }, [armed, core]);

  return {
    asking,
    requestExit: useCallback(() => core.requestExit(), [core]),
    confirmExit: useCallback(() => core.confirmExit(), [core]),
    stay: useCallback(() => core.stay(), [core]),
  };
}
