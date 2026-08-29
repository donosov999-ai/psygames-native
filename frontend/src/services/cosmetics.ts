// Косметика за токены. Модель: разблокировка ТРАТИТ токены (навсегда), надевание бесплатно.
// Per-profile (psygames_cosmetics_*). v1.114.0 — магазин был реально дырявым: 8 позиций на
// 2950⭐ суммарно, а шкала уровня профиля идёт до 7000⭐ (Валя выкупила всё уже к сер. игры).
// Расширено 4 категориями: больше акцентов/звуков + новые 'frame' | 'title' | 'avatar'.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translateFor } from '@/src/contexts/LanguageContext';

export type CosmeticType = 'accent' | 'sound' | 'frame' | 'title' | 'avatar' | 'pet' | 'digits' | 'theme' | 'background' | 'badge';

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
  { id: 'accent_gold',    type: 'accent', nameKey: 'cosName_accent_gold',      descKey: 'cosDesc_accent_gold',      cost: 900, value: '#f5b50a' },
  { id: 'accent_neon',    type: 'accent', nameKey: 'cosName_accent_neon',      descKey: 'cosDesc_accent_neon',      cost: 900, value: '#00e5a0' },
  { id: 'accent_ocean',   type: 'accent', nameKey: 'cosName_accent_ocean',     descKey: 'cosDesc_accent_ocean',     cost: 900, value: '#0aa6ff' },
  { id: 'accent_rose',    type: 'accent', nameKey: 'cosName_accent_rose',      descKey: 'cosDesc_accent_rose',      cost: 1200, value: '#ff4d8d' },
  { id: 'accent_emerald', type: 'accent', nameKey: 'cosName_accent_emerald',   descKey: 'cosDesc_accent_emerald',   cost: 1500, value: '#10b981' },
  { id: 'accent_lavender',type: 'accent', nameKey: 'cosName_accent_lavender',  descKey: 'cosDesc_accent_lavender',  cost: 1050, value: '#8b5cf6' },
  { id: 'accent_crimson', type: 'accent', nameKey: 'cosName_accent_crimson',   descKey: 'cosDesc_accent_crimson',   cost: 1200, value: '#dc2626' },
  { id: 'accent_cyan',    type: 'accent', nameKey: 'cosName_accent_cyan',      descKey: 'cosDesc_accent_cyan',      cost: 1350, value: '#06b6d4' },
  { id: 'accent_tangerine',type:'accent', nameKey: 'cosName_accent_tangerine', descKey: 'cosDesc_accent_tangerine', cost: 1500, value: '#f97316' },
  { id: 'accent_indigo',  type: 'accent', nameKey: 'cosName_accent_indigo',    descKey: 'cosDesc_accent_indigo',    cost: 1650, value: '#4f46e5' },
  { id: 'accent_coral',   type: 'accent', nameKey: 'cosName_accent_coral',     descKey: 'cosDesc_accent_coral',     cost: 1800, value: '#fb7185' },
  { id: 'accent_slate',   type: 'accent', nameKey: 'cosName_accent_slate',     descKey: 'cosDesc_accent_slate',     cost: 1950, value: '#64748b' },
  { id: 'accent_copper',  type: 'accent', nameKey: 'cosName_accent_copper',    descKey: 'cosDesc_accent_copper',    cost: 2100, value: '#b45309' },
  { id: 'accent_mint',    type: 'accent', nameKey: 'cosName_accent_mint',      descKey: 'cosDesc_accent_mint',      cost: 2250, value: '#2dd4bf' },
  { id: 'accent_magenta', type: 'accent', nameKey: 'cosName_accent_magenta',   descKey: 'cosDesc_accent_magenta',   cost: 2400, value: '#d946ef' },

  // ─── SOUND — звук-паки (osc.type или 'osc.type:pitchMultiplier' для доп. вариаций) ───
  // Дефолт без пака = sine. Базовых форм волны в Web Audio всего 4 (sine/square/triangle/
  // sawtooth) — все использованы в первых 3 паках; новые паки комбинируют форму+высоту тона.
  { id: 'sound_retro',   type: 'sound', nameKey: 'cosName_sound_retro',    descKey: 'cosDesc_sound_retro',    cost: 1050, value: 'square' },
  { id: 'sound_soft',    type: 'sound', nameKey: 'cosName_sound_soft',     descKey: 'cosDesc_sound_soft',     cost: 1050, value: 'triangle' },
  { id: 'sound_arcade',  type: 'sound', nameKey: 'cosName_sound_arcade',   descKey: 'cosDesc_sound_arcade',   cost: 1350, value: 'sawtooth' },
  { id: 'sound_crystal', type: 'sound', nameKey: 'cosName_sound_crystal',  descKey: 'cosDesc_sound_crystal',  cost: 1200, value: 'sine:1.6' },
  { id: 'sound_deep',    type: 'sound', nameKey: 'cosName_sound_deep',     descKey: 'cosDesc_sound_deep',     cost: 1200, value: 'sine:0.6' },
  { id: 'sound_chipbass',type: 'sound', nameKey: 'cosName_sound_chipbass', descKey: 'cosDesc_sound_chipbass', cost: 1500, value: 'square:0.65' },
  { id: 'sound_buzz',    type: 'sound', nameKey: 'cosName_sound_buzz',     descKey: 'cosDesc_sound_buzz',     cost: 1500, value: 'sawtooth:1.5' },

  // ─── FRAME — цветная рамка вокруг профильного чипа (перекрывает цвет профиля) ───
  { id: 'frame_gold',    type: 'frame', nameKey: 'cosName_frame_gold',    descKey: 'cosDesc_frame_gold',    cost: 1200, value: '#f5b50a' },
  { id: 'frame_crimson', type: 'frame', nameKey: 'cosName_frame_crimson', descKey: 'cosDesc_frame_crimson', cost: 1350, value: '#ef4444' },
  { id: 'frame_azure',   type: 'frame', nameKey: 'cosName_frame_azure',   descKey: 'cosDesc_frame_azure',   cost: 1350, value: '#38bdf8' },
  { id: 'frame_emerald', type: 'frame', nameKey: 'cosName_frame_emerald', descKey: 'cosDesc_frame_emerald', cost: 1500, value: '#22c55e' },
  { id: 'frame_violet',  type: 'frame', nameKey: 'cosName_frame_violet',  descKey: 'cosDesc_frame_violet',  cost: 1500, value: '#a78bfa' },
  { id: 'frame_silver',  type: 'frame', nameKey: 'cosName_frame_silver',  descKey: 'cosDesc_frame_silver',  cost: 1650, value: '#cbd5e1' },

  // ─── TITLE — текстовый титул рядом с именем профиля (эмодзи-префикс + подпись) ───
  { id: 'title_focused',     type: 'title', nameKey: 'cosName_title_focused',     descKey: 'cosDesc_title_generic',    cost: 750, value: '🎯' },
  { id: 'title_sharp',       type: 'title', nameKey: 'cosName_title_sharp',       descKey: 'cosDesc_title_generic',    cost: 900, value: '⚡' },
  { id: 'title_strategist',  type: 'title', nameKey: 'cosName_title_strategist',  descKey: 'cosDesc_title_generic',    cost: 1050, value: '♟️' },
  { id: 'title_owl',         type: 'title', nameKey: 'cosName_title_owl',         descKey: 'cosDesc_title_generic',    cost: 1050, value: '🦉' },
  { id: 'title_unstoppable', type: 'title', nameKey: 'cosName_title_unstoppable', descKey: 'cosDesc_title_generic',    cost: 1350, value: '🔥' },
  { id: 'title_grandmaster', type: 'title', nameKey: 'cosName_title_grandmaster', descKey: 'cosDesc_title_generic',    cost: 1500, value: '👑' },
  { id: 'title_legend',      type: 'title', nameKey: 'cosName_title_legend',      descKey: 'cosDesc_title_generic',    cost: 1800, value: '🌟' },
  { id: 'title_cyberbrain',  type: 'title', nameKey: 'cosName_title_cyberbrain',  descKey: 'cosDesc_title_cyberbrain', cost: 1950, value: '🧠' },

  // ─── ПРЕСТИЖ-ПОЛКА (Денис 28.08: «нечего покупать, всё равно дёшево») — вещи
  //     для кошельков уровня Валентины: месяцы накоплений, статус напоказ. ───
  { id: 'frame_onyx',     type: 'frame', nameKey: 'cosName_frame_onyx',     descKey: 'cosDesc_frame_onyx',  cost: 6000,  value: '#0f172a' },
  { id: 'title_comet',    type: 'title', nameKey: 'cosName_title_comet',    descKey: 'cosDesc_title_generic', cost: 7500,  value: '☄️' },
  { id: 'title_diamond',  type: 'title', nameKey: 'cosName_title_diamond',  descKey: 'cosDesc_title_generic', cost: 10000, value: '💎' },
  { id: 'title_infinity', type: 'title', nameKey: 'cosName_title_infinity', descKey: 'cosDesc_title_generic', cost: 15000, value: '♾️' },

  // ─── PET — аксессуары питомца Синапса (вектор поверх спрайта; надевание
  //     ГЛОБАЛЬНОЕ — питомец один на устройство, покупка токенами профиля) ───
  { id: 'pet_bow',       type: 'pet', nameKey: 'cosName_pet_bow',       descKey: 'cosDesc_pet_generic', cost: 900, value: 'bow' },
  { id: 'pet_party_hat', type: 'pet', nameKey: 'cosName_pet_party_hat', descKey: 'cosDesc_pet_generic', cost: 1200, value: 'party_hat' },
  { id: 'pet_glasses',   type: 'pet', nameKey: 'cosName_pet_glasses',   descKey: 'cosDesc_pet_generic', cost: 1500, value: 'glasses' },
  // Бабочка на шею — решение Дениса 14.08.2026 после разбора банта: бант остался
  // заколкой на голове, а на шею завели отдельный предмет. Цена его же — 300.
  { id: 'pet_bow_tie',   type: 'pet', nameKey: 'cosName_pet_bow_tie',   descKey: 'cosDesc_pet_generic', cost: 900, value: 'bow_tie' },

  // ─── AVATAR — иконка профиля вместо стандартного бейджа (kie.ai, единая 3×3-сетка v1.114.0) ───
  { id: 'avatar_owl',       type: 'avatar', nameKey: 'cosName_avatar_owl',       descKey: 'cosDesc_avatar_generic', cost: 900, value: 'avatar_owl' },
  { id: 'avatar_fox',       type: 'avatar', nameKey: 'cosName_avatar_fox',       descKey: 'cosDesc_avatar_generic', cost: 900, value: 'avatar_fox' },
  { id: 'avatar_gem',       type: 'avatar', nameKey: 'cosName_avatar_gem',       descKey: 'cosDesc_avatar_generic', cost: 1050, value: 'avatar_gem' },
  { id: 'avatar_lightning', type: 'avatar', nameKey: 'cosName_avatar_lightning', descKey: 'cosDesc_avatar_generic', cost: 1050, value: 'avatar_lightning' },
  { id: 'avatar_star',      type: 'avatar', nameKey: 'cosName_avatar_star',      descKey: 'cosDesc_avatar_generic', cost: 1200, value: 'avatar_star' },
  { id: 'avatar_knight',    type: 'avatar', nameKey: 'cosName_avatar_knight',    descKey: 'cosDesc_avatar_generic', cost: 1350, value: 'avatar_knight' },
  { id: 'avatar_phoenix',   type: 'avatar', nameKey: 'cosName_avatar_phoenix',   descKey: 'cosDesc_avatar_generic', cost: 1500, value: 'avatar_phoenix' },
  { id: 'avatar_robot',     type: 'avatar', nameKey: 'cosName_avatar_robot',     descKey: 'cosDesc_avatar_generic', cost: 1500, value: 'avatar_robot' },
  { id: 'avatar_brain',     type: 'avatar', nameKey: 'cosName_avatar_brain',     descKey: 'cosDesc_avatar_brain',   cost: 1800, value: 'avatar_brain' },
  // ─── ВИТРИНА ТЕМ (Т4+Т5 экономики, задача eddd19b9). Профильное оформление
  //     продаётся КРОСС-ПРОФИЛЬНО: свой арт у профиля бесплатен (дефолт), чужой
  //     покупается. Позиция «своего» арта скрывается фильтром в магазине.
  //     value = ключ реестра арта; имя theme/background/badge — display_name
  //     профиля в момент рендера (nameKey generic-запас). ───
  // DIGITS — наборы рисованных цифр судоку (digitThemes.ts; candy — общий дефолт, бесплатен)
  { id: 'digits_rainbow', type: 'digits', nameKey: 'cosName_digits_rainbow', descKey: 'cosDesc_digits_generic', cost: 1500, value: 'rainbow' },
  { id: 'digits_pastel',  type: 'digits', nameKey: 'cosName_digits_pastel',  descKey: 'cosDesc_digits_generic', cost: 1500, value: 'pastel' },
  { id: 'digits_neon',    type: 'digits', nameKey: 'cosName_digits_neon',    descKey: 'cosDesc_digits_generic', cost: 1500, value: 'neon' },
  { id: 'digits_elegant', type: 'digits', nameKey: 'cosName_digits_elegant', descKey: 'cosDesc_digits_generic', cost: 1500, value: 'elegant' },
  // THEME — 11 тем движка (подложка карты уровней, profileThemes.ts)
  { id: 'theme_odv999',    type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'odv999' },
  { id: 'theme_chess',     type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'chess' },
  { id: 'theme_kids',      type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'kids' },
  { id: 'theme_vasilyeva', type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'vasilyeva' },
  { id: 'theme_nzt48',     type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'nzt48' },
  { id: 'theme_free',      type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'free' },
  { id: 'theme_drivers',   type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'drivers' },
  { id: 'theme_seniors',   type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'seniors' },
  { id: 'theme_execs',     type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'execs' },
  { id: 'theme_students',  type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'students' },
  { id: 'theme_women',     type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'women' },
  { id: 'theme_polyglot',  type: 'theme', nameKey: 'cosName_profile_item', descKey: 'cosDesc_theme_generic', cost: 2400, value: 'polyglot' },
  // BACKGROUND — фоны главной (profileBackgrounds.ts, 10). Лесенка, чтобы полка не была плоской.
  { id: 'bg_kids',      type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 900,  value: 'kids' },
  { id: 'bg_students',  type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1050, value: 'students' },
  { id: 'bg_seniors',   type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1050, value: 'seniors' },
  { id: 'bg_women',     type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1200, value: 'women' },
  { id: 'bg_drivers',   type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1350, value: 'drivers' },
  { id: 'bg_vasilyeva', type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1350, value: 'vasilyeva' },
  { id: 'bg_chess',     type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1500, value: 'chess' },
  { id: 'bg_nzt48',     type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1650, value: 'nzt48' },
  { id: 'bg_execs',     type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1800, value: 'execs' },
  { id: 'bg_polyglot',  type: 'background', nameKey: 'cosName_profile_item', descKey: 'cosDesc_background_generic', cost: 1200, value: 'polyglot' },
  // BADGE — значки профиля в чипе главной (profileBadges.ts, 12)
  { id: 'badge_free',      type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 900,  value: 'free' },
  { id: 'badge_kids',      type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 900,  value: 'kids' },
  { id: 'badge_students',  type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1050, value: 'students' },
  { id: 'badge_seniors',   type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1050, value: 'seniors' },
  { id: 'badge_women',     type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1200, value: 'women' },
  { id: 'badge_drivers',   type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1200, value: 'drivers' },
  { id: 'badge_vasilyeva', type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1350, value: 'vasilyeva' },
  { id: 'badge_polyglot',  type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1350, value: 'polyglot' },
  { id: 'badge_chess',     type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1500, value: 'chess' },
  { id: 'badge_nzt48',     type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1650, value: 'nzt48' },
  { id: 'badge_execs',     type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1650, value: 'execs' },
  { id: 'badge_odv999',    type: 'badge', nameKey: 'cosName_profile_item', descKey: 'cosDesc_badge_generic', cost: 1800, value: 'odv999' },
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

// Value надетой вещи данного типа, или null (= дефолт профиля). Для профильных
// типов витрины (digits/theme/background/badge) — единственная точка чтения.
export async function getEquippedValue(profileId: string, type: CosmeticType): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq[type];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === type);
  return c ? c.value : null;
}

// Ключ надетого аватара (для AVATAR_IMAGES в constants/avatars.ts), или null если не надет.
export async function getEquippedAvatarKey(profileId: string): Promise<string | null> {
  const eq = await getEquipped(profileId);
  const id = eq['avatar'];
  if (!id) return null;
  const c = COSMETICS.find((x) => x.id === id && x.type === 'avatar');
  return c ? c.value : null;
}
