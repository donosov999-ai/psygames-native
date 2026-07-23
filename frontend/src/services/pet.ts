/**
 * pet — питомец «Синапс» (портирован с промо-сайта psy-games.pro, NeuroPet.astro).
 *
 * Зачем отдельный сервис: стадию/шкалы считают ТРИ потребителя (экран /pet,
 * гуляющий оверлей WalkingPet, мини-аватар в шапке главной) — математика и
 * реплики живут в одном месте, чтобы стадия нигде не разъехалась.
 *
 * Метрика намеренно простая («сколько тренировок в домене»), без очков/весов:
 * питомец — мотиватор регулярности, а не вторая система скоринга (очки уже
 * есть — токены ⭐). Сессии берём ГЛОБАЛЬНО (без фильтра по профилю) — так же,
 * как экран статистики: Синапс один на устройство, «семейный» питомец.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessions } from '@/src/services/api';
import { GAMES, GameCategory } from '@/src/constants/games';

/** Тумблер «Питомец Синапс» в настройках (паттерн = getDevChatVisible в
 *  appFeedback.ts: '0' = скрыт, дефолт ВКЛ). Прячет только ГУЛЯЮЩЕГО питомца —
 *  экран /pet и мини-аватар в шапке остаются: они не «мешаются», это навигация. */
const PET_KEY = 'psygames_pet_on';
export async function getPetVisible(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(PET_KEY)) !== '0'; } catch { return true; }
}
export async function setPetVisible(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(PET_KEY, on ? '1' : '0'); } catch {}
}

/** Масштаб гуляющего питомца (ползунок в настройках): 0.6×..1.8×, дефолт 1.
 *  Касается ТОЛЬКО прогулочного оверлея — аватар в шапке и экран /pet имеют
 *  свои фиксированные размеры (там масштаб решает раскладка, не вкус). */
const SCALE_KEY = 'psygames_pet_scale';
export const PET_SCALE_MIN = 0.6;
export const PET_SCALE_MAX = 1.8;
export const PET_SCALE_DEFAULT = 1;
const clampScale = (v: number) =>
  Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, v));
export async function getPetScale(): Promise<number> {
  try {
    const v = parseFloat((await AsyncStorage.getItem(SCALE_KEY)) ?? '');
    return Number.isFinite(v) ? clampScale(v) : PET_SCALE_DEFAULT;
  } catch { return PET_SCALE_DEFAULT; }
}
export async function setPetScale(v: number): Promise<void> {
  try { await AsyncStorage.setItem(SCALE_KEY, String(clampScale(v))); } catch {}
}
/** Имя события DeviceEventEmitter для живого применения ползунка:
 *  настройки шлют новое значение, гуляющий питомец подхватывает без навигации. */
export const PET_SCALE_EVENT = 'psygames-pet-scale';

/** Скин питомца: «cat» (канон, дефолт) · «robot» (прежний Синапс hi-res) ·
 *  «constellation» (semi-realistic, в UI подписан «Нейрон»). Выбор на /pet. */
const SKIN_KEY = 'psygames_pet_skin';
export type { PetSkin } from '@/src/components/pet/PetSprite';
export async function getPetSkin(): Promise<'cat' | 'robot' | 'constellation'> {
  try {
    const v = await AsyncStorage.getItem(SKIN_KEY);
    return v === 'robot' || v === 'constellation' ? v : 'cat';
  } catch { return 'cat'; }
}
export async function setPetSkin(skin: 'cat' | 'robot' | 'constellation'): Promise<void> {
  try { await AsyncStorage.setItem(SKIN_KEY, skin); } catch {}
}

export type PetStage = 1 | 2 | 3;

// Имена стадий («Искра/Импульс/Созвездие», 1:1 с сайта COPY.stages в NeuroPet.astro)
// живут в словаре LanguageContext (ключи petStage1..petStage3) — рендер через t(`petStage${stage}`).

/**
 * Реплики питомца живут в petLines.ts (27 фраз × 12 языков, контекстные:
 * время суток / стадия / «вернулся» / «только что сыграл» + диалоги-цепочки).
 * Было 3 фразы с промо-сайта — примелькались за день.
 */
