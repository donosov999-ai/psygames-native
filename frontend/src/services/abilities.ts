/* psygames-abilities · VER 1 · 20.08.2026 */
/**
 * РАСХОДУЕМЫЕ СПОСОБНОСТИ — второй, штучный товар за те же очки.
 *
 * 🔴 ЧТО БЫЛО ДО. Очки копились (`tokens.ts`), начислялись по одному правилу
 * (`earn.ts`) и тратились ровно на одно — КОСМЕТИКУ: акцент, рамку, титул, аватар,
 * аксессуар питомцу (`cosmetics.ts`, 55 позиций, 250…800⭐). Ни одна покупка не
 * касалась партии. Копить было незачем всем, кто к цвету интерфейса равнодушен.
 *
 * ── ГЛАВНОЕ ПРАВИЛО: СПОСОБНОСТЬ НЕ РЕШАЕТ ЗАДАЧУ ───────────────────────────
 *
 * Это тренажёр. Способность, которая подсказывает, добавляет время на поиск или
 * снимает лимит ходов, — продажа СЛОЖНОСТИ: результат обесценивается, а замер
 * (спан, mean_rt, точность) начинает мерить кошелёк. Поэтому здесь продаётся
 * только то, что снимает ДОСАДУ и не касается самой задачи:
 *
 *   вторая жизнь  — партия не обрывается на одном промахе, но ошибка ОСТАЁТСЯ
 *                   в записи, а лестница уровней замирает до конца партии;
 *   пробный заход — партия не записывается ВООБЩЕ: ни очков, ни уровня, ни
 *                   статистики. Это не поблажка, это отказ от награды;
 *   щит серии     — возвращает оборванную серию захода. Партий не касается вовсе.
 *
 * ── ЭКОНОМИЧЕСКИЙ ИНВАРИАНТ: СПОСОБНОСТЬ НЕ ОКУПАЕТСЯ ───────────────────────
 *
 * У каждой записи есть `maxReturn` — потолок того, сколько очков она может вернуть,
 * и цена ОБЯЗАНА быть строго выше. Иначе покупка перестаёт быть решением и
 * становится станком: купил за 60, отыграл 100, повторил. Потолок не выдуман:
 *
 *   партия      ≤ TOKEN_DELTA_CAP × MULTIPLIER = 100⭐ (потолок начисления × множитель)
 *   щит серии   ≤ checkInStreakMaxLoss() — разница бонусов за 7 дней отрастания
 *   пробный ход = 0 — незаписанная партия не приносит ничего по построению
 *
 * Гейт `abilities-economy.test.ts` считает это ЖИВЫМИ функциями, а не числами в
 * комментарии: поднимут потолок начисления — цены обязаны подняться следом.
 *
 * ── ПОЧЕМУ ЦЕНЫ ИМЕННО ТАКИЕ ────────────────────────────────────────────────
 *
 * Косметика стоит 250…800⭐ и покупается НАВСЕГДА. Способность расходуется. Сделай
 * её дешёвой — и косметику перестанут брать: штучный расход всегда выигрывает у
 * накопления. Поэтому самая дешёвая способность (60⭐) — это четверть самой дешёвой
 * косметики, а самая дорогая (300⭐) стоит дороже неё. Способность каждый день
 * заметно отодвигает косметику, и это видно человеку по балансу.
 *
 * ⚠️ ВСЕ ИЗМЕНЕНИЯ КОШЕЛЬКА ИДУТ ЧЕРЕЗ ОДНУ ОЧЕРЕДЬ (`serial`). Покупка и трата —
 * это «прочитал → посчитал → записал» поверх AsyncStorage. Два таких хода внахлёст
 * (двойное нажатие, две вкладки) читают одно и то же и записывают одно и то же:
 * одна штука тратится дважды, а на две покупки уходят деньги за одну. Очередь
 * делает каждую операцию неделимой; это единственная причина, по которой она здесь.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MULTIPLIER } from '@/src/services/earn';
import { TOKEN_DELTA_CAP, addTokens, checkInStreakMaxLoss, getTokens, spendTokens } from '@/src/services/tokens';

export type AbilityId = 'second_life' | 'practice_run' | 'streak_shield';

/** Потолок того, что партия вообще способна принести: начисление × множитель. */
export const MAX_ROUND_EARNING = TOKEN_DELTA_CAP * MULTIPLIER;

export interface Ability {
  id: AbilityId;
  /** Ключи словаря — в приложении 12 языков, готовых строк здесь быть не может. */
  nameKey: string;
  descKey: string;
  cost: number;
  /** Сколько штук помещается в кошелёк: расходник не должен копиться мешками. */
  max: number;
  /** Потолок очков, которые эта способность способна вернуть. Цена обязана быть выше. */
  maxReturn: number;
  /** Ionicons — тем же способом, что у косметики в магазине. */
  icon: string;
}

export const ABILITIES: Ability[] = [
  {
    id: 'second_life',
    nameKey: 'abName_second_life',
    descKey: 'abDesc_second_life',
    cost: 120,
    max: 5,
    maxReturn: MAX_ROUND_EARNING,
    icon: 'heart',
  },
  {
    id: 'practice_run',
    nameKey: 'abName_practice_run',
    descKey: 'abDesc_practice_run',
    cost: 60,
    max: 10,
    maxReturn: 0,
    icon: 'flask',
  },
  {
    id: 'streak_shield',
    nameKey: 'abName_streak_shield',
    descKey: 'abDesc_streak_shield',
    cost: 300,
    max: 2,
    maxReturn: checkInStreakMaxLoss(),
    icon: 'shield-checkmark',
  },
];

