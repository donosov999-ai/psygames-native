// Бейджи профилей (Nano Banana 2, глянец-3D, нарезка из ОДНОЙ картинки 4×4).
// Заменяют эмодзи в свитчере профилей. id → png, фолбэк на эмодзи если нет.
export const PROFILE_BADGES: Record<string, any> = {
  chess: require('../../assets/images/profiles/chess.png'),
  kids: require('../../assets/images/profiles/kids.png'),
  vasilyeva: require('../../assets/images/profiles/vasilyeva.png'),
  nzt48: require('../../assets/images/profiles/nzt48.png'),
  free: require('../../assets/images/profiles/free.png'),
  drivers: require('../../assets/images/profiles/drivers.png'),
  seniors: require('../../assets/images/profiles/seniors.png'),
  execs: require('../../assets/images/profiles/execs.png'),
  students: require('../../assets/images/profiles/students.png'),
  women: require('../../assets/images/profiles/women.png'),
  polyglot: require('../../assets/images/profiles/polyglot.png'),
  odv999: require('../../assets/images/profiles/odv999.png'),
};

/** Бейдж-картинка профиля по id (undefined → показать эмодзи-фолбэк). */
export function profileBadge(id?: string) {
  return id ? PROFILE_BADGES[id] : undefined;
}
