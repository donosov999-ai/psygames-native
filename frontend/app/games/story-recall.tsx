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
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#654ea3', '#eaafc8'];
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

const STORIES: Story[] = [
  {
    ru: 'Анна Морозова работает в больнице на улице Ленина. Вчера вечером она вышла с работы в 8 часов и пошла домой пешком. По дороге она встретила старого друга Михаила, который рассказал, что выиграл 500 тысяч рублей в лотерею. Они вместе зашли в кафе на углу и заказали пиццу. Михаил пообещал купить Анне новый велосипед в подарок.',
    en: 'Anna Morozova works at the hospital on Lenin Street. Yesterday evening she left work at 8 oclock and walked home. On the way she met an old friend Mikhail, who told her he won 500 thousand rubles in the lottery. They went together to the cafe on the corner and ordered a pizza. Mikhail promised to buy Anna a new bicycle as a gift.',
    keywords_ru: ['Анна','Морозова','больница','Ленина','вечером','8','часов','пешком','Михаил','выиграл','500','тысяч','лотерею','кафе','углу','пиццу','велосипед','подарок'],
    keywords_en: ['Anna','Morozova','hospital','Lenin','evening','8','oclock','walked','Mikhail','won','500','thousand','lottery','cafe','corner','pizza','bicycle','gift'],
    read_seconds: 30,
  },
  {
    ru: 'Виктор Иванович — инженер на заводе в Екатеринбурге. У него три собаки: овчарка Рекс, такса Мухтар и дворняжка Жучка. В субботу он повёз семью на дачу. По дороге сломалась машина возле деревни Берёзовка. Через два часа их забрал сосед на грузовике. Виктор заплатил за ремонт 15 тысяч рублей.',
    en: 'Viktor Ivanovich is an engineer at a factory in Yekaterinburg. He has three dogs: a shepherd named Rex, a dachshund named Mukhtar, and a mutt named Zhuchka. On Saturday he took his family to the dacha. The car broke down on the way near the village of Beryozovka. Two hours later their neighbor picked them up in a truck. Viktor paid 15 thousand rubles for the repair.',
    keywords_ru: ['Виктор','Иванович','инженер','заводе','Екатеринбурге','три','собаки','овчарка','Рекс','такса','Мухтар','дворняжка','Жучка','субботу','дачу','Берёзовка','два','часа','сосед','грузовике','15','тысяч'],
    keywords_en: ['Viktor','Ivanovich','engineer','factory','Yekaterinburg','three','dogs','shepherd','Rex','dachshund','Mukhtar','mutt','Zhuchka','Saturday','dacha','Beryozovka','two','hours','neighbor','truck','15','thousand'],
    read_seconds: 35,
  },
  {
    ru: 'Елена Соколова — учитель математики в школе номер 42. У неё два сына: Артём 12 лет и Даниил 9 лет. В понедельник утром старший сын потерял ключи от квартиры в школьной раздевалке. Елена заплатила слесарю 3500 рублей за новый замок. Вечером семья ужинала в ресторане «Парус» на набережной.',
    en: 'Elena Sokolova is a math teacher at school number 42. She has two sons: Artyom age 12 and Daniil age 9. On Monday morning the older son lost the apartment keys in the school locker room. Elena paid a locksmith 3500 rubles for a new lock. In the evening the family had dinner at the Parus restaurant on the embankment.',
    keywords_ru: ['Елена','Соколова','учитель','математики','школе','42','два','сына','Артём','12','Даниил','9','понедельник','утром','ключи','раздевалке','3500','замок','ресторане','Парус','набережной'],
    keywords_en: ['Elena','Sokolova','teacher','math','school','42','two','sons','Artyom','12','Daniil','9','Monday','morning','keys','locker','3500','lock','restaurant','Parus','embankment'],
    read_seconds: 35,
  },
  {
    ru: 'Сергей Кузнецов — директор автосалона «БМВ» в Новосибирске. В четверг к нему пришёл клиент — Михаил Петров — и купил машину за 4 миллиона рублей наличными. Через неделю Сергей улетел в Турцию на отдых с семьёй из четырёх человек. Они остановились в отеле «Ривьера» на 10 дней.',
    en: 'Sergey Kuznetsov is the director of the BMW dealership in Novosibirsk. On Thursday a client Mikhail Petrov came and bought a car for 4 million rubles in cash. A week later Sergey flew to Turkey on vacation with a family of four. They stayed at Riviera hotel for 10 days.',
    keywords_ru: ['Сергей','Кузнецов','директор','автосалона','БМВ','Новосибирске','четверг','Михаил','Петров','4','миллиона','наличными','неделю','Турцию','четырёх','Ривьера','10','дней'],
    keywords_en: ['Sergey','Kuznetsov','director','dealership','BMW','Novosibirsk','Thursday','Mikhail','Petrov','4','million','cash','week','Turkey','four','Riviera','10','days'],
    read_seconds: 30,
  },
  {
    ru: 'Татьяна Лебедева — врач-стоматолог в клинике «Жемчуг» на Невском проспекте 78. В пятницу к ней пришёл пациент с острой зубной болью. Операция длилась 45 минут и стоила 8500 рублей. После работы Татьяна забрала дочь Машу из детского сада «Радуга» и купила ей мороженое.',
    en: 'Tatyana Lebedeva is a dentist at the Pearl clinic at 78 Nevsky Prospect. On Friday a patient came with acute toothache. The surgery lasted 45 minutes and cost 8500 rubles. After work Tatyana picked up her daughter Masha from kindergarten Rainbow and bought her an ice cream.',
    keywords_ru: ['Татьяна','Лебедева','стоматолог','Жемчуг','Невском','78','пятницу','пациент','зубной','45','минут','8500','дочь','Машу','садa','Радуга','мороженое'],
    keywords_en: ['Tatyana','Lebedeva','dentist','Pearl','Nevsky','78','Friday','patient','toothache','45','minutes','8500','daughter','Masha','kindergarten','Rainbow','ice','cream'],
    read_seconds: 32,
  },
  {
    ru: 'Андрей Орлов — фермер в Краснодарском крае. У него 200 гектаров земли, на которых он выращивает пшеницу и подсолнечник. В августе он продал урожай за 12 миллионов рублей. На вырученные деньги купил два новых комбайна марки «Ростсельмаш». Жена Светлана взяла 3 миллиона на ремонт дома.',
    en: 'Andrey Orlov is a farmer in the Krasnodar region. He has 200 hectares of land where he grows wheat and sunflower. In August he sold the harvest for 12 million rubles. With the money he bought two new combines of Rostselmash brand. His wife Svetlana took 3 million for the house renovation.',
    keywords_ru: ['Андрей','Орлов','фермер','Краснодарском','200','гектаров','пшеницу','подсолнечник','августе','12','миллионов','два','комбайна','Ростсельмаш','Светлана','3','миллиона','ремонт'],
    keywords_en: ['Andrey','Orlov','farmer','Krasnodar','200','hectares','wheat','sunflower','August','12','million','two','combines','Rostselmash','Svetlana','3','million','renovation'],
    read_seconds: 32,
  },
  {
    ru: 'Ольга Семёнова — журналист газеты «Вечерняя Москва». Во вторник она брала интервью у министра транспорта о новой ветке метро. Интервью длилось 90 минут в офисе на Тверской 17. После Ольга поехала в редакцию написать статью на 5 страниц до дедлайна в 18:00.',
    en: 'Olga Semyonova is a journalist for Vecherniaya Moskva newspaper. On Tuesday she interviewed the transport minister about the new metro line. The interview lasted 90 minutes at the office at 17 Tverskaya Street. Then Olga went to the editorial office to write a 5-page article before the 18:00 deadline.',
    keywords_ru: ['Ольга','Семёнова','журналист','Вечерняя','Москва','вторник','министра','транспорта','метро','90','минут','Тверской','17','5','страниц','18'],
    keywords_en: ['Olga','Semyonova','journalist','Vecherniaya','Moskva','Tuesday','minister','transport','metro','90','minutes','Tverskaya','17','5','pages','18'],
    read_seconds: 32,
  },
  {
    ru: 'Дмитрий Волков — программист в компании «Яндекс». Он живёт в квартире на улице Профсоюзная 105 с женой Анастасией и кошкой по кличке Барсик. В выходные они поехали на велосипедах в парк «Сокольники». Прокатились 25 километров и пообедали в кафе «Шоколадница» за 1800 рублей.',
    en: 'Dmitry Volkov is a programmer at Yandex. He lives in an apartment at 105 Profsoyuznaya Street with his wife Anastasia and a cat named Barsik. On the weekend they went biking in Sokolniki park. They rode 25 kilometers and had lunch at Shokoladnitsa cafe for 1800 rubles.',
    keywords_ru: ['Дмитрий','Волков','программист','Яндекс','Профсоюзная','105','Анастасией','Барсик','велосипедах','Сокольники','25','километров','Шоколадница','1800'],
    keywords_en: ['Dmitry','Volkov','programmer','Yandex','Profsoyuznaya','105','Anastasia','Barsik','biking','Sokolniki','25','kilometers','Shokoladnitsa','1800'],
    read_seconds: 30,
  },
  {
    ru: 'Наталья Морозова — владелица цветочного магазина «Лилия» на Арбате. В среду она получила заказ на свадьбу — 50 букетов роз и 30 бутоньерок. Заказ стоил 75 тысяч рублей. Доставку организовали на трёх микроавтобусах в субботу в 11 утра. Свадьба была в ресторане «Кремль».',
    en: 'Natalia Morozova owns the Lily flower shop on Arbat. On Wednesday she received a wedding order — 50 rose bouquets and 30 boutonnieres. The order cost 75 thousand rubles. Delivery was arranged in three minibuses on Saturday at 11 am. The wedding was at the Kremlin restaurant.',
    keywords_ru: ['Наталья','Морозова','цветочного','Лилия','Арбате','среду','свадьбу','50','букетов','30','75','тысяч','трёх','микроавтобусах','субботу','11','Кремль'],
    keywords_en: ['Natalia','Morozova','flower','Lily','Arbat','Wednesday','wedding','50','bouquets','30','75','thousand','three','minibuses','Saturday','11','Kremlin'],
    read_seconds: 32,
  },
  {
    ru: 'Игорь Соколов — пилот авиакомпании «Аэрофлот». В прошлую пятницу он летел рейсом Москва-Владивосток. На борту было 234 пассажира и 9 членов экипажа. Полёт длился 9 часов 15 минут. После приземления Игорь остановился в гостинице «Версаль» на улице Светланской 22.',
    en: 'Igor Sokolov is a pilot for Aeroflot airline. Last Friday he flew the Moscow-Vladivostok route. There were 234 passengers and 9 crew members on board. The flight lasted 9 hours 15 minutes. After landing Igor stayed at the Versailles hotel at 22 Svetlanskaya Street.',
    keywords_ru: ['Игорь','Соколов','пилот','Аэрофлот','пятницу','Москва','Владивосток','234','пассажира','9','экипажа','9','часов','15','минут','Версаль','Светланской','22'],
    keywords_en: ['Igor','Sokolov','pilot','Aeroflot','Friday','Moscow','Vladivostok','234','passengers','9','crew','9','hours','15','minutes','Versailles','Svetlanskaya','22'],
    read_seconds: 35,
  },
  {
    ru: 'Марина Зайцева — преподаватель йоги в студии «Лотос» на проспекте Мира 88. У неё 4 группы по 12 человек каждая. Абонемент стоит 6500 рублей в месяц. В прошлый вторник она провела мастер-класс по медитации для 30 участников. Заработала 25 тысяч за один день.',
    en: 'Marina Zaitseva teaches yoga at the Lotus studio at 88 Mira Avenue. She has 4 groups of 12 people each. A subscription costs 6500 rubles per month. Last Tuesday she ran a meditation masterclass for 30 participants. She earned 25 thousand in one day.',
    keywords_ru: ['Марина','Зайцева','йоги','Лотос','Мира','88','4','группы','12','6500','месяц','вторник','медитации','30','25','тысяч'],
    keywords_en: ['Marina','Zaitseva','yoga','Lotus','Mira','88','4','groups','12','6500','month','Tuesday','meditation','30','25','thousand'],
    read_seconds: 30,
  },
  {
    ru: 'Павел Григорьев — владелец сети из 8 кафе быстрого питания «Бургер Хаус» в Самаре. На него работают 145 человек. Месячный оборот — 14 миллионов рублей. В апреле он открыл новую точку в торговом центре «Космопорт» с инвестицией 5 миллионов. Окупаемость планируется за 18 месяцев.',
    en: 'Pavel Grigoriev owns a network of 8 Burger House fast food cafes in Samara. He employs 145 people. Monthly turnover is 14 million rubles. In April he opened a new location at Cosmoport mall with a 5 million investment. Payback expected in 18 months.',
    keywords_ru: ['Павел','Григорьев','8','кафе','Бургер','Хаус','Самаре','145','14','миллионов','апреле','Космопорт','5','миллионов','18','месяцев'],
    keywords_en: ['Pavel','Grigoriev','8','cafes','Burger','House','Samara','145','14','million','April','Cosmoport','5','million','18','months'],
    read_seconds: 32,
  },
  {
    ru: 'Светлана Егорова — медсестра в кардиологическом отделении больницы №7. В её смене 18 пациентов. В четверг привезли 2 новых после инфаркта. Один из них — мужчина 56 лет по имени Алексей. Светлана дежурит 3 раза в неделю по 12 часов и получает 65 тысяч рублей в месяц.',
    en: 'Svetlana Egorova is a nurse in the cardiology department of hospital number 7. Her shift has 18 patients. On Thursday they brought 2 new ones after heart attacks. One of them is a 56-year-old man named Alexey. Svetlana works 3 times a week for 12 hours and earns 65 thousand rubles a month.',
    keywords_ru: ['Светлана','Егорова','медсестра','кардиологическом','7','18','пациентов','четверг','2','инфаркта','56','Алексей','3','12','часов','65','тысяч'],
    keywords_en: ['Svetlana','Egorova','nurse','cardiology','7','18','patients','Thursday','2','heart','attacks','56','Alexey','3','12','hours','65','thousand'],
    read_seconds: 35,
  },
  {
    ru: 'Александр Никитин — таксист в Казани. Работает 5 дней в неделю на машине Toyota Camry, которую купил в кредит за 2 миллиона. В среду вечером он отвёз клиента из аэропорта в гостиницу «Кремлёвская» за 850 рублей. Клиент дал 200 рублей чаевых. За день Александр заработал 4500.',
    en: 'Alexander Nikitin is a taxi driver in Kazan. He works 5 days a week in a Toyota Camry he bought on credit for 2 million. On Wednesday evening he drove a client from the airport to the Kremlevskaya hotel for 850 rubles. The client tipped 200 rubles. For the day Alexander earned 4500.',
    keywords_ru: ['Александр','Никитин','таксист','Казани','5','Toyota','Camry','2','миллиона','среду','аэропорта','Кремлёвская','850','200','чаевых','4500'],
    keywords_en: ['Alexander','Nikitin','taxi','Kazan','5','Toyota','Camry','2','million','Wednesday','airport','Kremlevskaya','850','200','tip','4500'],
    read_seconds: 32,
  },
  {
    ru: 'Ирина Беляева — детский психолог в центре «Радость» на улице Гагарина 14. В понедельник у неё было 6 консультаций по 50 минут каждая. Стоимость одной сессии — 4000 рублей. Самый сложный случай — мальчик Степан 8 лет с тревожным расстройством. Курс терапии займёт 12 встреч.',
    en: 'Irina Belyaeva is a child psychologist at the Joy center at 14 Gagarin Street. On Monday she had 6 consultations of 50 minutes each. One session costs 4000 rubles. The hardest case is an 8-year-old boy Stepan with anxiety disorder. The therapy course will take 12 sessions.',
    keywords_ru: ['Ирина','Беляева','психолог','Радость','Гагарина','14','понедельник','6','50','минут','4000','Степан','8','тревожным','12','встреч'],
    keywords_en: ['Irina','Belyaeva','psychologist','Joy','Gagarin','14','Monday','6','50','minutes','4000','Stepan','8','anxiety','12','sessions'],
    read_seconds: 32,
  },
  {
    ru: 'Денис Островский — тренер по плаванию в спорткомплексе «Дельфин». У него три группы детей: младшая — 15 учеников 6-7 лет, средняя — 12 учеников 8-10 лет, старшая — 10 спортсменов 11-14 лет. В прошлом месяце старшая группа выиграла региональные соревнования и получила 3 золотые медали.',
    en: 'Denis Ostrovsky is a swimming coach at the Dolphin sports complex. He has three groups of children: junior — 15 students 6-7 years old, middle — 12 students 8-10 years old, senior — 10 athletes 11-14 years old. Last month the senior group won the regional competition and got 3 gold medals.',
    keywords_ru: ['Денис','Островский','тренер','плаванию','Дельфин','три','группы','15','6','7','12','8','10','10','11','14','3','золотые','медали'],
    keywords_en: ['Denis','Ostrovsky','coach','swimming','Dolphin','three','groups','15','6','7','12','8','10','10','11','14','3','gold','medals'],
    read_seconds: 35,
  },
];

