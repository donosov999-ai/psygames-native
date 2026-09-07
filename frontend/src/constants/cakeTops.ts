/**
 * ВИД ТОРТА СВЕРХУ — картинка вместо плоской заливки.
 *
 * 🔴 ПОЧЕМУ ВООБЩЕ. Денис 07.09.2026: «тортики надо отрисовать, щас страшные».
 * Клинья рисовались одноцветными треугольниками, и стол читался как диаграмма,
 * а не как кондитерская: шесть заливок в круге — это круговая диаграмма.
 *
 * 🔴 РИСУЕТСЯ ЦЕЛЫЙ КРУГЛЫЙ ТОРТ, А НА КЛИНЬЯ ЕГО РЕЖЕТ ЭКРАН.
 *
 * Первым замыслом было заказать у модели готовые сектора по 60°. Отменено до
 * генерации: держать угол ровно шестой частью круга и вершину точно в углу
 * кадра генератор не обязан, а ошибка в один-два градуса собирается в щель на
 * стыке шести кусков. Целый круг геометрию не задаёт вовсе — её задаёт тот же
 * `wedgePath`, что рисовал заливку, и стык остаётся точным по построению.
 *
 * ⚠️ ЗАЛИВКА ПОД КАРТИНКОЙ ОСТАЁТСЯ. Цвет вида начинки — единственный канал,
 * по которому игрок различает виды; картинка добавляет второй (рисунок), но не
 * заменяет первый. Не загрузился ассет — стол по-прежнему играбелен.
 *
 * ⚠️ ПОРЯДОК СПИСКА СОВПАДАЕТ С ПОРЯДКОМ ПАЛИТРЫ `СЛАДКАЯ` в `cakeThemes.ts`:
 * красный → клубника, янтарный → абрикос, жёлтый → лимон, лаймовый → фисташка,
 * изумрудный → мята, голубой → черника, синий → ежевика, фиалковый → лаванда,
 * розовый → малина, оранжевый → карамель, коричневый → шоколад. Двенадцатый
 * (ванильный) — запас: видов одиннадцать, и он ждёт следующего.
 *
 * КАК СДЕЛАНЫ. Один лист 4×3 у kie (Nano Banana, 2K, 12 кредитов): двенадцать
 * круглых тортов строго сверху на сплошной магенте. Резка — ПО ПРОВАЛАМ ФОНА, а
 * не делением поровну: сетка нашлась сама (полосы фона по X 557–645, 1155–1244,
 * 1753–1841; по Y 555–643, 1151–1240). Каждый торт стоял на белой подставке —
 * она обрезана радиусом 0,90 от внешнего края пятна, замер по радиальному
 * профилю клубничного: глазурь до 232 px, ободок с 240. Круг вырезан маской,
 * снаружи прозрачно. 12 файлов, 256×256, суммарно 155 КБ.
 */
import { ImageSourcePropType } from 'react-native';

export const CAKE_TOPS: ImageSourcePropType[] = [
  require('../../assets/images/cake_tops/strawberry.webp'),
  require('../../assets/images/cake_tops/apricot.webp'),
  require('../../assets/images/cake_tops/lemon.webp'),
  require('../../assets/images/cake_tops/pistachio.webp'),
  require('../../assets/images/cake_tops/mint.webp'),
  require('../../assets/images/cake_tops/blueberry.webp'),
  require('../../assets/images/cake_tops/blackberry.webp'),
  require('../../assets/images/cake_tops/lavender.webp'),
  require('../../assets/images/cake_tops/raspberry.webp'),
  require('../../assets/images/cake_tops/caramel.webp'),
  require('../../assets/images/cake_tops/chocolate.webp'),
  require('../../assets/images/cake_tops/vanilla.webp'),
];

