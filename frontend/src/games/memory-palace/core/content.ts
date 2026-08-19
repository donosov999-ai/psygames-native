import type { PalaceItem, PalaceLocus } from './types';

export const FIXED_PALACE_ROUTE: readonly PalaceLocus[] = [
  { id: 'gate', order: 1, label: { ru: 'Арка входа', en: 'Entrance arch' }, motif: 'arch', color: '#7356a8' },
  { id: 'fountain', order: 2, label: { ru: 'Фонтан', en: 'Fountain' }, motif: 'water', color: '#2c8db9' },
  { id: 'gallery', order: 3, label: { ru: 'Галерея', en: 'Gallery' }, motif: 'frames', color: '#b05f6d' },
  { id: 'stairs', order: 4, label: { ru: 'Лестница', en: 'Stairway' }, motif: 'steps', color: '#9a784f' },
  { id: 'window', order: 5, label: { ru: 'Высокое окно', en: 'Tall window' }, motif: 'window', color: '#3e89a3' },
  { id: 'library', order: 6, label: { ru: 'Библиотека', en: 'Library' }, motif: 'shelves', color: '#895849' },
  { id: 'balcony', order: 7, label: { ru: 'Балкон', en: 'Balcony' }, motif: 'rail', color: '#54718f' },
  { id: 'garden', order: 8, label: { ru: 'Зимний сад', en: 'Winter garden' }, motif: 'plant', color: '#4c8b64' },
  { id: 'workshop', order: 9, label: { ru: 'Мастерская', en: 'Workshop' }, motif: 'tools', color: '#a6693d' },
  { id: 'tower', order: 10, label: { ru: 'Башня', en: 'Tower' }, motif: 'spire', color: '#775f9a' },
  { id: 'bridge', order: 11, label: { ru: 'Небесный мост', en: 'Sky bridge' }, motif: 'span', color: '#4c7894' },
  { id: 'observatory', order: 12, label: { ru: 'Обсерватория', en: 'Observatory' }, motif: 'stars', color: '#4b568d' },
];

export const PALACE_ITEM_LIBRARY: readonly PalaceItem[] = [
  { id: 'apple', label: { ru: 'Красное яблоко', en: 'Red apple' }, shape: 'round', color: '#d84f4b', accent: '#7f2827' },
  { id: 'book', label: { ru: 'Синяя книга', en: 'Blue book' }, shape: 'square', color: '#446bc4', accent: '#253f83' },
  { id: 'key', label: { ru: 'Золотой ключ', en: 'Golden key' }, shape: 'capsule', color: '#d6a32c', accent: '#7d5a12' },
  { id: 'leaf', label: { ru: 'Зелёный лист', en: 'Green leaf' }, shape: 'diamond', color: '#4b9a5b', accent: '#24552e' },
  { id: 'cup', label: { ru: 'Бирюзовая чашка', en: 'Turquoise cup' }, shape: 'arch', color: '#36a5a0', accent: '#17605e' },
  { id: 'lamp', label: { ru: 'Оранжевая лампа', en: 'Orange lamp' }, shape: 'triangle', color: '#e4863f', accent: '#87451c' },
  { id: 'boat', label: { ru: 'Голубая лодка', en: 'Blue boat' }, shape: 'capsule', color: '#48a5d1', accent: '#236181' },
  { id: 'bell', label: { ru: 'Жёлтый колокол', en: 'Yellow bell' }, shape: 'arch', color: '#e5bd38', accent: '#846813' },
  { id: 'kite', label: { ru: 'Фиолетовый змей', en: 'Violet kite' }, shape: 'diamond', color: '#9664c6', accent: '#563579' },
  { id: 'crown', label: { ru: 'Янтарная корона', en: 'Amber crown' }, shape: 'triangle', color: '#dd9630', accent: '#7f5012' },
  { id: 'clock', label: { ru: 'Тёмные часы', en: 'Dark clock' }, shape: 'round', color: '#43506e', accent: '#202739' },
  { id: 'camera', label: { ru: 'Мятная камера', en: 'Mint camera' }, shape: 'square', color: '#55a58d', accent: '#285d4d' },
  { id: 'feather', label: { ru: 'Розовое перо', en: 'Pink feather' }, shape: 'capsule', color: '#d77ba0', accent: '#7d3b58' },
  { id: 'shell', label: { ru: 'Коралловая ракушка', en: 'Coral shell' }, shape: 'round', color: '#df775e', accent: '#83392d' },
  { id: 'compass', label: { ru: 'Стальной компас', en: 'Steel compass' }, shape: 'round', color: '#5d84a6', accent: '#2d4a63' },
  { id: 'violin', label: { ru: 'Каштановая скрипка', en: 'Chestnut violin' }, shape: 'capsule', color: '#9b5d3c', accent: '#552f1d' },
];

export function getLocusLabel(locus: PalaceLocus, locale: 'ru' | 'en'): string {
  return locus.label[locale];
}

export function getItemLabel(item: PalaceItem, locale: 'ru' | 'en'): string {
  return item.label[locale];
}
