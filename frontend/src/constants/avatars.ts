/**
 * Аватары за токены (v1.114.0) — набор из 9 иконок-мэскотов, сгенерирован единой
 * 3×3-сеткой (kie.ai) и нарезан на квадраты — дешевле и стилистически цельнее,
 * чем 9 отдельных генераций. Ключ = id косметики в COSMETICS (cosmetics.ts).
 */
export const AVATAR_IMAGES: Record<string, any> = {
  avatar_owl: require('../../assets/images/avatars/avatar_owl.webp'),
  avatar_robot: require('../../assets/images/avatars/avatar_robot.webp'),
  avatar_lightning: require('../../assets/images/avatars/avatar_lightning.webp'),
  avatar_gem: require('../../assets/images/avatars/avatar_gem.webp'),
  avatar_star: require('../../assets/images/avatars/avatar_star.webp'),
  avatar_phoenix: require('../../assets/images/avatars/avatar_phoenix.webp'),
  avatar_fox: require('../../assets/images/avatars/avatar_fox.webp'),
  avatar_knight: require('../../assets/images/avatars/avatar_knight.webp'),
  avatar_brain: require('../../assets/images/avatars/avatar_brain.webp'),
};

export function avatarImage(id: string | null | undefined): any | null {
  if (!id) return null;
  return AVATAR_IMAGES[id] ?? null;
}
