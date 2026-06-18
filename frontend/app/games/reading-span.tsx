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
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#1f4037', '#99f2c8'];
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

type GamePhase = 'intro' | 'config' | 'playing' | 'recall' | 'result';

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

export default function ReadingSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
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

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = () => {
    const picked = shuffle(SENTENCES).slice(0, setSize);
    setSeq(picked);
    setStepIdx(0);
    setJudgments([]);
    setRecallInput('');
    setHits(0); setErrors(0); setJudgeHits(0);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
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
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'reading_span',
        score: Math.max(0, h * 100 + judgeHits * 30 - e * 50),
        time_seconds: finalTime,
        difficulty: setSize <= 3 ? 'easy' : setSize <= 5 ? 'medium' : 'hard',
        mode: `${setSize}-set`,
        errors: e,
        details: { judgments: judgeHits, recalled: h, expected: expected.join(' ') },
      });
    } catch (err) { console.error(err); }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="book" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('readingSpan')}</Text>
        <Text style={styles.configDesc}>{t('readingSpanDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('setSize')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5, 6].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, setSize === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setSetSize(n)}>
              <Text style={[styles.modeButtonText, { color: setSize === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => {
    const cur = seq[stepIdx];
    const sentence = language !== 'ru' ? cur.en : cur.ru;
    const lastWord = language !== 'ru' ? cur.lastEn : cur.lastRu;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{stepIdx + 1}/{seq.length}</Text>
          <Text style={[styles.statText, { color: GRADIENT[1] }]}>📝 {judgeHits}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}с</Text>
        </View>
        <View style={[styles.sentenceBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sentenceText, { color: colors.text }]}>{sentence}</Text>
          <Text style={[styles.lastWordHint, { color: GRADIENT[0] }]}>
            {t('rememberLast')}: <Text style={styles.lastWordBold}>{lastWord}</Text>
          </Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('readingSpanJudge')}</Text>
        <View style={styles.judgeRow}>
          <TouchableOpacity style={[styles.judgeBtn, { backgroundColor: '#22c55e' }]} onPress={() => handleJudge(true)}>
            <Ionicons name="checkmark" size={28} color="#FFF" />
            <Text style={styles.judgeText}>{t('makesSense')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.judgeBtn, { backgroundColor: '#f43f5e' }]} onPress={() => handleJudge(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
            <Text style={styles.judgeText}>{t('nonsense')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRecall = () => (
    <View style={styles.recallArea}>
      <Text style={[styles.recallTitle, { color: colors.text }]}>{t('recallNow')}</Text>
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
      <TouchableOpacity style={styles.startBtn} onPress={handleRecallSubmit}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('validateBtn')}</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('readingSpan')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="readingSpan" icon="book" gradient={GRADIENT as [string, string]}
          skillKey="skillWorkingMemory" descriptionKey="readingSpanIntroDesc"
          benefits={RS_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'recall' && renderRecall()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 + judgeHits * 30 - errors * 50)}
          time={elapsedTime} errors={errors}
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
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 18, gap: 18, alignItems: 'center' },
  // фаза ввода слов — сверху (не центр), чтобы клавиатура не закрыла поле и кнопку
  recallArea: { flex: 1, paddingTop: 40, paddingHorizontal: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  sentenceBox: { padding: 22, borderRadius: 16, gap: 16, maxWidth: 480, alignItems: 'center' },
  sentenceText: { fontSize: 20, fontWeight: '600', textAlign: 'center', lineHeight: 28 },
  lastWordHint: { fontSize: 14, fontWeight: '600' },
  lastWordBold: { fontWeight: '900', fontSize: 16 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  judgeRow: { flexDirection: 'row', gap: 16 },
  judgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12 },
  judgeText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  input: { width: '100%', maxWidth: 460, minHeight: 64, padding: 14, fontSize: 16, borderRadius: 12, borderWidth: 1 },
});