export function abilityById(id: AbilityId): Ability | undefined {
  return ABILITIES.find((a) => a.id === id);
}

export type AbilityCounts = Partial<Record<AbilityId, number>>;

const KEY = 'psygames_abilities_v1';
type Wallet = Record<string, AbilityCounts>;

// ── очередь: любая правка кошелька неделима ─────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();

function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);   // упавшая операция не рвёт очередь следующим
  return next;
}

async function readWallet(): Promise<Wallet> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Wallet) : {};
  } catch { return {}; }
}

const listeners = new Set<(pid: string) => void>();

/** Подписка для экранов: кошелёк изменился — перечитай остаток. */
export function onAbilitiesChanged(cb: (pid: string) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notify(pid: string): void {
  listeners.forEach((cb) => { try { cb(pid); } catch { /* слушатель не ломает кошелёк */ } });
}

// ── чтение ──────────────────────────────────────────────────────────────────

/**
 * Весь кошелёк профиля. ⚠️ Кошельки РАЗДЕЛЬНЫЕ: на семейном устройстве Алекс не
 * должен тратить купленное Валей — покупки лежат под ключом профиля, как звёзды,
 * уровни и косметика.
 */
export async function getAbilityCounts(profileId: string): Promise<AbilityCounts> {
  if (!profileId) return {};
  const w = await readWallet();
  return w[profileId] ?? {};
}

export async function getAbilityCount(profileId: string, id: AbilityId): Promise<number> {
  const counts = await getAbilityCounts(profileId);
  return counts[id] ?? 0;
}

// ── покупка ─────────────────────────────────────────────────────────────────

export type BuyReason = 'bought' | 'noProfile' | 'unknown' | 'full' | 'poor';

export interface BuyResult { ok: boolean; reason: BuyReason; count: number; balance: number }

/**
 * Купить штуку. Возвращает ПРИЧИНУ отказа, а не голое false: магазину нужно сказать
 * человеку, что именно не так — «не хватает очков» и «больше в кошелёк не влезет»
 * это разные ответы, и молчаливая кнопка на оба не годится.
 *
 * ⚠️ В МИНУС НЕ УХОДИТ: списание идёт через `spendTokens`, который сравнивает баланс
 * ДО списания и отказывает целиком. Штука прибавляется ТОЛЬКО после успешного
 * списания — при обратном порядке сбой записи очков дарил бы способность даром.
 */
export async function buyAbility(profileId: string, id: AbilityId): Promise<BuyResult> {
  return serial(async () => {
    const balance0 = profileId ? await getTokens(profileId) : 0;
    const fail = (reason: BuyReason, count = 0): BuyResult => ({ ok: false, reason, count, balance: balance0 });
    if (!profileId) return fail('noProfile');
    const ability = abilityById(id);
    if (!ability) return fail('unknown');

    const wallet = await readWallet();
    const counts = wallet[profileId] ?? {};
    const have = counts[id] ?? 0;
    if (have >= ability.max) return fail('full', have);
    if (balance0 < ability.cost) return fail('poor', have);

    const paid = await spendTokens(profileId, ability.cost);
    if (!paid) return fail('poor', have);

    wallet[profileId] = { ...counts, [id]: have + 1 };
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(wallet));
    } catch {
      // Очки уже списаны, а штука не записалась — возвращаем деньги. Без возврата
      // человек остался бы и без очков, и без покупки, и объяснить это было бы нечем.
      await addTokens(profileId, ability.cost);
      return fail('unknown', have);
    }
    notify(profileId);
    return { ok: true, reason: 'bought', count: have + 1, balance: await getTokens(profileId) };
  });
}

// ── трата ───────────────────────────────────────────────────────────────────

/**
 * Потратить одну штуку. `false` — тратить нечего, и вызывающий обязан на этом
 * остановиться: списание и есть разрешение на действие.
 *
 * ⚠️ ПРОВЕРКА И СПИСАНИЕ — ОДНА ОПЕРАЦИЯ. Разнеси их (сначала спросил остаток,
 * потом потратил) — и два нажатия подряд оба увидят «есть штука». Именно так
 * расходник тратится дважды с одной покупки.
 */
export async function useAbility(profileId: string, id: AbilityId): Promise<boolean> {
  return serial(async () => {
    if (!profileId || !abilityById(id)) return false;
    const wallet = await readWallet();
    const counts = wallet[profileId] ?? {};
    const have = counts[id] ?? 0;
    if (have <= 0) return false;
    wallet[profileId] = { ...counts, [id]: have - 1 };
    try { await AsyncStorage.setItem(KEY, JSON.stringify(wallet)); }
    catch { return false; }   // не записалось — значит и не потрачено
    notify(profileId);
    return true;
  });
}

/** Только для проверок: очистить очередь и слушателей между случаями. */
export function __resetAbilitiesMemory(): void {
  queue = Promise.resolve();
  listeners.clear();
}
