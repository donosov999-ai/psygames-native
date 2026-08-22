/* psygames-game-story-recall · VER 1 · 19.08.2026 */
/**
 * Story Recall (Wechsler Logical Memory style)
 *
 * Парадигма: показывается короткий рассказ (~80-120 слов) с N ключевыми деталями.
 * Через 30 сек дистрактор-задачи (распадение слежения) — immediate recall.
 * Через 3 мин дистрактор-задач — delayed recall.
 *
 * Биомаркеры:
 *  - immediate_recall_pct  — % ключевых деталей в первом recall
 *  - delayed_recall_pct    — % в delayed
 *  - retention_rate        — delayed/immediate (≥0.85 = норма; <0.7 = forgetting)
 *
 * Ключевые слова матчатся через простой stem-match: первые 4-5 букв слова из
 * текста ответа сравниваются с key-словами рассказа. Не идеально, но работает
 * для русского/английского без NLP.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { STORY_MAX_LEVEL, readSecondsFor, distractorSecondsFor } from '@/src/services/storyRecallLevels';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT = ['#654ea3', '#eaafc8'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.83 (норма AA 4.5), стало 4.51.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #f7dfe9 @0.18 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const STORY_BENEFITS = [
  { icon: 'book-outline',         textKey: 'benefitStory1' },
  { icon: 'time-outline',          textKey: 'benefitStory2' },
  { icon: 'briefcase-outline',     textKey: 'benefitStory3' },
];

interface Story {
  ru: string;
  en: string;
  keywords_ru: string[];
  keywords_en: string[];
  read_seconds: number;
}

export const STORIES: Story[] = [
  {
    ru: 'Анна Морозова работает в больнице на улице Ленина. Вчера вечером она вышла с работы в 8 часов и пошла домой пешком. По дороге она встретила старого друга Михаила, который рассказал, что выиграл 500 тысяч рублей в лотерею. Они вместе зашли в кафе на углу и заказали пиццу. Михаил пообещал купить Анне новый велосипед в подарок.',
    en: 'Anna Miller works at the hospital on Maple Street. Yesterday evening she left work at 8 oclock and walked home. On the way she met an old friend Thomas, who told her he won 500 thousand dollars in the lottery. They went together to the cafe on the corner and ordered a pizza. Thomas promised to buy Anna a new bicycle as a gift.',
    keywords_ru: ['Анна','Морозова','больница','Ленина','вечером','8','часов','пешком','Михаил','выиграл','500','тысяч','лотерею','кафе','углу','пиццу','велосипед','подарок'],
    keywords_en: ['Anna','Miller','hospital','Maple','evening','8','oclock','walked','Thomas','won','500','thousand','lottery','cafe','corner','pizza','bicycle','gift'],
    read_seconds: 30,
  },
  {
    ru: 'Виктор Иванович — инженер на заводе в Екатеринбурге. У него три собаки: овчарка Рекс, такса Мухтар и дворняжка Жучка. В субботу он повёз семью на дачу. По дороге сломалась машина возле деревни Берёзовка. Через два часа их забрал сосед на грузовике. Виктор заплатил за ремонт 15 тысяч рублей.',
    en: 'Victor Hansen is an engineer at a factory in Portland. He has three dogs: a shepherd named Rex, a dachshund named Oscar, and a mutt named Daisy. On Saturday he took his family to the lake house. The car broke down on the way near the village of Ashford. Two hours later their neighbor picked them up in a truck. Victor paid 1500 dollars for the repair.',
    keywords_ru: ['Виктор','Иванович','инженер','заводе','Екатеринбурге','три','собаки','овчарка','Рекс','такса','Мухтар','дворняжка','Жучка','субботу','дачу','Берёзовка','два','часа','сосед','грузовике','15','тысяч'],
    keywords_en: ['Victor','Hansen','engineer','factory','Portland','three','dogs','shepherd','Rex','dachshund','Oscar','mutt','Daisy','Saturday','lake','Ashford','two','hours','neighbor','truck','1500','dollars'],
    read_seconds: 35,
  },
  {
    ru: 'Елена Соколова — учитель математики в школе номер 42. У неё два сына: Артём 12 лет и Даниил 9 лет. В понедельник утром старший сын потерял ключи от квартиры в школьной раздевалке. Елена заплатила слесарю 3500 рублей за новый замок. Вечером семья ужинала в ресторане «Парус» на набережной.',
    en: 'Ellen Carter is a math teacher at school number 42. She has two sons: Aaron age 12 and Daniel age 9. On Monday morning the older son lost the apartment keys in the school locker room. Ellen paid a locksmith 350 dollars for a new lock. In the evening the family had dinner at the Harbour restaurant on the waterfront.',
    keywords_ru: ['Елена','Соколова','учитель','математики','школе','42','два','сына','Артём','12','Даниил','9','понедельник','утром','ключи','раздевалке','3500','замок','ресторане','Парус','набережной'],
    keywords_en: ['Ellen','Carter','teacher','math','school','42','two','sons','Aaron','12','Daniel','9','Monday','morning','keys','locker','350','lock','restaurant','Harbour','waterfront'],
    read_seconds: 35,
  },
  {
    ru: 'Сергей Кузнецов — директор автосалона «БМВ» в Новосибирске. В четверг к нему пришёл клиент — Михаил Петров — и купил машину за 4 миллиона рублей наличными. Через неделю Сергей улетел в Турцию на отдых с семьёй из четырёх человек. Они остановились в отеле «Ривьера» на 10 дней.',
    en: 'Simon Keller is the director of the BMW dealership in Leeds. On Thursday a client Martin Price came and bought a car for 4 hundred thousand in cash. A week later Simon flew to Greece on vacation with a family of four. They stayed at Riviera hotel for 10 days.',
    keywords_ru: ['Сергей','Кузнецов','директор','автосалона','БМВ','Новосибирске','четверг','Михаил','Петров','4','миллиона','наличными','неделю','Турцию','четырёх','Ривьера','10','дней'],
    keywords_en: ['Simon','Keller','director','dealership','BMW','Leeds','Thursday','Martin','Price','4','hundred','cash','week','Greece','four','Riviera','10','days'],
    read_seconds: 30,
  },
  {
    ru: 'Татьяна Лебедева — врач-стоматолог в клинике «Жемчуг» на Невском проспекте 78. В пятницу к ней пришёл пациент с острой зубной болью. Операция длилась 45 минут и стоила 8500 рублей. После работы Татьяна забрала дочь Машу из детского сада «Радуга» и купила ей мороженое.',
    en: 'Tanya Brooks is a dentist at the Pearl clinic at 78 Chestnut Avenue. On Friday a patient came with acute toothache. The surgery lasted 45 minutes and cost 850 dollars. After work Tanya picked up her daughter Molly from kindergarten Rainbow and bought her an ice cream.',
    keywords_ru: ['Татьяна','Лебедева','стоматолог','Жемчуг','Невском','78','пятницу','пациент','зубной','45','минут','8500','дочь','Машу','сада','Радуга','мороженое'],
    keywords_en: ['Tanya','Brooks','dentist','Pearl','Chestnut','78','Friday','patient','toothache','45','minutes','850','daughter','Molly','kindergarten','Rainbow','ice'],
    read_seconds: 32,
  },
  {
    ru: 'Андрей Орлов — фермер в Краснодарском крае. У него 200 гектаров земли, на которых он выращивает пшеницу и подсолнечник. В августе он продал урожай за 12 миллионов рублей. На вырученные деньги купил два новых комбайна марки «Ростсельмаш». Жена Светлана взяла 3 миллиона на ремонт дома.',
    en: 'Adrian Ford is a farmer in the Redland valley. He has 200 hectares of land where he grows wheat and sunflower. In August he sold the harvest for 1200 thousand and bought two combines. His wife Sylvia keeps 3 thousand chickens and sells eggs to the market.',
    keywords_ru: ['Андрей','Орлов','фермер','Краснодарском','200','гектаров','пшеницу','подсолнечник','августе','12','миллионов','два','комбайна','Ростсельмаш','Светлана','3','миллиона','ремонт'],
    keywords_en: ['Adrian','Ford','farmer','Redland','200','hectares','wheat','sunflower','August','1200','thousand','two','combines','Sylvia','3','chickens','eggs','market'],
    read_seconds: 32,
  },
  {
    ru: 'Ольга Семёнова — журналист газеты «Вечерняя Москва». Во вторник она брала интервью у министра транспорта о новой ветке метро. Интервью длилось 90 минут в офисе на Тверской 17. После Ольга поехала в редакцию написать статью на 5 страниц до дедлайна в 18:00.',
    en: 'Olivia Stone is a journalist for the Evening Herald newspaper. On Tuesday she interviewed the transport minister about the new metro line. The interview lasted 90 minutes in the office at 17 Bridge Street. She wrote 5 pages and the piece came out on the 18th.',
    keywords_ru: ['Ольга','Семёнова','журналист','Вечерняя','Москва','вторник','министра','транспорта','метро','90','минут','Тверской','17','5','страниц','18'],
    keywords_en: ['Olivia','Stone','journalist','Evening','Herald','Tuesday','minister','transport','metro','90','minutes','Bridge','17','5','pages','18'],
    read_seconds: 32,
  },
  {
    ru: 'Дмитрий Волков — программист в компании «Яндекс». Он живёт в квартире на улице Профсоюзная 105 с женой Анастасией и кошкой по кличке Барсик. В выходные они поехали на велосипедах в парк «Сокольники». Прокатились 25 километров и пообедали в кафе «Шоколадница» за 1800 рублей.',
    en: 'Daniel Wolfe is a programmer at a search company. He lives in an apartment at 105 Fairview Street with his wife Amelia and a cat named Biscuit. On the weekend he goes biking in Elmwood park, about 25 kilometers. On Sunday they had breakfast at the Sunflower cafe for 180 dollars.',
    keywords_ru: ['Дмитрий','Волков','программист','Яндекс','Профсоюзная','105','Анастасией','Барсик','велосипедах','Сокольники','25','километров','Шоколадница','1800'],
    keywords_en: ['Daniel','Wolfe','programmer','search','Fairview','105','Amelia','Biscuit','biking','Elmwood','25','kilometers','Sunflower','180'],
    read_seconds: 30,
  },
  {
    ru: 'Наталья Морозова — владелица цветочного магазина «Лилия» на Арбате. В среду она получила заказ на свадьбу — 50 букетов роз и 30 бутоньерок. Заказ стоил 75 тысяч рублей. Доставку организовали на трёх микроавтобусах в субботу в 11 утра. Свадьба была в ресторане «Кремль».',
    en: 'Nadine Porter owns the Lily flower shop on Bakerside. On Wednesday she received a wedding order — 50 rose bouquets and 30 boutonnieres. The order cost 7500 dollars. She delivered the flowers in three minibuses on Saturday at 11 oclock to the Old Castle.',
    keywords_ru: ['Наталья','Морозова','цветочного','Лилия','Арбате','среду','свадьбу','50','букетов','30','75','тысяч','трёх','микроавтобусах','субботу','11','Кремль'],
    keywords_en: ['Nadine','Porter','flower','Lily','Bakerside','Wednesday','wedding','50','bouquets','30','7500','three','minibuses','Saturday','11','Castle'],
    read_seconds: 32,
  },
  {
    ru: 'Игорь Соколов — пилот авиакомпании «Аэрофлот». В прошлую пятницу он летел рейсом Москва-Владивосток. На борту было 234 пассажира и 9 членов экипажа. Полёт длился 9 часов 15 минут. После приземления Игорь остановился в гостинице «Версаль» на улице Светланской 22.',
    en: 'Ian Sullivan is a pilot for a national airline. Last Friday he flew the Dublin-Toronto route. There were 234 passengers and 9 crew members on board. The flight lasted 9 hours and 15 minutes. He stayed at the Versailles hotel on Kingsway street.',
    keywords_ru: ['Игорь','Соколов','пилот','Аэрофлот','пятницу','Москва','Владивосток','234','пассажира','9','экипажа','9','часов','15','минут','Версаль','Светланской','22'],
    keywords_en: ['Ian','Sullivan','pilot','airline','Friday','Dublin','Toronto','234','passengers','9','crew','9','hours','15','minutes','Versailles','Kingsway'],
    read_seconds: 35,
  },
  {
    ru: 'Марина Зайцева — преподаватель йоги в студии «Лотос» на проспекте Мира 88. У неё 4 группы по 12 человек каждая. Абонемент стоит 6500 рублей в месяц. В прошлый вторник она провела мастер-класс по медитации для 30 участников. Заработала 25 тысяч за один день.',
    en: 'Maren Lindqvist teaches yoga at the Lotus studio at 88 Cedar Avenue. She has 4 groups of 12 people each. A subscription costs 65 dollars per month. Last Tuesday she held a meditation for 30 people and earned 2500 in one evening.',
    keywords_ru: ['Марина','Зайцева','йоги','Лотос','Мира','88','4','группы','12','6500','месяц','вторник','медитации','30','25','тысяч'],
    keywords_en: ['Maren','Lindqvist','yoga','Lotus','Cedar','88','4','groups','12','65','month','Tuesday','meditation','30','2500'],
    read_seconds: 30,
  },
  {
    ru: 'Павел Григорьев — владелец сети из 8 кафе быстрого питания «Бургер Хаус» в Самаре. На него работают 145 человек. Месячный оборот — 14 миллионов рублей. В апреле он открыл новую точку в торговом центре «Космопорт» с инвестицией 5 миллионов. Окупаемость планируется за 18 месяцев.',
    en: 'Peter Grant owns a network of 8 Burger House fast food cafes in Bristol. He employs 145 people. Monthly turnover is 140 thousand. In April he opened a new spot at the Cosmoport mall and expects it to pay back in 18 months.',
    keywords_ru: ['Павел','Григорьев','8','кафе','Бургер','Хаус','Самаре','145','14','миллионов','апреле','Космопорт','5','миллионов','18','месяцев'],
    keywords_en: ['Peter','Grant','8','cafes','Burger','House','Bristol','145','140','thousand','April','Cosmoport','18','months'],
    read_seconds: 32,
  },
  {
    ru: 'Светлана Егорова — медсестра в кардиологическом отделении больницы №7. В её смене 18 пациентов. В четверг привезли 2 новых после инфаркта. Один из них — мужчина 56 лет по имени Алексей. Светлана дежурит 3 раза в неделю по 12 часов и получает 65 тысяч рублей в месяц.',
    en: 'Sylvia Reed is a nurse in the cardiology department of hospital number 7. Her shift has 18 patients. On Thursday they brought 2 new ones after heart attacks. One of them, 56 year old Albert, needed surgery. Sylvia worked 12 hours and earned 650 dollars for the shift.',
    keywords_ru: ['Светлана','Егорова','медсестра','кардиологическом','7','18','пациентов','четверг','2','инфаркта','56','Алексей','3','12','часов','65','тысяч'],
    keywords_en: ['Sylvia','Reed','nurse','cardiology','7','18','patients','Thursday','2','heart','attacks','56','Albert','12','hours','650'],
    read_seconds: 35,
  },
  {
    ru: 'Александр Никитин — таксист в Казани. Работает 5 дней в неделю на машине Toyota Camry, которую купил в кредит за 2 миллиона. В среду вечером он отвёз клиента из аэропорта в гостиницу «Кремлёвская» за 850 рублей. Клиент дал 200 рублей чаевых. За день Александр заработал 4500.',
    en: 'Adam Nolan is a taxi driver in Glasgow. He works 5 days a week in a Toyota Camry he bought on credit for 20 thousand. On Wednesday evening he drove a passenger from the airport to Kingsmill street for 85 dollars and got a 20 tip. That day he earned 450.',
    keywords_ru: ['Александр','Никитин','таксист','Казани','5','Toyota','Camry','2','миллиона','среду','аэропорта','Кремлёвская','850','200','чаевых','4500'],
    keywords_en: ['Adam','Nolan','taxi','Glasgow','5','Toyota','Camry','20','thousand','Wednesday','airport','Kingsmill','85','20','tip','450'],
    read_seconds: 32,
  },
  {
    ru: 'Ирина Беляева — детский психолог в центре «Радость» на улице Гагарина 14. В понедельник у неё было 6 консультаций по 50 минут каждая. Стоимость одной сессии — 4000 рублей. Самый сложный случай — мальчик Степан 8 лет с тревожным расстройством. Курс терапии займёт 12 встреч.',
    en: 'Irene Bishop is a child psychologist at the Joy center at 14 Garden Street. On Monday she had 6 consultations of 50 minutes each. One session costs 40 dollars. Her patient Stephen, 8 years old, is afraid of the dark; his anxiety dropped after 12 sessions.',
    keywords_ru: ['Ирина','Беляева','психолог','Радость','Гагарина','14','понедельник','6','50','минут','4000','Степан','8','тревожным','12','встреч'],
    keywords_en: ['Irene','Bishop','psychologist','Joy','Garden','14','Monday','6','50','minutes','40','Stephen','8','anxiety','12','sessions'],
    read_seconds: 32,
  },
  {
    ru: 'Денис Островский — тренер по плаванию в спорткомплексе «Дельфин». У него три группы детей: младшая — 15 учеников 6-7 лет, средняя — 12 учеников 8-10 лет, старшая — 10 спортсменов 11-14 лет. В прошлом месяце старшая группа выиграла региональные соревнования и получила 3 золотые медали.',
    en: 'Dennis Oakley is a swimming coach at the Dolphin sports complex. He has three groups of children: junior — 15 students 6-7 years old, middle — 12 students 8-10, senior — 10 students 11-14. In March his team won 3 gold medals at the regional championship.',
    keywords_ru: ['Денис','Островский','тренер','плаванию','Дельфин','три','группы','15','6','7','12','8','10','10','11','14','3','золотые','медали'],
    keywords_en: ['Dennis','Oakley','coach','swimming','Dolphin','three','groups','15','6','7','12','8','10','10','11','14','3','gold','medals'],
    read_seconds: 35,
  },
];

type GamePhase = 'intro' | 'config' | 'reading' | 'distractor1' | 'recall1' | 'distractor2' | 'recall2' | 'result';

const DISTRACTOR1_SEC = 30;   // short delay before immediate recall
const DISTRACTOR2_SEC = 90;   // longer delay before delayed recall

/** Стем ключа — то, по чему идёт сравнение с пересказом. */
export const storyStem = (kw: string): string =>
  kw.toLowerCase().slice(0, Math.max(4, Math.min(kw.length, 5)));