type GamePhase = 'intro' | 'config' | 'reading' | 'distractor1' | 'recall1' | 'distractor2' | 'recall2' | 'result';

const DISTRACTOR1_SEC = 30;   // short delay before immediate recall
const DISTRACTOR2_SEC = 90;   // longer delay before delayed recall

export default function StoryRecallGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
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

  // Match a recall text against keywords using stem-match (4-char prefix)
  const countMatches = (text: string, keywords: string[]): number => {
    const words = text.toLowerCase().split(/[\s,;.!?]+/).filter(Boolean);
    const matched = new Set<string>();
    for (const kw of keywords) {
      const stem = kw.toLowerCase().slice(0, Math.max(4, Math.min(kw.length, 5)));
      for (const w of words) {
        if (w.startsWith(stem)) {
          matched.add(kw.toLowerCase());
          break;
        }
      }
    }
    return matched.size;
  };

  const startGame = () => {
    const s = STORIES[Math.floor(Math.random() * STORIES.length)];
    setStory(s);
    setRecall1Text(''); setRecall2Text('');
    setRecall1Hits(0); setRecall2Hits(0);
    setDistractorScore(0);
    setReadRemaining(s.read_seconds);
    setPhase('reading');
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const left = s.read_seconds - Math.floor((Date.now() - startTimeRef.current) / 1000);
      setReadRemaining(Math.max(0, left));
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        startDistractor1();
      }
    }, 200);
  };

  const startDistractor1 = () => {
    setPhase('distractor1');
    setDistractorRemaining(DISTRACTOR1_SEC);
    nextDistractorTrial();
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const left = DISTRACTOR1_SEC - Math.floor((Date.now() - startTimeRef.current) / 1000);
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
    setDistractorRemaining(DISTRACTOR2_SEC);
    nextDistractorTrial();
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const left = DISTRACTOR2_SEC - Math.floor((Date.now() - startTimeRef.current) / 1000);
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
    const total = kws.length;
    const immediatePct = total > 0 ? (recall1Hits / total) : 0;
    const delayedPct = total > 0 ? (hits / total) : 0;
    const retention = immediatePct > 0 ? delayedPct / immediatePct : 0;
    try {
      await saveSession({
        game_type: 'story_recall',
        score: Math.round((recall1Hits + hits) * 50),
        time_seconds: 0,
        difficulty: 'medium',
        mode: 'standard',
        errors: total - hits,
        details: {
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
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="book" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('story')}</Text>
        <Text style={styles.configDesc}>{t('storyDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('storyInfo')}</Text>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {t('storyInfoBody')}
        </Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderReading = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: GRADIENT[0], fontSize: 20 }]}>{t('storyReadPhase')} · {readRemaining}s</Text>
      </View>
      <View style={[styles.storyBox, { backgroundColor: colors.surface }]}>
        <Text style={[styles.storyText, { color: colors.text }]}>
          {language === 'ru' ? story.ru : story.en}
        </Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('storyReadHint')}</Text>
    </View>
  );

  // Skip distractor → перейти сразу к recall (если юзер чувствует что готов)
  const skipDistractor = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (phase === 'distractor1') setPhase('recall1');
    else if (phase === 'distractor2') setPhase('recall2');
  };

  const renderDistractor = (phaseLabel: string) => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: GRADIENT[0] }]}>{phaseLabel} · {distractorRemaining}s</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{distractorScore}</Text>
      </View>
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
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: GRADIENT[0] }]} onPress={submitDistractor}>
          <Text style={styles.addBtnText}>OK</Text>
        </TouchableOpacity>
        {/* Skip-to-recall button — для тех кто уверен что готов */}
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#22c55e', flexDirection: 'row', gap: 6 }]}
          onPress={skipDistractor}
        >
          <Ionicons name="checkmark" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>ГОТОВ К ПЕРЕСКАЗУ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRecall = (which: 1 | 2) => (
    <View style={styles.playArea}>
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
      <TouchableOpacity style={styles.startBtn} onPress={which === 1 ? submitRecall1 : submitRecall2}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('storyDone')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('story')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="story" icon="book" gradient={GRADIENT as [string, string]}
          skillKey="skillMemory" descriptionKey="storyIntroDesc"
          benefits={STORY_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'reading' && renderReading()}
      {phase === 'distractor1' && renderDistractor(t('storyDistractor1'))}
      {phase === 'recall1' && renderRecall(1)}
      {phase === 'distractor2' && renderDistractor(t('storyDistractor2'))}
      {phase === 'recall2' && renderRecall(2)}
      {phase === 'result' && (
        <GameResult
          score={(recall1Hits + recall2Hits) * 50}
          time={undefined} errors={(language === 'ru' ? story.keywords_ru.length : story.keywords_en.length) - recall2Hits}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '700' },
  infoText: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 16, gap: 18, alignItems: 'center', maxWidth: 540, alignSelf: 'center', width: '100%' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  storyBox: { padding: 18, borderRadius: 14, maxHeight: 360 },
  storyText: { fontSize: 17, lineHeight: 26 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  mathBox: { padding: 24, borderRadius: 12, marginTop: 4 },
  mathText: { fontSize: 36, fontWeight: '900' },
  numInput: { width: 140, height: 56, paddingHorizontal: 14, fontSize: 24, borderRadius: 10, borderWidth: 1, fontWeight: '700', textAlign: 'center' },
  addBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  recallInput: { width: '100%', minHeight: 200, padding: 14, fontSize: 15, borderRadius: 12, borderWidth: 1, lineHeight: 22 },
});
