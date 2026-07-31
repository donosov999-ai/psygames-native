/**
 * feedbackLoop — обратный контур фидбека, v1.165.0.
 *
 * ЗАЧЕМ. Тестировщик пишет репорт и больше никогда о нём не слышит. У Вали
 * накопилось 30+ репортов; четыре релиза правок ПО НИМ уехали в Play, а она об
 * этом не знает — для неё это выглядит как «пишу в пустоту». Отсюда простое
 * следствие: следующий репорт писать не хочется, а нам он нужен больше всего.
 *
 * КАК РАБОТАЕТ. При починке репорт помечается в базе версией (`fixed_in_version`)
 * и одной фразой «что изменилось» (`fix_note`) — это делается заодно с записью
 * changelog. Приложение спрашивает по СВОЕМУ device_id, что починили по его
 * репортам и уже доехало до его версии, и показывает это в «Что нового».
 *
 * ГРАНИЦЫ. Функция в базе гейтится по device_id и отдаёт только свои репорты —
 * чужой текст не утекает. Версия сравнивается как semver-число, поэтому 1.9.0
 * не оказывается «новее» 1.10.0. Ошибка сети или отсутствие ключей — тихо пусто:
 * блок просто не рисуется, «Что нового» работает как работало.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';
import { getDeviceId } from '@/src/services/appFeedback';
import { currentVersion } from '@/src/services/appUpdates';

/** Локальная отметка «эти уже показали» — чтобы не долбить одним и тем же. */
const SHOWN_KEY = 'psygames_fixed_feedback_shown';

export interface FixedReport {
  id: string;
  created_at: string;
  message: string;
  game_id: string | null;
  fixed_in_version: string;
  fix_note: string;
}

/**
 * Что починили по репортам этого устройства и ещё не показывали.
 * Пустой массив — нормальный результат (нет репортов / нет сети / нет ключей).
 */
export async function getMyFixedReports(): Promise<FixedReport[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const deviceId = await getDeviceId();
    if (!deviceId) return [];

    const { data, error } = await supabase.rpc('psygames_my_fixed_feedback', {
      p_device_id: deviceId,
      p_app_version: currentVersion(),
      p_limit: 10,
    });
    if (error || !Array.isArray(data)) return [];

    const shown = await readShown();
    return (data as FixedReport[]).filter((r) => r && r.id && !shown.includes(r.id));
  } catch {
    return [];
  }
}

/** Пометить показанными — вызывать при закрытии окна, а не при открытии. */
export async function markShown(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const shown = await readShown();
    // держим последние 200 — список не должен расти бесконечно
    const next = [...new Set([...shown, ...ids])].slice(-200);
    await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* не показать второй раз — не беда, а вот падать тут незачем */
  }
}

async function readShown(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
