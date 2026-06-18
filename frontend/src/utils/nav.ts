import { router } from 'expo-router';

/**
 * Назад на шаг — а если истории нет, уйти Домой.
 *
 * Почему: в плейлистах/Утренней Зарядке переходы между играми идут через
 * `router.replace(...)` (WarmupContext) — он ЗАМЕНЯЕТ текущую запись истории,
 * стек назад пустой → голый `router.back()` = no-op, и кнопка «назад» не
 * выпускает из игры. То же на корневом экране Tauri-вебвью. canGoBack() это
 * ловит и отправляет на главную вместо зависания.
 */
export function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
