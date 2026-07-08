// Косметика за токены. Модель: разблокировка ТРАТИТ токены (навсегда), надевание бесплатно.
// Per-profile (psygames_cosmetics_*). v1.114.0 — магазин был реально дырявым: 8 позиций на
// 2950⭐ суммарно, а шкала уровня профиля идёт до 7000⭐ (Валя выкупила всё уже к сер. игры).
// Расширено 4 категориями: больше акцентов/звуков + новые 'frame' | 'title' | 'avatar'.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CosmeticType = 'accent' | 'sound' | 'frame' | 'title' | 'avatar';

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  nameRu: string;
  nameEn: string;
  descRu: string;   // короткий вайб — что это, чтобы не было «только имя+цена»
  descEn: string;
  cost: number;     // токенов на разблокировку
  value: string;    // accent/frame → hex; sound → 'waveform' или 'waveform:pitchMultiplier'; title → эмодзи-префикс; avatar → ключ AVATAR_IMAGES
}

export const COSMETICS: Cosmetic[] = [
  // ─── ACCENT — акцентные темы UI (меняют акцент всего интерфейса через ThemeContext) ───
  { id: 'accent_gold',    type: 'accent', nameRu: 'Золото',   nameEn: 'Gold',      descRu: 'Тёплый янтарный акцент — солидно, премиально', descEn: 'Warm amber accent — premium feel',  cost: 300, value: '#f5b50a' },
  { id: 'accent_neon',    type: 'accent', nameRu: 'Неон',     nameEn: 'Neon',      descRu: 'Кислотно-зелёный — энергично, киберпанк',      descEn: 'Acid green — energetic, cyberpunk', cost: 300, value: '#00e5a0' },
  { id: 'accent_ocean',   type: 'accent', nameRu: 'Океан',    nameEn: 'Ocean',     descRu: 'Глубокий синий — спокойно и ясно',             descEn: 'Deep blue — calm and clear',        cost: 300, value: '#0aa6ff' },
  { id: 'accent_rose',    type: 'accent', nameRu: 'Роза',     nameEn: 'Rose',      descRu: 'Яркая фуксия — живо и тепло',                  descEn: 'Bright fuchsia — lively and warm',  cost: 400, value: '#ff4d8d' },
  { id: 'accent_emerald', type: 'accent', nameRu: 'Изумруд',  nameEn: 'Emerald',   descRu: 'Сочный зелёный — свежо и природно',            descEn: 'Lush green — fresh and natural',    cost: 500, value: '#10b981' },
  { id: 'accent_lavender',type: 'accent', nameRu: 'Лаванда',  nameEn: 'Lavender',  descRu: 'Мягкий фиолет — спокойная роскошь',            descEn: 'Soft violet — calm luxury',         cost: 350, value: '#8b5cf6' },
  { id: 'accent_crimson', type: 'accent', nameRu: 'Багрянец', nameEn: 'Crimson',   descRu: 'Насыщенный красный — уверенно и дерзко',       descEn: 'Deep red — bold and confident',     cost: 400, value: '#dc2626' },
  { id: 'accent_cyan',    type: 'accent', nameRu: 'Бирюза',   nameEn: 'Cyan',      descRu: 'Прохладный бирюзовый — свежо и технично',      descEn: 'Cool cyan — fresh and technical',   cost: 450, value: '#06b6d4' },
  { id: 'accent_tangerine',type:'accent', nameRu: 'Мандарин', nameEn: 'Tangerine', descRu: 'Сочный оранжевый — бодро и заметно',           descEn: 'Juicy orange — punchy and visible', cost: 500, value: '#f97316' },
  { id: 'accent_indigo',  type: 'accent', nameRu: 'Индиго',   nameEn: 'Indigo',    descRu: 'Глубокий сине-фиолетовый — ночное небо',       descEn: 'Deep blue-violet — night sky',      cost: 550, value: '#4f46e5' },
  { id: 'accent_coral',   type: 'accent', nameRu: 'Коралл',   nameEn: 'Coral',     descRu: 'Тёплый розово-красный — живо и уютно',         descEn: 'Warm pink-red — lively and cosy',   cost: 600, value: '#fb7185' },
  { id: 'accent_slate',   type: 'accent', nameRu: 'Графит',   nameEn: 'Slate',     descRu: 'Строгий серо-синий — минимализм',              descEn: 'Cool grey-blue — minimalist',       cost: 650, value: '#64748b' },
  { id: 'accent_copper',  type: 'accent', nameRu: 'Медь',     nameEn: 'Copper',    descRu: 'Тёплый медный — винтажно и благородно',        descEn: 'Warm copper — vintage and noble',   cost: 700, value: '#b45309' },
  { id: 'accent_mint',    type: 'accent', nameRu: 'Мята',     nameEn: 'Mint',      descRu: 'Мятно-бирюзовый — лёгкость и чистота',         descEn: 'Minty teal — light and clean',      cost: 750, value: '#2dd4bf' },
  { id: 'accent_magenta', type: 'accent', nameRu: 'Маджента', nameEn: 'Magenta',   descRu: 'Яркая фуксия-2 — смело и заметно',             descEn: 'Bold magenta — loud and visible',   cost: 800, value: '#d946ef' },

  // ─── SOUND — звук-паки (osc.type или 'osc.type:pitchMultiplier' для доп. вариаций) ───
  // Дефолт без пака = sine. Базовых форм волны в Web Audio всего 4 (sine/square/triangle/
  // sawtooth) — все использованы в первых 3 паках; новые паки комбинируют форму+высоту тона.
  { id: 'sound_retro',   type: 'sound', nameRu: 'Ретро',    nameEn: 'Retro',    descRu: '8-битный квадратный синтез — как старая консоль', descEn: '8-bit square synth — retro console', cost: 350, value: 'square' },
  { id: 'sound_soft',    type: 'sound', nameRu: 'Мягкий',   nameEn: 'Soft',     descRu: 'Тёплый треугольный тон — мягче дефолта',          descEn: 'Warm triangle tone — softer',        cost: 350, value: 'triangle' },
  { id: 'sound_arcade',  type: 'sound', nameRu: 'Аркада',   nameEn: 'Arcade',   descRu: 'Звонкий пилообразный — ярко, по-аркадному',       descEn: 'Bright sawtooth — punchy arcade',    cost: 450, value: 'sawtooth' },
  { id: 'sound_crystal', type: 'sound', nameRu: 'Хрусталь', nameEn: 'Crystal',  descRu: 'Высокий чистый тон — звонко и лёгко',             descEn: 'High clean tone — bright and airy',  cost: 400, value: 'sine:1.6' },
  { id: 'sound_deep',    type: 'sound', nameRu: 'Глубина',  nameEn: 'Deep',     descRu: 'Низкий бархатный тон — солидно и спокойно',       descEn: 'Low velvety tone — calm and solid',  cost: 400, value: 'sine:0.6' },
  { id: 'sound_chipbass',type: 'sound', nameRu: 'Чип-бас',  nameEn: 'Chip Bass',descRu: 'Низкий квадратный — басовитый 8-бит',             descEn: 'Low square wave — bassy chiptune',   cost: 500, value: 'square:0.65' },
  { id: 'sound_buzz',    type: 'sound', nameRu: 'Дрель',    nameEn: 'Buzz',     descRu: 'Высокий пилообразный — резко и дерзко',           descEn: 'High sawtooth — sharp and punchy',   cost: 500, value: 'sawtooth:1.5' },

  // ─── FRAME — цветная рамка вокруг профильного чипа (перекрывает цвет профиля) ───
  { id: 'frame_gold',    type: 'frame', nameRu: 'Золотая рамка',   nameEn: 'Gold frame',    descRu: 'Тёплая янтарная обводка чипа профиля',   descEn: 'Warm amber outline for your profile chip', cost: 400, value: '#f5b50a' },
  { id: 'frame_crimson', type: 'frame', nameRu: 'Багровая рамка',  nameEn: 'Crimson frame', descRu: 'Насыщенно-красная обводка — дерзко',       descEn: 'Bold red outline',                          cost: 450, value: '#ef4444' },
  { id: 'frame_azure',   type: 'frame', nameRu: 'Лазурная рамка',  nameEn: 'Azure frame',   descRu: 'Ясный голубой контур',                     descEn: 'Clear sky-blue outline',                    cost: 450, value: '#38bdf8' },
  { id: 'frame_emerald', type: 'frame', nameRu: 'Изумрудная рамка',nameEn: 'Emerald frame', descRu: 'Сочный зелёный контур',                    descEn: 'Lush green outline',                        cost: 500, value: '#22c55e' },
  { id: 'frame_violet',  type: 'frame', nameRu: 'Фиолетовая рамка',nameEn: 'Violet frame',  descRu: 'Мягкий фиолетовый контур',                 descEn: 'Soft violet outline',                       cost: 500, value: '#a78bfa' },
  { id: 'frame_silver',  type: 'frame', nameRu: 'Серебряная рамка',nameEn: 'Silver frame',  descRu: 'Строгий серебристый контур',                descEn: 'Cool silver outline',                       cost: 550, value: '#cbd5e1' },

  // ─── TITLE — текстовый титул рядом с именем профиля (эмодзи-префикс + подпись) ───
  { id: 'title_focused',     type: 'title', nameRu: 'Сфокусированный', nameEn: 'Focused',      descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 250, value: '🎯' },
  { id: 'title_sharp',       type: 'title', nameRu: 'Острый ум',       nameEn: 'Sharp Mind',   descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 300, value: '⚡' },
  { id: 'title_strategist',  type: 'title', nameRu: 'Стратег',         nameEn: 'Strategist',   descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 350, value: '♟️' },
  { id: 'title_owl',         type: 'title', nameRu: 'Сова разума',     nameEn: 'Mind Owl',     descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 350, value: '🦉' },
  { id: 'title_unstoppable', type: 'title', nameRu: 'Неудержимый',     nameEn: 'Unstoppable',  descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 450, value: '🔥' },
  { id: 'title_grandmaster', type: 'title', nameRu: 'Гроссмейстер',    nameEn: 'Grandmaster',  descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 500, value: '👑' },
  { id: 'title_legend',      type: 'title', nameRu: 'Легенда',         nameEn: 'Legend',       descRu: 'Титул под именем профиля', descEn: 'Title shown under your profile name', cost: 600, value: '🌟' },
  { id: 'title_cyberbrain',  type: 'title', nameRu: 'Кибермозг',       nameEn: 'Cyberbrain',   descRu: 'Тот же титул, что и макс. уровень профиля', descEn: 'Same title as the max profile level', cost: 650, value: '🧠' },

  // ─── AVATAR — иконка профиля вместо стандартного бейджа (kie.ai, единая 3×3-сетка v1.114.0) ───
  { id: 'avatar_owl',       type: 'avatar', nameRu: 'Сова',        nameEn: 'Owl',       descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 300, value: 'avatar_owl' },
  { id: 'avatar_fox',       type: 'avatar', nameRu: 'Лис',         nameEn: 'Fox',       descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 300, value: 'avatar_fox' },
  { id: 'avatar_gem',       type: 'avatar', nameRu: 'Кристалл',    nameEn: 'Gem',       descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 350, value: 'avatar_gem' },
  { id: 'avatar_lightning', type: 'avatar', nameRu: 'Молния',      nameEn: 'Lightning', descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 350, value: 'avatar_lightning' },
  { id: 'avatar_star',      type: 'avatar', nameRu: 'Звезда',      nameEn: 'Star',      descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 400, value: 'avatar_star' },
  { id: 'avatar_knight',    type: 'avatar', nameRu: 'Конь',        nameEn: 'Knight',    descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 450, value: 'avatar_knight' },
  { id: 'avatar_phoenix',   type: 'avatar', nameRu: 'Феникс',      nameEn: 'Phoenix',   descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 500, value: 'avatar_phoenix' },
  { id: 'avatar_robot',     type: 'avatar', nameRu: 'Робот',       nameEn: 'Robot',     descRu: 'Иконка профиля вместо стандартного бейджа', descEn: 'Profile icon replacing the default badge', cost: 500, value: 'avatar_robot' },
  { id: 'avatar_brain',     type: 'avatar', nameRu: 'Мозг',        nameEn: 'Brain',     descRu: 'Флагманский аватар — иконка профиля',       descEn: 'Flagship avatar — profile icon',           cost: 600, value: 'avatar_brain' },
];