export { pickPetLine, pickSimpleLine } from '@/src/services/petLines';
export type { PetLine, PetLineCtx } from '@/src/services/petLines';

/** Обратная совместимость (экран /pet): случайная фраза без контекста. */
export function pickReaction(language: string): string {
  return pickSimpleLineImpl(language);
}
// Отдельное имя, чтобы не конфликтовать с re-export'ом выше (petLines
// импортирует из pet.ts только type PetStage — цикла значений нет).
import { pickSimpleLine as pickSimpleLineImpl } from '@/src/services/petLines';

export interface PetStats {
  /** Всего завершённых тренировок (сессий) на устройстве. */
  total: number;
  /** 4 шкалы 0..100 — как на сайте (память/внимание/логика/скорость). */
  skills: { memory: number; attention: number; logic: number; speed: number };
  level: number;
  stage: PetStage;
}

/**
 * Категория каталога → шкала питомца. Сайт показывает 4 шкалы
 * (memory/attention/logic/speed), каталог приложения живёт в 6 категориях
 * (v1.2.0), поэтому маппим:
 *  - memory/attention   → одноимённые шкалы;
 *  - intuition          → logic (риск/суждения — «обдумать», ближе к логике);
 *  - action             → speed (категория и подписана «Скорость и самоконтроль»);
 *  - recovery           → ни в одну шкалу (дыхание/отдых — не когнитивный домен),
 *                         но в общий счётчик тренировок входит.
 */
const CATEGORY_TO_SKILL: Partial<Record<GameCategory, keyof PetStats['skills']>> = {
  memory: 'memory',
  attention: 'attention',
  logic: 'logic',
  intuition: 'logic',
  action: 'speed',
};

// game_type сессии → шкала. Строится один раз из каталога GAMES.
const GAME_TO_SKILL: Record<string, keyof PetStats['skills'] | undefined> = {};
for (const g of GAMES) GAME_TO_SKILL[g.id] = CATEGORY_TO_SKILL[g.category];

/** Стадия по числу тренировок: <10 Искра, <30 Импульс, дальше Созвездие.
 *  Сайт считает стадию иначе (среднее ОЧКОВ навыков ≥30/≥60 — у нас очков нет,
 *  только счётчик сессий), поэтому пороги переведены в тренировки: при нашей
 *  шкале min(100, n*4) средняя ≈30 достигается как раз к ~30 тренировкам;
 *  порог 10 для второй стадии ниже сознательно — ранний видимый рост цепляет. */
export function stageForTrainings(total: number): PetStage {
  return total >= 30 ? 3 : total >= 10 ? 2 : 1;
}

/** Считает шкалы/уровень/стадию из списка сессий (чистая функция — тестируемо). */
export function computePetStats(sessions: { game_type: string }[]): PetStats {
  const counts = { memory: 0, attention: 0, logic: 0, speed: 0 };
  for (const s of sessions) {
    const skill = GAME_TO_SKILL[s.game_type];
    if (skill) counts[skill] += 1;
  }
  const total = sessions.length;
  return {
    total,
    // Шкала = «наигранность домена»: 4 очка за тренировку, потолок 100 (25 сессий).
    skills: {
      memory: Math.min(100, counts.memory * 4),
      attention: Math.min(100, counts.attention * 4),
      logic: Math.min(100, counts.logic * 4),
      speed: Math.min(100, counts.speed * 4),
    },
    // Уровень растёт всегда (без потолка): 5 тренировок = +1 — длинная морковка
    // после того, как стадии закончились. Сайт делит на 3; у нас /5, чтобы
    // уровень питомца не обгонял уровень профиля от токенов.
    level: Math.floor(total / 5) + 1,
    stage: stageForTrainings(total),
  };
}

/** Свежие статы из реального лога сессий (AsyncStorage). Ошибка чтения = нулевой питомец. */
export async function getPetStats(): Promise<PetStats> {
  try {
    return computePetStats(await getSessions());
  } catch {
    return computePetStats([]);
  }
}
