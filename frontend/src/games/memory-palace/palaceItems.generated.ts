/* СОБРАНО СКРИПТОМ scripts/build-palace-items.mjs — РУКАМИ НЕ ПРАВИТЬ. */
/**
 * Картинки предметов «Дворца памяти»: ключ — id предмета из core/content.ts
 * (или имя файла для запаса, ещё не заведённого в библиотеку).
 *
 * Пересобрать:  node scripts/build-palace-items.mjs
 * Источник:     frontend/assets/images/palace/*.webp (лист 7×8, kie + bg-cutout)
 */
export const PALACE_ITEM_IMAGES: Record<string, number> = {
  cup: require('@/assets/images/palace/teacup.webp'),
  boat: require('@/assets/images/palace/paperboat.webp'),
  bell: require('@/assets/images/palace/handbell.webp'),
  clock: require('@/assets/images/palace/pocketwatch.webp'),
  shell: require('@/assets/images/palace/seashell.webp'),
  acorn: require('@/assets/images/palace/acorn.webp'),
  anchor: require('@/assets/images/palace/anchor.webp'),
  apple: require('@/assets/images/palace/apple.webp'),
  backpack: require('@/assets/images/palace/backpack.webp'),
  book: require('@/assets/images/palace/book.webp'),
  boot: require('@/assets/images/palace/boot.webp'),
  bottle: require('@/assets/images/palace/bottle.webp'),
  brick: require('@/assets/images/palace/brick.webp'),
  cactus: require('@/assets/images/palace/cactus.webp'),
  camera: require('@/assets/images/palace/camera.webp'),
  candle: require('@/assets/images/palace/candle.webp'),
  chair: require('@/assets/images/palace/chair.webp'),
  coin: require('@/assets/images/palace/coin.webp'),
  compass: require('@/assets/images/palace/compass.webp'),
  crown: require('@/assets/images/palace/crown.webp'),
  envelope: require('@/assets/images/palace/envelope.webp'),
  feather: require('@/assets/images/palace/feather.webp'),
  fork: require('@/assets/images/palace/fork.webp'),
  guitar: require('@/assets/images/palace/guitar.webp'),
  honeyjar: require('@/assets/images/palace/honeyjar.webp'),
  hourglass: require('@/assets/images/palace/hourglass.webp'),
  key: require('@/assets/images/palace/key.webp'),
  kite: require('@/assets/images/palace/kite.webp'),
  ladder: require('@/assets/images/palace/ladder.webp'),
  lamp: require('@/assets/images/palace/lamp.webp'),
  leaf: require('@/assets/images/palace/leaf.webp'),
  lemon: require('@/assets/images/palace/lemon.webp'),
  mirror: require('@/assets/images/palace/mirror.webp'),
  mitten: require('@/assets/images/palace/mitten.webp'),
  mushroom: require('@/assets/images/palace/mushroom.webp'),
  pencil: require('@/assets/images/palace/pencil.webp'),
  pumpkin: require('@/assets/images/palace/pumpkin.webp'),
  quill: require('@/assets/images/palace/quill.webp'),
  ribbon: require('@/assets/images/palace/ribbon.webp'),
  ring: require('@/assets/images/palace/ring.webp'),
  rubberduck: require('@/assets/images/palace/rubberduck.webp'),
  saucer: require('@/assets/images/palace/saucer.webp'),
  scissors: require('@/assets/images/palace/scissors.webp'),
  spinningtop: require('@/assets/images/palace/spinningtop.webp'),
  spoon: require('@/assets/images/palace/spoon.webp'),
  stone: require('@/assets/images/palace/stone.webp'),
  strawhat: require('@/assets/images/palace/strawhat.webp'),
  suitcase: require('@/assets/images/palace/suitcase.webp'),
  teapot: require('@/assets/images/palace/teapot.webp'),
  thermos: require('@/assets/images/palace/thermos.webp'),
  umbrella: require('@/assets/images/palace/umbrella.webp'),
  violet: require('@/assets/images/palace/violet.webp'),
  violin: require('@/assets/images/palace/violin.webp'),
  walnut: require('@/assets/images/palace/walnut.webp'),
  wateringcan: require('@/assets/images/palace/wateringcan.webp'),
  whistle: require('@/assets/images/palace/whistle.webp'),
};

/** Есть ли картинка для этого предмета. */
export function palaceItemImage(id: string): number | null {
  return PALACE_ITEM_IMAGES[id] ?? null;
}
