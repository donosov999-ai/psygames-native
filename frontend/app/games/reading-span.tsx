/* psygames-game-reading-span · VER 2 · 23.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView
} from 'react-native';
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { pickFresh } from '@/src/services/freshPool';

const GRADIENT = ['#1f4037', '#99f2c8'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.32 (норма AA 4.5), стало 4.55.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #d6fae9 @0.32 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const RS_BENEFITS = [
  { icon: 'book-outline', textKey: 'benefitRs1' },
  { icon: 'library-outline', textKey: 'benefitRs2' },
  { icon: 'sync-outline', textKey: 'benefitRs3' },
];

interface SentenceItem { ru: string; en: string; ok: boolean; lastRu: string; lastEn: string; }

// Each sentence has a sensibility judgment (true = makes sense). Last word is what subject must recall.
const SENTENCES: SentenceItem[] = [
  { ru: 'Кошка пьёт молоко из миски.',           en: 'The cat drinks milk from the bowl.',     ok: true,  lastRu: 'миски',     lastEn: 'bowl' },
  { ru: 'Солнце светит ночью на крыше.',          en: 'The sun shines at night on the roof.',   ok: false, lastRu: 'крыше',     lastEn: 'roof' },
  { ru: 'Дети играют в парке возле дома.',        en: 'Children play in the park near home.',   ok: true,  lastRu: 'дома',      lastEn: 'home' },
  { ru: 'Рыба летает над высоким облаком.',       en: 'A fish flies above the tall cloud.',     ok: false, lastRu: 'облаком',   lastEn: 'cloud' },
  { ru: 'Учитель пишет мелом на доске.',          en: 'The teacher writes with chalk on the board.', ok: true, lastRu: 'доске', lastEn: 'board' },
  { ru: 'Машина едет по морскому дну.',           en: 'A car drives along the sea floor.',       ok: false, lastRu: 'дну',       lastEn: 'floor' },
  { ru: 'Птица вьёт гнездо на дереве.',           en: 'A bird builds a nest on the tree.',       ok: true,  lastRu: 'дереве',    lastEn: 'tree' },
  { ru: 'Снег горячий и пахнет хлебом.',          en: 'Snow is hot and smells like bread.',      ok: false, lastRu: 'хлебом',    lastEn: 'bread' },
  { ru: 'Доктор лечит больного в клинике.',       en: 'The doctor treats the patient in the clinic.', ok: true, lastRu: 'клинике', lastEn: 'clinic' },
  { ru: 'Окно громко поёт в саду.',               en: 'The window sings loudly in the garden.',  ok: false, lastRu: 'саду',      lastEn: 'garden' },
  { ru: 'Поезд приходит на станцию вовремя.',      en: 'The train arrives at the station on time.', ok: true, lastRu: 'вовремя', lastEn: 'time' },
  { ru: 'Лед растёт на жарком солнце.',            en: 'Ice grows under the hot sun.',           ok: false, lastRu: 'солнце',    lastEn: 'sun' },
  { ru: 'Студент готовится к экзамену в библиотеке.', en: 'The student studies for the exam in the library.', ok: true, lastRu: 'библиотеке', lastEn: 'library' },
  { ru: 'Бабушка вяжет шарф из железа.',           en: 'Grandma knits a scarf out of iron.',     ok: false, lastRu: 'железа',    lastEn: 'iron' },
  { ru: 'Художник рисует картину красками.',       en: 'The artist paints a picture with paints.', ok: true, lastRu: 'красками', lastEn: 'paints' },
  { ru: 'Слон помещается в маленькой коробке.',    en: 'The elephant fits in a small box.',      ok: false, lastRu: 'коробке',   lastEn: 'box' },
  { ru: 'Бегун финиширует первым на стадионе.',    en: 'The runner finishes first at the stadium.', ok: true, lastRu: 'стадионе', lastEn: 'stadium' },
  { ru: 'Гора плавает в стакане воды.',            en: 'A mountain floats in a glass of water.', ok: false, lastRu: 'воды',      lastEn: 'water' },
  { ru: 'Мама готовит ужин на кухне.',             en: 'Mom cooks dinner in the kitchen.',       ok: true,  lastRu: 'кухне',     lastEn: 'kitchen' },
  { ru: 'Карандаш выпил весь кофе утром.',         en: 'The pencil drank all the coffee in the morning.', ok: false, lastRu: 'утром', lastEn: 'morning' },
  { ru: 'Корабль плывёт по широкой реке.',         en: 'The ship sails along the wide river.',   ok: true,  lastRu: 'реке',      lastEn: 'river' },
  { ru: 'Самолёт растёт в огороде у бабушки.',     en: 'A plane grows in grandma garden.',       ok: false, lastRu: 'бабушки',   lastEn: 'garden' },
  // expanded set (round 2)
  { ru: 'Пчёлы делают мёд в улье.',                 en: 'Bees make honey in the hive.',           ok: true,  lastRu: 'улье',      lastEn: 'hive' },
  { ru: 'Книга читает мальчика на диване.',          en: 'The book reads the boy on the sofa.',    ok: false, lastRu: 'диване',    lastEn: 'sofa' },
  { ru: 'Спортсмен бежит по беговой дорожке.',       en: 'The athlete runs on the treadmill.',     ok: true,  lastRu: 'дорожке',   lastEn: 'treadmill' },
  { ru: 'Камень плавает по поверхности озера.',      en: 'The stone floats on the lake surface.',  ok: false, lastRu: 'озера',     lastEn: 'lake' },
  { ru: 'Снежинки падают зимой с неба.',             en: 'Snowflakes fall from the sky in winter.', ok: true, lastRu: 'неба',     lastEn: 'sky' },
  { ru: 'Дерево ходит по тропинке за грибами.',      en: 'The tree walks on the path for mushrooms.', ok: false, lastRu: 'грибами', lastEn: 'mushrooms' },
  { ru: 'Стоматолог лечит зуб пациенту.',            en: 'The dentist treats the patient tooth.',  ok: true,  lastRu: 'пациенту',  lastEn: 'tooth' },
  { ru: 'Лампочка горит без электричества всегда.',  en: 'A bulb glows without electricity always.', ok: false, lastRu: 'всегда', lastEn: 'always' },
  { ru: 'Мост соединяет два берега реки.',           en: 'The bridge connects two riverbanks.',    ok: true,  lastRu: 'реки',      lastEn: 'riverbanks' },
  { ru: 'Чай заваривают в холодильнике быстро.',     en: 'Tea is brewed in the refrigerator quickly.', ok: false, lastRu: 'быстро', lastEn: 'quickly' },
  { ru: 'Альпинист поднимается на высокую гору.',    en: 'The climber ascends a high mountain.',   ok: true,  lastRu: 'гору',      lastEn: 'mountain' },
  { ru: 'Кофеварка стирает грязные носки.',          en: 'The coffee maker washes dirty socks.',    ok: false, lastRu: 'носки',     lastEn: 'socks' },
  { ru: 'Программист пишет код на компьютере.',      en: 'The programmer writes code on the computer.', ok: true, lastRu: 'компьютере', lastEn: 'computer' },
  { ru: 'Часы тикают тихо ночью молоком.',           en: 'The clock ticks quietly at night with milk.', ok: false, lastRu: 'молоком', lastEn: 'milk' },
  { ru: 'Парикмахер стрижёт клиента в салоне.',      en: 'The barber cuts the client in the salon.', ok: true, lastRu: 'салоне',   lastEn: 'salon' },
  { ru: 'Тигр играет на скрипке концерт.',           en: 'The tiger plays a concert on the violin.', ok: false, lastRu: 'концерт',  lastEn: 'concert' },
  { ru: 'Семья празднует день рождения дома.',       en: 'The family celebrates a birthday at home.', ok: true, lastRu: 'дома',     lastEn: 'home' },
  { ru: 'Земля квадратная и зелёная всегда.',         en: 'The Earth is square and green always.',  ok: false, lastRu: 'всегда',    lastEn: 'always' },
  { ru: 'Турист идёт пешком по горной тропе.',        en: 'The tourist walks on the mountain trail.', ok: true, lastRu: 'тропе',   lastEn: 'trail' },
  { ru: 'Ручка пишет шерстью на снегу.',              en: 'The pen writes with wool on snow.',     ok: false, lastRu: 'снегу',     lastEn: 'snow' },
  { ru: 'Электрик чинит проводку в подъезде.',        en: 'The electrician fixes wiring in the entrance.', ok: true, lastRu: 'подъезде', lastEn: 'entrance' },
  { ru: 'Самовар плачет солёными слезами громко.',    en: 'The samovar cries salty tears loudly.', ok: false, lastRu: 'громко',   lastEn: 'loudly' },
  { ru: 'Музыкант играет на гитаре в концерте.',      en: 'The musician plays guitar at the concert.', ok: true, lastRu: 'концерте', lastEn: 'concert' },
  { ru: 'Грибы растут на крыше многоэтажного дома.',  en: 'Mushrooms grow on the roof of a tall building.', ok: false, lastRu: 'дома', lastEn: 'building' },
  { ru: 'Бабушка печёт пирог на праздник внукам.',    en: 'Grandma bakes a pie for the grandchildren.', ok: true, lastRu: 'внукам', lastEn: 'grandchildren' },
  { ru: 'Дождь падает только в среду по понедельникам.', en: 'Rain falls only on Wednesday on Mondays.', ok: false, lastRu: 'понедельникам', lastEn: 'Mondays' },
  { ru: 'Солдат маршируют по плацу под музыку.',     en: 'Soldiers march on the parade ground to music.', ok: true, lastRu: 'музыку', lastEn: 'music' },
  { ru: 'Бутерброд читает газету в транспорте.',     en: 'The sandwich reads the newspaper on transport.', ok: false, lastRu: 'транспорте', lastEn: 'transport' },
  { ru: 'Маяк светит кораблям в темноте моря.',       en: 'The lighthouse shines for ships in dark sea.', ok: true, lastRu: 'моря',  lastEn: 'sea' },
  { ru: 'Бухгалтер танцует балет на кухне утром.',    en: 'The accountant dances ballet in the kitchen morning.', ok: false, lastRu: 'утром', lastEn: 'morning' },
  { ru: 'Пожарный тушит огонь из шланга водой.',     en: 'The fireman extinguishes fire with hose water.', ok: true, lastRu: 'водой', lastEn: 'water' },
  { ru: 'Молоток шьёт платье цветными нитками.',     en: 'The hammer sews a dress with colored threads.', ok: false, lastRu: 'нитками', lastEn: 'threads' },
  { ru: 'Лётчик пилотирует самолёт над облаками.',    en: 'The pilot flies the plane above the clouds.', ok: true, lastRu: 'облаками', lastEn: 'clouds' },
  { ru: 'Подушка варит суп на горячей плите.',       en: 'The pillow cooks soup on a hot stove.', ok: false, lastRu: 'плите',    lastEn: 'stove' },
  { ru: 'Дворник убирает листья граблями осенью.',    en: 'The janitor sweeps leaves with a rake in autumn.', ok: true, lastRu: 'осенью', lastEn: 'autumn' },
  { ru: 'Холодильник летает в космос за продуктами.', en: 'The refrigerator flies to space for groceries.', ok: false, lastRu: 'продуктами', lastEn: 'groceries' },
  { ru: 'Скрипач выступает на сцене с оркестром.',   en: 'The violinist performs on stage with the orchestra.', ok: true, lastRu: 'оркестром', lastEn: 'orchestra' },
  { ru: 'Ножницы пьют чай из круглой чашки.',         en: 'Scissors drink tea from a round cup.',  ok: false, lastRu: 'чашки',   lastEn: 'cup' },
  { ru: 'Учёный делает открытие в лаборатории.',     en: 'The scientist makes a discovery in the laboratory.', ok: true, lastRu: 'лаборатории', lastEn: 'laboratory' },
  { ru: 'Кирпич плавает в воздухе над городом.',      en: 'A brick floats in the air above the city.', ok: false, lastRu: 'городом', lastEn: 'city' },
];

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
const READINGSPAN_RULES: LevelRule[] = [
  { key: 'load', fromLevel: 5 },   // lr_reading_span_load_*
];

type GamePhase = 'intro' | 'config' | 'playing' | 'recall' | 'cleared' | 'result';


export default function ReadingSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const { profile } = useProfile();
  const lvl = usePersistentLevel('reading_span');   // персист-уровень = setSize − 2
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  const levelRules = useLevelRules('reading_span', lvl.level, READINGSPAN_RULES, phase === 'recall');
  const [clearedPassed, setClearedPassed] = useState(true);
  const [setSize, setSetSize] = useState(() => num('setSize', 4)); // sentences per recall set
  const [seq, setSeq] = useState<SentenceItem[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [judgments, setJudgments] = useState<boolean[]>([]); // user's true/false answers
  const [recallInput, setRecallInput] = useState('');
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [judgeHits, setJudgeHits] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = async () => {
    // уровень рулит размером набора (число слов держать = реальная нагрузка памяти; растёт без жёсткого потолка)
    // ⚠️ Пресет — потолок желания (см. `presetCap`): программа просит набор из
    // четырёх, а лесенка на первом уровне даёт три.
    const поЛесенке = Math.min(SENTENCES.length, 2 + lvl.level);                  // L1=3, дальше +1/уровень
    const sz = isPreset
      ? capPresetByLevel({ want: setSize, atLevel: поЛесенке, atTop: поЛесенке >= SENTENCES.length })
      : поЛесенке;
    levelRef.current = lvl.level;
    if (!isPreset) setSetSize(sz);
    /**
     * 🔴 СНАЧАЛА ТО, ЧЕГО ЧЕЛОВЕК ЕЩЁ НЕ ВИДЕЛ. Раньше стояло `shuffle(SENTENCES).slice(0, sz)`
     * без всякой памяти между сессиями, и повтор начинался сразу: замер (симуляция 400
     * прогонов) — к 10-й сессии на 8-м уровне уже виденных 49%, на 12-м 59%.
     * Здесь это портит не настроение, а САМУ задачу: игрок судит, осмысленно ли
     * предложение, и во второй раз он не понимает его, а вспоминает вердикт —
     * проверка понимания превращается в проверку узнавания, причём по времени и
     * очкам это выглядит как рост. Разбор и цифры — в шапке `services/freshPool`.
     * ⚠️ Запас всё те же 62 предложения: сервис убирает ПРЕЖДЕВРЕМЕННЫЙ повтор, а не
     * повтор вообще. Больше материала требует перевода (сейчас два языка из двенадцати).
     */
    const { picked } = await pickFresh('reading_span', profile?.id, SENTENCES, sz, (it) => it.en);
    setSeq(picked);
    setStepIdx(0);
    setJudgments([]);
    setRecallInput('');
    setHits(0); setErrors(0); setJudgeHits(0);
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
  };

  const handleJudge = (says: boolean) => {
    const cur = seq[stepIdx];
    const correct = says === cur.ok;
    if (correct) setJudgeHits(j => j + 1);
    setJudgments([...judgments, says]);
    if (stepIdx + 1 >= seq.length) setPhase('recall');
    else setStepIdx(stepIdx + 1);
  };

  const handleRecallSubmit = async () => {
    const expected = seq.map(s => language !== 'ru' ? s.lastEn : s.lastRu).map(x => x.toLowerCase().trim());
    const given = recallInput.toLowerCase().split(/[\s,;]+/).filter(Boolean).map(x => x.trim());
    let h = 0, e = 0;
    for (let i = 0; i < expected.length; i++) {
      if (given[i] === expected[i]) h++;
      else e++;
    }
    setHits(h); setErrors(e);
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const passed = !isPreset && e === 0;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
    } else {
      if (passed) lvl.reach(levelRef.current + 1);   // чистый recall всех слов → +уровень
      else lvl.fail();   // не прошёл → гистерезис понижения (3 провала подряд → level-1)
      setClearedPassed(passed);   // непрерывный поток: провал уровня → баннер «почти», не тупик
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'reading_span',
        score: Math.max(0, h * 100 + judgeHits * 30 - e * 50),
        time_seconds: finalTime,
        difficulty: setSize <= 3 ? 'easy' : setSize <= 5 ? 'medium' : 'hard',
        mode: `${setSize}-set`,
        errors: e,
        details: { level: levelRef.current, judgments: judgeHits, recalled: h, expected: expected.join(' ') },
      });
    } catch (err) { console.error(err); }
  };

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="book" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('readingSpan')}</Text>
        <Text style={styles.configDesc}>{t('readingSpanDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="readingSpanIntroDesc" benefits={RS_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="reading_span" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {t('rspanLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
    </ScrollView>
      {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
      </>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      </View>
    </View>
  );

  // игровые фазы (суждение/ввод слов) — на едином каркасе GameShell:
  // кнопки суждения и «Проверить» прибиты к низу (эталон math-sprint),
  // поле в скролле — длинная фраза при крупном шрифте и клавиатура на recall
  if (phase === 'playing' || phase === 'recall') {
    return (
      <GameShell
        title={t('readingSpan')}
        onBack={() => goBackOrHome()}
        scrollableField
        /**
         * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
         * играх, и правка вида приходит сразу везде.
         *
         * ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
         * норма по построению, и красный счётчик наказывает ровно за то, чего
         * требует обучение (§12.4 карты геймификации).
         */
        hud={[
          { key: 'hud_step', icon: 'ellipse', label: t('hud_step'), value: `${stepIdx + 1}/${seq.length}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: judgeHits, tone: 'good' as const },
          { key: 'time', icon: 'ellipse', label: t('time'), value: `${elapsedTime.toFixed(1)}${t('secShort')}` },
        ]}
        stats={
          phase === 'playing' ? (
            <View style={styles.statsRow}>
              {/* Правило уровня — объяснение механики, а не счётчик: остаётся в шапке. */}
              <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />
            </View>
          ) : undefined
        }
        toolbar={
          phase === 'playing' ? (
            <View style={styles.judgeRow}>
              <TouchableOpacity
                accessibilityRole="button" style={[styles.judgeBtn, { backgroundColor: '#22c55e' }]} onPress={() => handleJudge(true)}>
                <Ionicons name="checkmark" size={28} color={textOn('#22c55e')} />
                <Text style={[styles.judgeText, { color: textOn('#22c55e') }]} numberOfLines={2}>{t('makesSense')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button" style={[styles.judgeBtn, { backgroundColor: '#f43f5e' }]} onPress={() => handleJudge(false)}>
                <Ionicons name="close" size={28} color="#FFF" />
                <Text style={styles.judgeText} numberOfLines={2}>{t('nonsense')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              accessibilityRole="button" style={[styles.startBtn, styles.recallBtn]} onPress={handleRecallSubmit}>
              <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText} numberOfLines={1}>{t('check')}</Text>
              </GradientSurface>
            </TouchableOpacity>
          )
        }
      >
        {phase === 'playing' ? (() => {
          const cur = seq[stepIdx];
          const sentence = language !== 'ru' ? cur.en : cur.ru;
          const lastWord = language !== 'ru' ? cur.lastEn : cur.lastRu;
          return (
            <View style={styles.fieldCol}>
              <View style={[styles.sentenceBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sentenceText, { color: colors.text }]}>{sentence}</Text>
                <Text style={[styles.lastWordHint, { color: colors.text }]}>
                  {t('rememberLast')}: <Text style={styles.lastWordBold}>{lastWord}</Text>
                </Text>
              </View>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('readingSpanJudge')}</Text>
            </View>
          );
        })() : (
          <View style={styles.fieldCol}>
            <Text style={[styles.recallTitle, { color: colors.text }]} numberOfLines={2}>{t('recallNow')}</Text>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('recallHint')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder={t('recallPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={recallInput}
              onChangeText={setRecallInput}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        )}
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
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
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('readingSpan')}</Text>
        <View style={{ width: 40, flexShrink: 0 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared gameId="reading_span" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 + judgeHits * 30 - errors * 50)}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between', gap: 8 },
  // flexShrink:0 — круглая кнопка «назад» не сплющивается в овал при крупном шрифте
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  // flexShrink:1 + minWidth:0 — длинный заголовок ужимается, а не выдавливает спейсер за край
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  // игровое поле внутри каркаса: колонка на всю ширину, содержимое центрировано
  fieldCol: { width: '100%', maxWidth: 540, alignSelf: 'center', alignItems: 'center', gap: 18 },
  // flexWrap — три счётчика при крупном шрифте переносятся, а не уезжают за край
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  sentenceBox: { padding: 22, borderRadius: 16, gap: 16, maxWidth: 480, alignItems: 'center', alignSelf: 'center', width: '100%' },
  sentenceText: { fontSize: 20, fontWeight: '600', textAlign: 'center', lineHeight: 28 },
  lastWordHint: { fontSize: 14, fontWeight: '600' },
  lastWordBold: { fontWeight: '900', fontSize: 16 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, alignSelf: 'center', width: '100%' },
  // ГЛАВНЫЙ ФИКС репорта: ряд был без ограничения ширины (playArea alignItems:'center'),
  // при системном крупном шрифте кнопки росли и уезжали за край экрана.
  // flexWrap — не влезли в строку → переносятся вниз; maxWidth+alignSelf — ряд знает свою ширину.
  judgeRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 480 },
  // flexShrink:1 + minWidth:0 — даже одна кнопка с огромным шрифтом ужимается внутрь экрана
  judgeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 16, flexShrink: 1, minWidth: 0 },
  judgeText: { color: '#FFF', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  recallTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  // кнопка «Проверить» — та же ширина, что и поле ввода, вместо роста по тексту
  recallBtn: { width: '100%', maxWidth: 460 },
  input: { width: '100%', maxWidth: 460, minHeight: 64, padding: 14, fontSize: 16, borderRadius: 12, borderWidth: 1 },
});