/**
 * КЛЮЧИ, КОТОРЫЕ РЕАЛЬНО МОЖНО НАБРАТЬ ПОРОЗНЬ — и числитель, и знаменатель берут их.
 *
 * 🔴 ЧТО БЫЛО. Считали по одному списку, делили на другой. Сравнение идёт по стему в
 * 4–5 букв, а в списках лежали ключи, у которых стем ОДИН:
 *
 *   «миллионов» и «миллиона» → оба «милли»: одно написанное слово засчитывалось ДВАЖДЫ;
 *   «9» дважды в одном рассказе (234 пассажира и 9 членов экипажа, 9 часов полёта) →
 *   в множество попадал один, а делили на 18 → безупречный пересказ давал 17/18.
 *
 * Оба перекоса тихие: человек получал «ошибку» за идеальную работу либо лишний балл за
 * половину. Заявленный биомаркер `retention_rate` считался по искажённым числителю И
 * знаменателю сразу.
 *
 * Отбрасываем и вложенные стемы: если один стем — начало другого, одно слово подошло бы
 * к обоим, и это снова двойной счёт.
 */
export function storyKeys(keywords: readonly string[]): string[] {
  const kept: string[] = [];
  const stems: string[] = [];
  for (const kw of keywords) {
    const st = storyStem(kw);
    if (stems.some((prev) => prev === st || st.startsWith(prev) || prev.startsWith(st))) continue;
    stems.push(st);
    kept.push(kw);
  }
  return kept;
}

