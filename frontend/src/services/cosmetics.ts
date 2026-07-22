// Косметика за токены. Модель: разблокировка ТРАТИТ токены (навсегда), надевание бесплатно.
// Per-profile (psygames_cosmetics_*). v1.114.0 — магазин был реально дырявым: 8 позиций на
// 2950⭐ суммарно, а шкала уровня профиля идёт до 7000⭐ (Валя выкупила всё уже к сер. игры).
// Расширено 4 категориями: больше акцентов/звуков + новые 'frame' | 'title' | 'avatar'.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translateFor } from '@/src/contexts/LanguageContext';

export type CosmeticType = 'accent' | 'sound' | 'frame' | 'title' | 'avatar';

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  nameKey: string;  // ключ словаря LanguageContext (cosName_<id>) — рендер через t()
  descKey: string;  // короткий вайб — что это, чтобы не было «только имя+цена» (cosDesc_*; у title/avatar общий generic-ключ)
  cost: number;     // токенов на разблокировку
  value: string;    // accent/frame → hex; sound → 'waveform' или 'waveform:pitchMultiplier'; title → эмодзи-префикс; avatar → ключ AVATAR_IMAGES
}

export const COSMETICS: Cosmetic[] = [
  // ─── ACCENT — акцентные темы UI (меняют акцент всего интерфейса через ThemeContext) ───
  { id: 'accent_gold',    type: 'accent', nameKey: 'cosName_accent_gold',      descKey: 'cosDesc_accent_gold',      cost: 300, value: '#f5b50a' },
  { id: 'accent_neon',    type: 'accent', nameKey: 'cosName_accent_neon',      descKey: 'cosDesc_accent_neon',      cost: 300, value: '#00e5a0' },
  { id: 'accent_ocean',   type: 'accent', nameKey: 'cosName_accent_ocean',     descKey: 'cosDesc_accent_ocean',     cost: 300, value: '#0aa6ff' },
  { id: 'accent_rose',    type: 'accent', nameKey: 'cosName_accent_rose',      descKey: 'cosDesc_accent_rose',      cost: 400, value: '#ff4d8d' },
  { id: 'accent_emerald', type: 'accent', nameKey: 'cosName_accent_emerald',   descKey: 'cosDesc_accent_emerald',   cost: 500, value: '#10b981' },
  { id: 'accent_lavender',type: 'accent', nameKey: 'cosName_accent_lavender',  descKey: 'cosDesc_accent_lavender',  cost: 350, value: '#8b5cf6' },
  { id: 'accent_crimson', type: 'accent', nameKey: 'cosName_accent_crimson',   descKey: 'cosDesc_accent_crimson',   cost: 400, value: '#dc2626' },
  { id: 'accent_cyan',    type: 'accent', nameKey: 'cosName_accent_cyan',      descKey: 'cosDesc_accent_cyan',      cost: 450, value: '#06b6d4' },
  { id: 'accent_tangerine',type:'accent', nameKey: 'cosName_accent_tangerine', descKey: 'cosDesc_accent_tangerine', cost: 500, value: '#f97316' },
  { id: 'accent_indigo',  type: 'accent', nameKey: 'cosName_accent_indigo',    descKey: 'cosDesc_accent_indigo',    cost: 550, value: '#4f46e5' },
  { id: 'accent_coral',   type: 'accent', nameKey: 'cosName_accent_coral',     descKey: 'cosDesc_accent_coral',     cost: 600, value: '#fb7185' },
  { id: 'accent_slate',   type: 'accent', nameKey: 'cosName_accent_slate',     descKey: 'cosDesc_accent_slate',     cost: 650, value: '#64748b' },
  { id: 'accent_copper',  type: 'accent', nameKey: 'cosName_accent_copper',    descKey: 'cosDesc_accent_copper',    cost: 700, value: '#b45309' },
  { id: 'accent_mint',    type: 'accent', nameKey: 'cosName_accent_mint',      descKey: 'cosDesc_accent_mint',      cost: 750, value: '#2dd4bf' },
  { id: 'accent_magenta', type: 'accent', nameKey: 'cosName_accent_magenta',   descKey: 'cosDesc_accent_magenta',   cost: 800, value: '#d946ef' },

  // ─── SOUND — звук-паки (osc.type или 'osc.type:pitchMultiplier' для доп. вариаций) ───
  // Дефолт без пака = sine. Базовых форм волны в Web Audio всего 4 (sine/square/triangle/
  // sawtooth) — все использованы в первых 3 паках; новые паки комбинируют форму+высоту тона.
  { id: 'sound_retro',   type: 'sound', nameKey: 'cosName_sound_retro',    descKey: 'cosDesc_sound_retro',    cost: 350, value: 'square' },
  { id: 'sound_soft',    type: 'sound', nameKey: 'cosName_sound_soft',     descKey: 'cosDesc_sound_soft',     cost: 350, value: 'triangle' },
  { id: 'sound_arcade',  type: 'sound', nameKey: 'cosName_sound_arcade',   descKey: 'cosDesc_sound_arcade',   cost: 450, value: 'sawtooth' },
  { id: 'sound_crystal', type: 'sound', nameKey: 'cosName_sound_crystal',  descKey: 'cosDesc_sound_crystal',  cost: 400, value: 'sine:1.6' },
  { id: 'sound_deep',    type: 'sound', nameKey: 'cosName_sound_deep',     descKey: 'cosDesc_sound_deep',     cost: 400, value: 'sine:0.6' },
  { id: 'sound_chipbass',type: 'sound', nameKey: 'cosName_sound_chipbass', descKey: 'cosDesc_sound_chipbass', cost: 500, value: 'square:0.65' },
  { id: 'sound_buzz',    type: 'sound', nameKey: 'cosName_sound_buzz',     descKey: 'cosDesc_sound_buzz',     cost: 500, value: 'sawtooth:1.5' },

  // ─── FRAME — цветная рамка вокруг профильного чипа (перекрывает цвет профиля) ───
  { id: 'frame_gold',    type: 'frame', nameKey: 'cosName_frame_gold',    descKey: 'cosDesc_frame_gold',    cost: 400, value: '#f5b50a' },
  { id: 'frame_crimson', type: 'frame', nameKey: 'cosName_frame_crimson', descKey: 'cosDesc_frame_crimson', cost: 450, value: '#ef4444' },
  { id: 'frame_azure',   type: 'frame', nameKey: 'cosName_frame_azure',   descKey: 'cosDesc_frame_azure',   cost: 450, value: '#38bdf8' },
  { id: 'frame_emerald', type: 'frame', nameKey: 'cosName_frame_emerald', descKey: 'cosDesc_frame_emerald', cost: 500, value: '#22c55e' },
  { id: 'frame_violet',  type: 'frame', nameKey: 'cosName_frame_violet',  descKey: 'cosDesc_frame_violet',  cost: 500, value: '#a78bfa' },
  { id: 'frame_silver',  type: 'frame', nameKey: 'cosName_frame_silver',  descKey: 'cosDesc_frame_silver',  cost: 550, value: '#cbd5e1' },

  // ─── TITLE — текстовый титул рядом с именем профиля (эмодзи-префикс + подпись) ───
  { id: 'title_focused',     type: 'title', nameKey: 'cosName_title_focused',     descKey: 'cosDesc_title_generic',    cost: 250, value: '🎯' },
  { id: 'title_sharp',       type: 'title', nameKey: 'cosName_title_sharp',       descKey: 'cosDesc_title_generic',    cost: 300, value: '⚡' },
  { id: 'title_strategist',  type: 'title', nameKey: 'cosName_title_strategist',  descKey: 'cosDesc_title_generic',    cost: 350, value: '♟️' },
  { id: 'title_owl',         type: 'title', nameKey: 'cosName_title_owl',         descKey: 'cosDesc_title_generic',    cost: 350, value: '🦉' },
  { id: 'title_unstoppable', type: 'title', nameKey: 'cosName_title_unstoppable', descKey: 'cosDesc_title_generic',    cost: 450, value: '🔥' },
  { id: 'title_grandmaster', type: 'title', nameKey: 'cosName_title_grandmaster', descKey: 'cosDesc_title_generic',    cost: 500, value: '👑' },
  { id: 'title_legend',      type: 'title', nameKey: 'cosName_title_legend',      descKey: 'cosDesc_title_generic',    cost: 600, value: '🌟' },
  { id: 'title_cyberbrain',  type: 'title', nameKey: 'cosName_title_cyberbrain',  descKey: 'cosDesc_title_cyberbrain', cost: 650, value: '🧠' },

  // ─── AVATAR — иконка профиля вместо стандартного бейджа (kie.ai, единая 3×3-сетка v1.114.0) ───
  { id: 'avatar_owl',       type: 'avatar', nameKey: 'cosName_avatar_owl',       descKey: 'cosDesc_avatar_generic', cost: 300, value: 'avatar_owl' },
  { id: 'avatar_fox',       type: 'avatar', nameKey: 'cosName_avatar_fox',       descKey: 'cosDesc_avatar_generic', cost: 300, value: 'avatar_fox' },
  { id: 'avatar_gem',       type: 'avatar', nameKey: 'cosName_avatar_gem',       descKey: 'cosDesc_avatar_generic', cost: 350, value: 'avatar_gem' },
  { id: 'avatar_lightning', type: 'avatar', nameKey: 'cosName_avatar_lightning', descKey: 'cosDesc_avatar_generic', cost: 350, value: 'avatar_lightning' },
  { id: 'avatar_star',      type: 'avatar', nameKey: 'cosName_avatar_star',      descKey: 'cosDesc_avatar_generic', cost: 400, value: 'avatar_star' },
  { id: 'avatar_knight',    type: 'avatar', nameKey: 'cosName_avatar_knight',    descKey: 'cosDesc_avatar_generic', cost: 450, value: 'avatar_knight' },
  { id: 'avatar_phoenix',   type: 'avatar', nameKey: 'cosName_avatar_phoenix',   descKey: 'cosDesc_avatar_generic', cost: 500, value: 'avatar_phoenix' },
  { id: 'avatar_robot',     type: 'avatar', nameKey: 'cosName_avatar_robot',     descKey: 'cosDesc_avatar_generic', cost: 500, value: 'avatar_robot' },
  { id: 'avatar_brain',     type: 'avatar', nameKey: 'cosName_avatar_brain',     descKey: 'cosDesc_avatar_brain',   cost: 600, value: 'avatar_brain' },
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
// Сервис вне React-дерева → перевод через translateFor (lang приходит параметром от вызывающего).
export async function getEquippedTitle(profileId: string, lang: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['title'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'title');
  if (!c) return null;
  return `${c.value} ${translateFor(lang, c.nameKey)}`;
}

// Ключ надетого аватара (для AVATAR_IMAGES в constants/avatars.ts), или null если не надет.
export async function getEquippedAvatarKey(profileId: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['avatar'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'avatar');
  return c ? c.value : null;
}
