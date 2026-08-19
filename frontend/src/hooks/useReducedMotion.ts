/**
 * Системная настройка «меньше движения» — один источник правды на всё приложение.
 *
 * ЗАЧЕМ. Вестибулярная чувствительность (мигрень, ВСД, укачивание, последствия
 * сотрясения) — это не «не люблю анимации». Плавные проезды, тряска и
 * разлетающиеся частицы вызывают у таких людей настоящую тошноту и
 * головокружение, и человек просто закрывает приложение. Настройку он уже
 * выставил один раз в системе — приложение обязано её услышать, а не заводить
 * собственный тумблер, про который никто не знает. Это же требование Apple
 * (Reduce Motion) и Google Play (Remove animations) при ревью, и WCAG 2.3.3.
 *
 * ЧТО ЭТО НЕ ЗНАЧИТ. Это не «выключить всю анимацию». Движение, которое НЕСЁТ
 * СМЫСЛ (карта перевернулась, шарик надулся, засчитано «+40»), должно остаться —
 * иначе игра перестаёт быть понятной. Гасим декоративное (ховер-подъём,
 * подпрыгивание бейджа, полёт очков), а смысловое делаем мгновенным вместо
 * плавного. Правило применяется в местах вызова; здесь — только чтение флага.
 *
 * ГРАБЛЯ ПРО ВЕБ, ИЗ-ЗА КОТОРОЙ ЗДЕСЬ РУЧНОЙ matchMedia.
 * Соблазн — позвать `AccessibilityInfo.isReduceMotionEnabled()` на обеих
 * платформах: у react-native-web метод есть. Но в его реализации стоит
 *   `resolve(prefersReducedMotionMedia ? media.matches : true)`
 * то есть БЕЗ DOM он отвечает `true`. А DOM'а нет ровно там, где Expo с
 * `output: "static"` пререндерит страницы на сборке — и тогда «щадящий режим»
 * молча включился бы всем подряд. Поэтому веб читаем медиазапросом напрямую:
 * нет matchMedia → настройки нет → false.
 *
 * ПОЧЕМУ ВЕБ ВАЖЕН БОЛЬШЕ НАТИВА. Android-сборка у нас Tauri, то есть WebView,
 * и для React Native это ровно `web` (та же грабля, что съела вибрацию в
 * juice/haptics.ts). Нативная ветка нужна для iOS, но живёт большинство здесь.
 *
 * ПОЧЕМУ СТАРТУЕМ С false, А НЕ ЧИТАЕМ СРАЗУ. Статический экспорт рендерит
 * разметку на сборке и гидратирует её в браузере: если первый клиентский рендер
 * разойдётся с серверным, React ругнётся и перерисует дерево. Поэтому обе
 * стороны стартуют одинаково, а настоящее значение приезжает эффектом. Для нас
 * это безопасно: гасим анимации, которые запускаются по действию человека
 * (нажал, набрал очки, перевернул карту), — к тому моменту эффект давно отработал.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Тот же запрос, что понимает CSS: системный тумблер «уменьшить движение». */
const WEB_QUERY = '(prefers-reduced-motion: reduce)';

type MediaLike = {
  matches: boolean;
  addEventListener?: (t: 'change', f: (e: { matches: boolean }) => void) => void;
  removeEventListener?: (t: 'change', f: (e: { matches: boolean }) => void) => void;
  /** WebView до Chromium 85 знает только это. */
  addListener?: (f: (e: { matches: boolean }) => void) => void;
  removeListener?: (f: (e: { matches: boolean }) => void) => void;
};

/** Медиазапрос, если браузер вообще есть. Вне браузера — null, а не выдумка. */
function webMedia(): MediaLike | null {
  if (Platform.OS !== 'web') return null;
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (typeof w?.matchMedia !== 'function') return null;
  try { return w.matchMedia(WEB_QUERY) as MediaLike; } catch { return null; }
}

/**
 * Щадящий режим прямо сейчас, синхронно — для кода вне рендера (обработчик
 * жеста, императивный запуск анимации). В нативе синхронного ответа не бывает,
 * поэтому там честный `false`: натив спрашивают хуком.
 */
export function reducedMotionNow(): boolean {
  return !!webMedia()?.matches;
}

/**
 * Включён ли щадящий режим. Обновляется на лету: человек передвинул системный
 * тумблер — экран перестраивается без перезапуска приложения.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    const apply = (v: boolean) => { if (alive) setReduced(!!v); };

    const media = webMedia();
    if (media) {
      apply(media.matches);
      const onChange = (e: { matches: boolean }) => apply(!!e.matches);
      if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
      else media.addListener?.(onChange);
      return () => {
        alive = false;
        if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onChange);
        else media.removeListener?.(onChange);
      };
    }
    if (Platform.OS === 'web') return () => { alive = false; };   // веб без matchMedia — нативную ветку не трогаем

    // Натив: разовый опрос + подписка. Оба вызова через `?.` — на части прошивок
    // и в тестовых окружениях методов может не быть, падать из-за этого нельзя.
    AccessibilityInfo.isReduceMotionEnabled?.().then(apply).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', apply);
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  return reduced;
}