/** Сколько ключей рассказа названо в пересказе. Сравнение по стему (4–5 букв). */
export function countStoryMatches(text: string, keywords: readonly string[]): number {
  const words = text.toLowerCase().split(/[\s,;.!?]+/).filter(Boolean);
  const matched = new Set<string>();
  for (const kw of storyKeys(keywords)) {
    const stem = storyStem(kw);
    for (const w of words) {
      if (w.startsWith(stem)) { matched.add(stem); break; }
    }
  }
  return matched.size;
}

export default function StoryRecallGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  /**
   * Уровень здесь настоящий: он ужимает время на чтение и удлиняет помеху перед
   * пересказом (см. storyRecallLevels.ts). Тексты не трогаем — ключевые слова,
   * по которым считается попадание, привязаны к ним.
   */
  const lvl = usePersistentLevel('story_recall');
  // Длительности читаются ВНУТРИ setInterval — держим их в ref, иначе замыкание
  // возьмёт значение с момента создания таймера и уровень перестанет влиять.
  const readSecRef = useRef(0);
  const dist1Ref = useRef(DISTRACTOR1_SEC);
  const dist2Ref = useRef(DISTRACTOR2_SEC);
  const router = useRouter();

  const { isPreset, autostart, isCalm } = useGamePreset();   // зарядка передаёт ?wu=1 → intro/config пропускаем
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [story, setStory] = useState<Story>(STORIES[0]);
  const [readRemaining, setReadRemaining] = useState(0);
  const [distractorRemaining, setDistractorRemaining] = useState(0);
  const [recall1Text, setRecall1Text] = useState('');
  const [recall2Text, setRecall2Text] = useState('');
  const [recall1Hits, setRecall1Hits] = useState(0);
  const [recall2Hits, setRecall2Hits] = useState(0);

  const [distractorMath, setDistractorMath] = useState({ a: 0, b: 0, op: '+' as '+'|'-' });
  const [distractorInput, setDistractorInput] = useState('');
  const [distractorScore, setDistractorScore] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  /**
   * Совпадения пересказа с ключами. Правило одно на игру (`countStoryMatches`) — и по
   * нему же считается знаменатель, иначе они снова разъедутся.
   */
  const countMatches = (text: string, keywords: string[]): number => countStoryMatches(text, keywords);

  const startGame = () => {
    const s = STORIES[Math.floor(Math.random() * STORIES.length)];
    setStory(s);
    setRecall1Text(''); setRecall2Text('');
    setRecall1Hits(0); setRecall2Hits(0);
    setDistractorScore(0);
    const readSec = readSecondsFor(s.read_seconds, lvl.level);
    readSecRef.current = readSec;
    setReadRemaining(readSec);
    setPhase('reading');
    startTimeRef.current = gameNow();
    intervalRef.current = setInterval(() => {
      const left = readSec - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setReadRemaining(Math.max(0, left));
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        startDistractor1();
      }
    }, 200);
  };
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const startDistractor1 = () => {
    setPhase('distractor1');
    const d1 = distractorSecondsFor(DISTRACTOR1_SEC, lvl.level);
    dist1Ref.current = d1;
    setDistractorRemaining(d1);
    nextDistractorTrial();
    startTimeRef.current = gameNow();
    intervalRef.current = setInterval(() => {
      const left = dist1Ref.current - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setDistractorRemaining(Math.max(0, left));
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPhase('recall1');
      }
    }, 200);
  };

  const nextDistractorTrial = () => {
    const a = 1 + Math.floor(Math.random() * 19);
    const b = 1 + Math.floor(Math.random() * 19);
    const op = Math.random() < 0.5 ? '+' : '-';
    setDistractorMath({ a, b, op });
    setDistractorInput('');
  };

  const submitDistractor = () => {
    const expected = distractorMath.op === '+' ? distractorMath.a + distractorMath.b : distractorMath.a - distractorMath.b;
    if (parseInt(distractorInput) === expected) setDistractorScore(s => s + 1);
    nextDistractorTrial();
  };

  const submitRecall1 = () => {
    const kws = language === 'ru' ? story.keywords_ru : story.keywords_en;
    const hits = countMatches(recall1Text, kws);
    setRecall1Hits(hits);
    startDistractor2(hits);
  };

  const startDistractor2 = (hits1: number) => {
    setPhase('distractor2');
    const d2 = distractorSecondsFor(DISTRACTOR2_SEC, lvl.level);
    dist2Ref.current = d2;
    setDistractorRemaining(d2);
    nextDistractorTrial();
    startTimeRef.current = gameNow();
    intervalRef.current = setInterval(() => {
      const left = dist2Ref.current - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setDistractorRemaining(Math.max(0, left));
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPhase('recall2');
      }
    }, 200);
  };

  const submitRecall2 = async () => {
    const kws = language === 'ru' ? story.keywords_ru : story.keywords_en;
    const hits = countMatches(recall2Text, kws);
    setRecall2Hits(hits);
    setPhase('result');
    const total = storyKeys(kws).length;
    const immediatePct = total > 0 ? (recall1Hits / total) : 0;
    const delayedPct = total > 0 ? (hits / total) : 0;
    const retention = immediatePct > 0 ? delayedPct / immediatePct : 0;
    // Пересказ доводят до конца — провалить нельзя. Уровень засчитан завершением.
    const doneLevel = lvl.level;
    if (doneLevel < STORY_MAX_LEVEL) lvl.reach(doneLevel + 1);
    try {
      await saveSession({
        game_type: 'story_recall',
        score: Math.round((recall1Hits + hits) * 50),
        time_seconds: 0,
        difficulty: 'medium',
        mode: 'standard',
        errors: total - hits,
        details: {
          level: doneLevel,   // результат сравним ВНУТРИ уровня: условия чтения и помехи разные
          n_keywords: total,
          immediate_recall_count: recall1Hits,
          delayed_recall_count: hits,
          immediate_recall_pct: Number(immediatePct.toFixed(3)),
          delayed_recall_pct: Number(delayedPct.toFixed(3)),
          retention_rate: Number(retention.toFixed(3)),
          distractor_score: distractorScore,
        },
      });
    } catch (e) { console.error(e); }
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="book" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('story')}</Text>
        <Text style={styles.configDesc}>{t('storyDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="storyIntroDesc" benefits={STORY_BENEFITS} accent={GRADIENT[0]} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('storyInfo')}</Text>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {t('storyInfoBody')}
        </Text>
      </View>
      <LevelProgressMap bestLevel={lvl.best}
        gameId="story_recall"
        currentLevel={lvl.level} onPickLevel={lvl.pick}
        maxLevel={STORY_MAX_LEVEL}
        colors={colors}
        language={language}
      />
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
    </View>
  );

  // Skip distractor → перейти сразу к recall (если юзер чувствует что готов)
  const skipDistractor = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (phase === 'distractor1') setPhase('recall1');
    else if (phase === 'distractor2') setPhase('recall2');
  };

  // игровые фазы (чтение/математика/пересказ) — на едином каркасе GameShell:
  // кнопки прибиты к низу, поле в скролле (TextInput + клавиатура)
  if (phase === 'reading' || phase === 'distractor1' || phase === 'distractor2'
    || phase === 'recall1' || phase === 'recall2') {
    const isDistractor = phase === 'distractor1' || phase === 'distractor2';
    const isRecall = phase === 'recall1' || phase === 'recall2';
    const which: 1 | 2 = phase === 'recall2' ? 2 : 1;
    return (
      <GameShell
        title={t('story')}
        onBack={() => goBackOrHome()}
        scrollableField
        stats={
          phase === 'reading' ? (
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: colors.text, fontSize: 20 }]}>{t('storyReadPhase')} · {t('timeLeftLabel')} {readRemaining}{t('secShort')}</Text>
            </View>
          ) : isDistractor ? (
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: colors.text }]}>
                {phase === 'distractor1' ? t('storyDistractor1') : t('storyDistractor2')} · {t('timeLeftLabel')} {distractorRemaining}{t('secShort')}
              </Text>
              <Text style={[styles.statText, { color: '#22c55e' }]}>{t('hud_correct')} {distractorScore}</Text>
            </View>
          ) : undefined
        }
        toolbar={
          isDistractor ? (
            <>
              <TouchableOpacity
                accessibilityRole="button" style={[styles.addBtn, { backgroundColor: GRADIENT[0] }]} onPress={submitDistractor}>
                <Text style={styles.addBtnText}>OK</Text>
              </TouchableOpacity>
              {/* Skip-to-recall button — для тех кто уверен что готов */}
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.addBtn, { backgroundColor: '#22c55e', flexDirection: 'row', gap: 6 }]}
                onPress={skipDistractor}
              >
                <Ionicons name="checkmark" size={20} color={textOn('#22c55e')} />
                <Text style={[styles.addBtnText, { color: textOn('#22c55e') }]}>ГОТОВ К ПЕРЕСКАЗУ</Text>
              </TouchableOpacity>
            </>
          ) : isRecall ? (
            <TouchableOpacity
              accessibilityRole="button" style={[styles.startBtn, styles.recallSubmit]} onPress={which === 1 ? submitRecall1 : submitRecall2}>
              <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText}>{t('storyDone')}</Text>
              </GradientSurface>
            </TouchableOpacity>
          ) : undefined
        }
      >
        {phase === 'reading' && (
          <View style={styles.fieldCol}>
            <View style={[styles.storyBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.storyText, { color: colors.text }]}>
                {language === 'ru' ? story.ru : story.en}
              </Text>
            </View>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('storyReadHint')}</Text>
          </View>
        )}
        {isDistractor && (
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('storyDistractorHint')}</Text>
            <View style={[styles.mathBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.mathText, { color: colors.text }]}>{distractorMath.a} {distractorMath.op} {distractorMath.b} = ?</Text>
            </View>
            <TextInput
              style={[styles.numInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={distractorInput}
              onChangeText={setDistractorInput}
              onSubmitEditing={submitDistractor}
              autoFocus
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>
        )}
        {isRecall && (
          <View style={styles.fieldCol}>
            <Text style={[styles.recallTitle, { color: colors.text }]}>
              {which === 1 ? t('storyImmediate') : t('storyDelayed')}
            </Text>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('storyRecallHint')}</Text>
            <TextInput
              style={[styles.recallInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={which === 1 ? recall1Text : recall2Text}
              onChangeText={which === 1 ? setRecall1Text : setRecall2Text}
              multiline
              autoFocus
              autoCorrect={false}
              textAlignVertical="top"
              placeholder={t('storyRecallPlaceholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        )}
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('story')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {/* Итог — общим экраном «уровень пройден»: только он пишет звёзды по уровням,
          считает серию чистых и тикает глаз-разрядку. Раньше пересказ шёл мимо него,
          и узлы на его тропинке оставались пустыми.

          Звёзды здесь НАСТОЯЩИЕ: доля деталей, переживших помеху. Отложенный
          пересказ — то, ради чего упражнение и делается, поэтому считаем по нему. */}
      {phase === 'result' && (() => {
        const total = storyKeys(language === 'ru' ? story.keywords_ru : story.keywords_en).length;
        const kept = total > 0 ? recall2Hits / total : 0;
        const stars = kept >= 0.7 ? 3 : kept >= 0.4 ? 2 : 1;
        return (
          <LevelCleared
            gameId="story_recall"
            level={lvl.level > 1 ? lvl.level - 1 : 1}
            stars={stars}
            gradient={GRADIENT}
            language={language}
            colors={colors}
            onContinue={() => setPhase('config')}
            onStop={() => goBackOrHome()}
            stopKind="exit"   // onStop уводит С ЭКРАНА игры (goBackOrHome), а не к настройкам → подпись «На главную»
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0 },  // крупный шрифт: заголовок ужимается между «назад» и спейсером, не толкает их
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '700' },
  infoText: { fontSize: 13, lineHeight: 19 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  // игровое поле внутри каркаса: колонка на всю ширину, содержимое центрировано
  fieldCol: { width: '100%', maxWidth: 540, alignSelf: 'center', alignItems: 'center', gap: 18 },
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center' },  // крупный шрифт: статы переносятся, а не уезжают за край
  statText: { fontSize: 14, fontWeight: '700' },
  storyBox: { padding: 18, borderRadius: 14, maxHeight: 360 },
  storyText: { fontSize: 17, lineHeight: 26 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  mathBox: { padding: 24, borderRadius: 12, marginTop: 4 },
  // RTL-пин: «a − b = ?» в RTL-bidi перестраивается — математика всегда LTR
  mathText: { fontSize: 36, fontWeight: '900', writingDirection: 'ltr' },
  numInput: { width: 140, height: 56, paddingHorizontal: 14, fontSize: 24, borderRadius: 10, borderWidth: 1, fontWeight: '700', textAlign: 'center' },
  addBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 16 },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  recallInput: { width: '100%', minHeight: 200, padding: 14, fontSize: 15, borderRadius: 12, borderWidth: 1, lineHeight: 22 },
  // кнопка «Готово» в тулбаре — тянется по ряду до ширины поля ввода
  recallSubmit: { flexGrow: 1, maxWidth: 460 },
});
