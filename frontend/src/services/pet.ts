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

export type PetStage = 1 | 2 | 3;

/** Имена стадий — 1:1 с сайта (COPY.stages в NeuroPet.astro). */
export const STAGE_NAMES: Record<'ru' | 'en', [string, string, string]> = {
  ru: ['Искра', 'Импульс', 'Созвездие'],
  en: ['Spark', 'Impulse', 'Constellation'],
};

/**
 * Реплики питомца — 1:1 с сайта (REACTIONS в NeuroPet.astro), 11 языков
 * приложения (ar с сайта не переносим — в приложении арабского нет).
 * Ключи совпадают с type Language из LanguageContext.
 */
export const REACTIONS: Record<string, string[]> = {
  en: ['I see you 👀', 'Impulse caught! ⚡', 'That gesture tickles ✨'],
  ru: ['Я слежу за тобой 👀', 'Импульс пойман! ⚡', 'Этот жест щекочет ✨'],
  es: ['Te veo 👀', '¡Impulso capturado! ⚡', 'Ese gesto hace cosquillas ✨'],
  pt: ['Estou vendo você 👀', 'Impulso capturado! ⚡', 'Esse gesto faz cócegas ✨'],
  de: ['Ich sehe dich 👀', 'Impuls gefangen! ⚡', 'Diese Geste kitzelt ✨'],
  fr: ['Je te vois 👀', 'Impulsion captée ! ⚡', 'Ce geste me chatouille ✨'],
  it: ['Ti vedo 👀', 'Impulso catturato! ⚡', 'Quel gesto fa il solletico ✨'],
  ja: ['見えているよ 👀', 'インパルスをキャッチ！⚡', 'そのジェスチャー、くすぐったい ✨'],
  ko: ['보고 있어요 👀', '임펄스 포착! ⚡', '그 제스처는 간지러워요 ✨'],
  zh: ['我看到你了 👀', '捕捉到脉冲！⚡', '这个手势好痒 ✨'],
  hi: ['मैं आपको देख रहा हूँ 👀', 'आवेग पकड़ लिया! ⚡', 'यह इशारा गुदगुदाता है ✨'],
};

/** Случайная реплика на языке приложения (fallback en — как на сайте). */
export function pickReaction(language: string): string {
  const list = REACTIONS[language] || REACTIONS.en;
  return list[Math.floor(Math.random() * list.length)];
}

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
