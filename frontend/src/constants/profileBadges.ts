// Бейджи профилей (Nano Banana 2, глянец-3D, нарезка из ОДНОЙ картинки 4×4).
// Заменяют эмодзи в свитчере профилей. id → png, фолбэк на эмодзи если нет.
export const PROFILE_BADGES: Record<string, any> = {
  chess: require('../../assets/images/profiles/chess.webp'),
  kids: require('../../assets/images/profiles/kids.webp'),
  vasilyeva: require('../../assets/images/profiles/vasilyeva.webp'),
  nzt48: require('../../assets/images/profiles/nzt48.webp'),
  free: require('../../assets/images/profiles/free.webp'),
  drivers: require('../../assets/images/profiles/drivers.webp'),
  seniors: require('../../assets/images/profiles/seniors.webp'),
  execs: require('../../assets/images/profiles/execs.webp'),
  students: require('../../assets/images/profiles/students.webp'),
  women: require('../../assets/images/profiles/women.webp'),
  polyglot: require('../../assets/images/profiles/polyglot.webp'),
  odv999: require('../../assets/images/profiles/odv999.webp'),
};

/** Бейдж-картинка профиля по id (undefined → показать эмодзи-фолбэк). */
export function profileBadge(id?: string) {
  return id ? PROFILE_BADGES[id] : undefined;
}
