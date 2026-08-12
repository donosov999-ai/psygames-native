/**
 * resume — НЕЗАКОНЧЕННАЯ ПАРТИЯ, общий слой для всех игр.
 *
 * ЗАЧЕМ. До этого понятия «незаконченная партия» в приложении не существовало ни у одной
 * из 61 игры. Каждый экран держал состояние внутри себя и ронял его при выходе; в хранилище
 * ложились только мелочи вроде выбранного стиля цифр. Замер судоку 10.08.2026: играешь
 * двадцать минут, сворачиваешь приложение — доска и все введённые цифры исчезают, уровень
 * начинается заново. Хранилось ровно три вещи: стиль цифр, номер уровня и «видел подсказку
 * про правила».
 *
 * По-настоящему это вскрылось при разборе длинных режимов (самурай, фрактальная судоку —
 * партия на час). Такой режим без сохранения нежизнеспособен: любой звонок стирает час
 * работы. Но чинить это внутри судоку — значит оставить ту же дыру для нонограмм, какуро
 * и всего длинного, что появится дальше. Поэтому слой общий.
 *
 * ЧТО ЭТО НЕ ДЕЛАЕТ. Не знает про правила игр. Игра сама решает, что она кладёт в state и
 * как его читает обратно — здесь только конверт: версия, отметка времени и JSON.
 *
 * ⚠️ Не путать с `saveSession` из `services/api` — то запись ЗАКОНЧЕННОЙ партии на сервер
 * (очки, время, passed). Здесь ровно наоборот: то, что человек ещё не доиграл, и лежит
 * оно только на устройстве.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';

/** Ключ того же вида, что у остальных: psygames_<что>_<game>_<profile>. */
function key(gameId: string, profileId: string): string {
  return `psygames_resume_${gameId}_${profileId}`;
}

/**
 * Партия старше этого срока не предлагается к продолжению. Человек за месяц забывает,
 * что он там решал, и «продолжить» превращается в загадку вместо удобства.
 */
export const RESUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ResumeEnvelope<T> {
  /**
   * Версия ФОРМАТА состояния, которую задаёт сама игра. Ключевая вещь: когда мы поменяем
   * набор полей доски, старая запись перестанет подходить под новый код. Без версии экран
   * упадёт на чужих данных; с версией — просто не найдёт партию и начнёт заново.
   */
  v: number;
  savedAt: number;
  state: T;
}

/**
 * Сохранить незаконченную партию. Ошибки глотаем: сохранение — удобство, из-за него
 * игра падать не должна.
 */
export async function saveResume<T>(gameId: string, profileId: string, v: number, state: T): Promise<void> {
  if (IS_WEB_DEMO) return;   // демо-сборка прогресс не пишет — как в usePersistentLevel
  try {
    const env: ResumeEnvelope<T> = { v, savedAt: Date.now(), state };
    await AsyncStorage.setItem(key(gameId, profileId), JSON.stringify(env));
  } catch { /* нет места / хранилище недоступно — просто без продолжения */ }
}

/**
 * Прочитать незаконченную партию. Вернёт null, если её нет, если формат другой версии
 * или если она протухла. Протухшую заодно подчищаем, чтобы не копилась.
 */
export async function loadResume<T>(gameId: string, profileId: string, v: number): Promise<T | null> {
  if (IS_WEB_DEMO) return null;
  try {
    const raw = await AsyncStorage.getItem(key(gameId, profileId));
    if (!raw) return null;
    const env = JSON.parse(raw) as ResumeEnvelope<T>;
    if (!env || env.v !== v || typeof env.savedAt !== 'number') { await clearResume(gameId, profileId); return null; }
    if (Date.now() - env.savedAt > RESUME_MAX_AGE_MS) { await clearResume(gameId, profileId); return null; }
    return env.state ?? null;
  } catch {
    return null;   // битый JSON — считаем, что партии нет
  }
}

/** Выбросить партию: доиграна, проиграна или человек начал заново. */
export async function clearResume(gameId: string, profileId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(gameId, profileId)); } catch { /* уже нет */ }
}

export interface ResumableGame {
  gameId: string;
  savedAt: number;
}

/**
 * Берёт самую свежую партию, для которой всё ещё есть запись в реестре игр.
 * Возвращаем сам объект реестра: вызывающий код получает канонический `route`, а не
 * пытается собрать URL из gameId (они не совпадают у большинства игр).
 */
export function resolveResumableGame<T extends { id: string }>(
  resumable: ResumableGame[],
  registry: readonly T[],
): T | null {
  const byId = new Map(registry.map((game) => [game.id, game]));
  for (const item of resumable) {
    const game = byId.get(item.gameId);
    if (game) return game;
  }
  return null;
}

/**
 * Какие игры ждут продолжения у этого профиля. Для карточки «Продолжить» на главной —
 * читает только заголовки, сами состояния не разбирает.
 */
export async function listResumable(profileId: string): Promise<ResumableGame[]> {
  if (IS_WEB_DEMO) return [];
  try {
    const suffix = `_${profileId}`;
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (k) => k.startsWith('psygames_resume_') && k.endsWith(suffix),
    );
    if (!keys.length) return [];
    const pairs = await AsyncStorage.multiGet(keys);
    const now = Date.now();
    const out: ResumableGame[] = [];
    for (const [k, raw] of pairs) {
      if (!raw) continue;
      try {
        const env = JSON.parse(raw) as ResumeEnvelope<unknown>;
        if (typeof env?.savedAt !== 'number' || now - env.savedAt > RESUME_MAX_AGE_MS) continue;
        // psygames_resume_<gameId>_<profileId> → вырезаем префикс и хвост профиля
        out.push({ gameId: k.slice('psygames_resume_'.length, k.length - suffix.length), savedAt: env.savedAt });
      } catch { /* битая запись — пропускаем, чужие партии из-за неё показывать не перестаём */ }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}
