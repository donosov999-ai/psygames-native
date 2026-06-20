// Косметика за токены (v1): акцентные темы UI. Модель: разблокировка ТРАТИТ токены (навсегда),
// надевание бесплатно. Per-profile (psygames_cosmetics_*). Задел: тип расширяется на
// 'frame' | 'title' | 'avatar' позже — экран и сервис уже работают по generic-каталогу.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CosmeticType = 'accent' | 'sound';

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  nameRu: string;
  nameEn: string;
  descRu: string;   // короткий вайб — что это, чтобы не было «только имя+цена»
  descEn: string;
  cost: number;     // токенов на разблокировку
  value: string;    // для accent — hex акцента UI
}

// v1 — акцентные темы (меняют акцент всего интерфейса через ThemeContext).
export const COSMETICS: Cosmetic[] = [
  { id: 'accent_gold',    type: 'accent', nameRu: 'Золото',  nameEn: 'Gold',    descRu: 'Тёплый янтарный акцент — солидно, премиально', descEn: 'Warm amber accent — premium feel',     cost: 300, value: '#f5b50a' },
  { id: 'accent_neon',    type: 'accent', nameRu: 'Неон',    nameEn: 'Neon',    descRu: 'Кислотно-зелёный — энергично, киберпанк',     descEn: 'Acid green — energetic, cyberpunk',     cost: 300, value: '#00e5a0' },
  { id: 'accent_ocean',   type: 'accent', nameRu: 'Океан',   nameEn: 'Ocean',   descRu: 'Глубокий синий — спокойно и ясно',            descEn: 'Deep blue — calm and clear',            cost: 300, value: '#0aa6ff' },
  { id: 'accent_rose',    type: 'accent', nameRu: 'Роза',    nameEn: 'Rose',    descRu: 'Яркая фуксия — живо и тепло',                 descEn: 'Bright fuchsia — lively and warm',      cost: 400, value: '#ff4d8d' },
  { id: 'accent_emerald', type: 'accent', nameRu: 'Изумруд', nameEn: 'Emerald', descRu: 'Сочный зелёный — свежо и природно',           descEn: 'Lush green — fresh and natural',        cost: 500, value: '#10b981' },
  // SND-P: звук-паки — value = форма волны (osc.type) для игровых звуков. Дефолт без пака = sine.
  { id: 'sound_retro',  type: 'sound', nameRu: 'Ретро',  nameEn: 'Retro',  descRu: '8-битный квадратный синтез — как старая консоль', descEn: '8-bit square synth — retro console', cost: 350, value: 'square' },
  { id: 'sound_soft',   type: 'sound', nameRu: 'Мягкий', nameEn: 'Soft',   descRu: 'Тёплый треугольный тон — мягче дефолта',          descEn: 'Warm triangle tone — softer',        cost: 350, value: 'triangle' },
  { id: 'sound_arcade', type: 'sound', nameRu: 'Аркада', nameEn: 'Arcade', descRu: 'Звонкий пилообразный — ярко, по-аркадному',       descEn: 'Bright sawtooth — punchy arcade',     cost: 450, value: 'sawtooth' },
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