const uKey = (pid: string) => `psygames_cosmetics_unlocked_${pid}`;
const eKey = (pid: string) => `psygames_cosmetics_equipped_${pid}`;

export async function getUnlocked(profileId: string): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(uKey(profileId)); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

export async function unlockCosmetic(profileId: string, id: string): Promise<void> {
  try {
    const list = await getUnlocked(profileId);
    if (!list.includes(id)) { list.push(id); await AsyncStorage.setItem(uKey(profileId), JSON.stringify(list)); }
  } catch { /* no-op */ }
}

export async function getEquipped(profileId: string): Promise<Record<string, string>> {
  try { const raw = await AsyncStorage.getItem(eKey(profileId)); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

export async function equipCosmetic(profileId: string, type: CosmeticType, id: string): Promise<void> {
  try { const eq = await getEquipped(profileId); eq[type] = id; await AsyncStorage.setItem(eKey(profileId), JSON.stringify(eq)); }
  catch { /* no-op */ }
}

export async function unequipCosmetic(profileId: string, type: CosmeticType): Promise<void> {
  try { const eq = await getEquipped(profileId); delete eq[type]; await AsyncStorage.setItem(eKey(profileId), JSON.stringify(eq)); }
  catch { /* no-op */ }
}

// Hex надетого акцента, или null если ничего не надето (тогда берётся профильный).
export async function getEquippedAccent(profileId: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['accent'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'accent');
  return c ? c.value : null;
}

// Hex надетой рамки профильного чипа, или null если ничего не надето (тогда берётся цвет профиля).
export async function getEquippedFrameColor(profileId: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['frame'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'frame');
  return c ? c.value : null;
}

// Отображаемый титул («🧠 Кибермозг» / «🧠 Cyberbrain»), или null если ничего не надето.
export async function getEquippedTitle(profileId: string, lang: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['title'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'title');
  if (!c) return null;
  return `${c.value} ${lang === 'ru' ? c.nameRu : c.nameEn}`;
}

// Ключ надетого аватара (для AVATAR_IMAGES в constants/avatars.ts), или null если не надет.
export async function getEquippedAvatarKey(profileId: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['avatar'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'avatar');
  return c ? c.value : null;
}
