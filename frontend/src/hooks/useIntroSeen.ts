/* psygames-use-intro-seen · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача d952c080, отчёт 96ea896d */
/**
 * useIntroSeen — ЗНАКОМСТВО С ИГРОЙ (ПРАВИЛА + ТРЕНИРОВКА) САМО ТОЛЬКО ПЕРВЫЙ РАЗ, ПО ПРОФИЛЮ.
 *
 * Отчёт 96ea896d (17.09.2026, 2.54.17, «Соедини точки», уровень 13): «тренировку показывает
 * при каждом запуске, надо, чтобы только первые запуски». До этого знакомство шло на первом
 * «Начать» за ЗАХОД на экран — и на каждом новом заходе, и при каждом запуске из зарядки
 * (автостарт начинал партию с правил) человек снова проходил тренировку 4×4.
 *
 * Флаг хранится по профилю: на одном телефоне играют разные люди, и новый профиль знакомство
 * должен увидеть. Ключ AsyncStorage — `psygames_<gameId>_intro_seen_<profileId>` = '1'.
 *
 * Пройденным знакомство считает ЭКРАН, когда в партии сделан первый ход (модуль сообщает
 * `onProgress(true)`): одно нажатие «Начать» и выход с экрана правил — не знакомство.
 *
 * `loaded` вычисляется для ТЕКУЩЕГО ключа: значение хранится вместе с ключом, для которого
 * прочитано. Иначе после смены профиля на один кадр читался бы флаг прошлого профиля.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';

export function introSeenKey(gameId: string, profileId: string): string {
  return `psygames_${gameId}_intro_seen_${profileId}`;
}

export interface IntroSeen {
  /** Флаг прочитан для текущего профиля. */
  loaded: boolean;
  /** Знакомство уже пройдено этим профилем. До загрузки — false. */
  seen: boolean;
  /** Отметить пройденным (запись в хранилище; повторный вызов безвреден). */
  markSeen: () => void;
}

export function useIntroSeen(gameId: string): IntroSeen {
  const { profile } = useProfile();
  const pid = (profile as { id?: string } | null)?.id ?? 'default';
  const key = introSeenKey(gameId, pid);
  const [state, setState] = useState<{ key: string; seen: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => { if (alive) setState({ key, seen: v === '1' }); })
      .catch(() => { if (alive) setState({ key, seen: false }); });
    return () => { alive = false; };
  }, [key]);

  const markSeen = useCallback(() => {
    setState((cur) => (cur?.key === key && cur.seen ? cur : { key, seen: true }));
    AsyncStorage.setItem(key, '1').catch(() => {});
  }, [key]);

  const loaded = state !== null && state.key === key;
  return { loaded, seen: loaded && state.seen, markSeen };
}