/**
 * ПИЦЦЫ — вторая шкурка того же экрана (решение Дениса 07.09.2026).
 *
 * ⚠️ ЦВЕТА НАЧИНОК РАЗВЕДЕНЫ НАМЕРЕННО, И ЭТО ВАЖНЕЕ КУЛИНАРНОЙ ДОСТОВЕРНОСТИ.
 * У тортов вид различается цветом глазури, и палитра это гарантировала. Здесь
 * картинка кроет заливку целиком, значит различать виды приходится САМОМУ
 * рисунку: пепперони красная, песто зелёная, чернила каракатицы чёрная,
 * свекольная фиолетовая, кукурузная жёлтая и так далее — двенадцать далеко
 * разнесённых тонов, а не двенадцать оттенков томата.
 */
export const PIZZA_TOPS: ImageSourcePropType[] = [
  require('../../assets/images/pizza_tops/pepperoni.webp'),
  require('../../assets/images/pizza_tops/margherita.webp'),
  require('../../assets/images/pizza_tops/fourcheese.webp'),
  require('../../assets/images/pizza_tops/pesto.webp'),
  require('../../assets/images/pizza_tops/spinach.webp'),
  require('../../assets/images/pizza_tops/seafood.webp'),
  require('../../assets/images/pizza_tops/squidink.webp'),
  require('../../assets/images/pizza_tops/beetroot.webp'),
  require('../../assets/images/pizza_tops/ham.webp'),
  require('../../assets/images/pizza_tops/corn.webp'),
  require('../../assets/images/pizza_tops/mushroom.webp'),
  require('../../assets/images/pizza_tops/bianca.webp'),
];

/**
 * ПОСУДА ПОД ПИЦЦУ — своя, а не кондитерские тарелки тем.
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНО, А НЕ ТЕМАМИ. Тарелок у тортов 72 (девять тем по восемь), и
 * они несут ТЕМУ профиля: сладкая, шахматная, биохак. Пицца к теме профиля
 * отношения не имеет — ей нужен материал: дерево, металл, керамика, солома.
 * Восьми хватает ровно затем же, зачем восемь у тортов: чтобы стол из двадцати
 * не выглядел обоями.
 *
 * КАК СДЕЛАНЫ. Лист 4×2 у kie (2K, 12 кредитов), восемь пустых круглых подставок
 * строго сверху на магенте. Резка по провалам фона; кадр сжат на 8 px, чтобы
 * убрать линии-разделители исходника, и взята САМАЯ БОЛЬШАЯ связная область —
 * обрывки линий в неё не входят. Фон снят цветовым ключом с ДЕСПИЛЛОМ: у
 * перфорированного противня магента видна сквозь отверстия, и семантическая
 * модель залила бы их металлом, а ключ вычистил насквозь. Первая редакция без
 * деспилла оставляла магентовую кайму по краю — видно на листе проверки.
 * 8 файлов 256×256, 97 КБ.
 */
export const PIZZA_BOARDS: ImageSourcePropType[] = [
  require('../../assets/images/pizza_boards/oak.webp'),
  require('../../assets/images/pizza_boards/walnut.webp'),
  require('../../assets/images/pizza_boards/alupan.webp'),
  require('../../assets/images/pizza_boards/castiron.webp'),
  require('../../assets/images/pizza_boards/terracotta.webp'),
  require('../../assets/images/pizza_boards/porcelain.webp'),
  require('../../assets/images/pizza_boards/wicker.webp'),
  require('../../assets/images/pizza_boards/copper.webp'),
];

/** Какую еду рисуем на куске. */
export type КруглаяШкурка = 'cake' | 'pizza';

/** Посуда под шкурку: у пиццы своя, у тортов — тарелки темы профиля. */
export function boardsFor(skin: КруглаяШкурка, тарелкиТемы: ImageSourcePropType[]): ImageSourcePropType[] {
  return skin === 'pizza' ? PIZZA_BOARDS : тарелкиТемы;
}

/** Картинка вида начинки. Виды нумеруются с нуля и не выходят за длину списка. */
export function topFor(skin: КруглаяШкурка, type: number): ImageSourcePropType {
  const список = skin === 'pizza' ? PIZZA_TOPS : CAKE_TOPS;
  return список[((type % список.length) + список.length) % список.length] as ImageSourcePropType;
}

/** Прежнее имя — торты. Оставлено, чтобы старые вызовы не переписывать разом. */
export function cakeTop(type: number): ImageSourcePropType {
  return topFor('cake', type);
}
