/**
 * WalkingPet — «Синапс» гуляет по низу экрана (глобальный оверлей в _layout).
 *
 * Поведение: медленно ходит между случайными точками нижней кромки, между
 * переходами отдыхает 3-8 с, раз в 20-40 с бросает реплику в пузыре (реплики
 * REACTIONS с промо-сайта, язык приложения). Тап — экран питомца /pet.
 *
 * Урок FeedbackWidget учтён (репорт «кнопка мешается в игре»):
 *  - в играх (/games/*) и на самом /pet питомец скрыт; onboarding тоже —
 *    первый экран не место для отвлекающих сущностей;
 *  - тумблер «Питомец Синапс» в настройках ('psygames_pet_on') позволяет
 *    выключить прогулки совсем — НЕЗАВИСИМО от тумблера чата с разработчиками;
 *  - pointerEvents перехватывает только сам питомец (box-none на контейнерах),
 *    низ экрана остаётся кликабельным.
 */
import React from 'react';
import {
  Animated, DeviceEventEmitter, Easing, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import PetSprite, {
  PetAccessory, PetSkin, PetState, PET_FIDGETS, PET_SLEEP_POSES, petCycleMs, petHasState,
} from '@/src/components/pet/PetSprite';
import {
  consumeRecentRecord, getDaysSinceWash, getFedDays, getPetAccessory, getPetScale,
  getPetSkinChoice, getPetStats, getPetVisible, PET_SCALE_DEFAULT, PET_SCALE_EVENT,
  PET_VISIBLE_EVENT, pickPetLine, pickPettedLine, pickRecordLine, resolvePetSkin, PetStage,
} from '@/src/services/pet';
import { petLook, type PetLook } from '@/src/services/petLook';
import type { PetLine, PetSkill } from '@/src/services/petLines';
import { getSessions } from '@/src/services/api';
import { GAMES } from '@/src/constants/games';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

const PET_SIZE = 56;
const WALK_SPEED = 34;        // px/с — прогулочный шаг, не спринт
const PAUSE_MIN = 3000;       // отдых между переходами 3-8 с
const PAUSE_SPAN = 5000;
const SPEECH_MIN = 20000;     // реплика раз в 20-40 с
const SPEECH_SPAN = 20000;
const SPEECH_SHOW = 4000;
// v1.158: расписание речи ЖИВЁТ МЕЖДУ ЭКРАНАМИ (module-scope, не ref).
// Было: таймер стартовал заново при каждом монтировании, а после v1.155 питомец
// активен только на главной — где редко сидят 20-40 с подряд, поэтому он почти
// перестал говорить (репорт Дениса «куда фразы делись»). Теперь помним момент
// последней реплики: вернулся на главную, а пауза уже вышла → скажет сразу.
let lastSpokeAt = 0;
const FIRST_SPEECH_MIN = 4000;   // самая первая фраза за сессию — быстро, не через 20-40 с
const FIRST_SPEECH_SPAN = 4000;

/**
 * Подъём над нижним тулбаром.
 *
 * Питомец ходит по самому низу экрана — ровно там, где на части экранов живёт тулбар
 * с главной кнопкой. Репорт Вали 07.08 со скрином: питомец сидел НА кнопке «Начать»
 * на экране выбора зарядки — «сдвинуть невозможно, в итоге нет возможности начать игру».
 *
 * ⚠️ Я перед этим проверял перекрытие на веб-превью и написал, что тап не перехватывается.
 * Замер был верен для десктопного окна, где питомец разгуливает по всей ширине, но
 * на телефоне он паркуется поверх кнопки — и человеку неважно, перехватывает он тап
 * или просто закрывает собой цель. Смотреть надо было на её скрин, а не на своё окно.
 *
 * Экраны с тулбаром: игры (GameShell) и выбор зарядки. Там поднимаем питомца выше него.
 */
const TOOLBAR_H = 74;
const BOTTOM_BAR_LIFT = (pathname: string): number =>
  (pathname.startsWith('/games/') || pathname.startsWith('/warmup-picker') ? TOOLBAR_H : 0);

export default function WalkingPet() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const { width } = useWindowDimensions();
  const pathname = usePathname() || '';

  const [petOn, setPetOn] = React.useState(true);
  const [skin, setSkin] = React.useState<PetSkin>('cat');
  const [accessory, setAccessory] = React.useState<PetAccessory | null>(null);
  // Масштаб из настроек (ползунок): применяется живо через DeviceEventEmitter.
  const [scale, setScale] = React.useState(PET_SCALE_DEFAULT);
  // Пузырь: текст + опциональная шкала тренера (тап по пузырю → игра шкалы).
  const [bubble, setBubble] = React.useState<{ text: string; skill?: PetSkill } | null>(null);
  // v1.135: кадровая анимация (спрайты kie) — шаг/отдых/сон/машет/прыжок
  const [sprite, setSprite] = React.useState<PetState>('idle');
  /** Вид по заботе — подменяет ПОКОЙ (см. petLook). */
  const [look, setLook] = React.useState<PetLook | null>(null);
  const walkingRef = React.useRef(false);

  // В играх плавающие элементы мешают (проверено фидбеком) — прячемся.
  // v1.158: питомец ВЕРНУЛСЯ на экраны со списками. В v1.155 я его там спрятал,
  // чтобы не перекрывал нижние карточки (аудит) — но побочно он замолчал: остался
  // только на главной, где редко сидят 20-40 с до реплики (репорт Дениса «куда
  // фразы делись»). Правильное решение: питомец на месте, а спискам добавлен
  // нижний отступ 96px под него (shop/statistics/achievements/whats-new).
  // Скрыт по-прежнему там, где реально мешает: в играх, онбординге и на своём /pet.
  // v1.170 (видно на скриншоте Вали): пузырь питомца «Я тут, если что 💜» лёг
  // ПОВЕРХ кнопки «Стоп» на мосту между играми. На служебных экранах комплекса
  // внизу стоят кнопки решения (начать сейчас / пропустить / остановить), и
  // питомец там не сопровождает, а мешает нажать. Убираем его оттуда совсем —
  // это экраны на несколько секунд, компания на них не нужна.
  const routeAllowed = !(
    pathname.startsWith('/games/') || pathname.startsWith('/pet') || pathname.startsWith('/onboarding')
    || pathname.startsWith('/warmup-bridge') || pathname.startsWith('/warmup-complete')
    || pathname.startsWith('/assessment-result')
  );
  const active = petOn && routeAllowed;

  // Контекст для реплик: стадия + слабейшая шкала + давность последней сессии.
  // В ref'ах — speak() живёт в замыкании эффекта. Перечитывается при навигации:
  // вышел из игры → свежая сессия видна → питомец реагирует «только что сыграл».
  const stageRef = React.useRef<PetStage>(1);
  const weakSkillRef = React.useRef<PetSkill | undefined>(undefined);
  const lastSessionAtRef = React.useRef<number | null>(null);

  // Тумблер/скин/масштаб перечитываются при каждой навигации (как в FeedbackWidget):
  // после выхода из настроек тумблер применится, после /pet скин обновится.
  React.useEffect(() => {
    getPetVisible().then(setPetOn).catch(() => {});
    getPetScale().then(setScale).catch(() => {});
    getPetAccessory().then(setAccessory).catch(() => {});
    getPetStats().then(async (s) => {
      stageRef.current = s.stage;
      // Тренер зовёт в слабейшую шкалу — только когда прогресс уже есть
      // (совсем нулёвому пользователю рекомендация «память отстаёт» = шум).
      const entries = Object.entries(s.skills) as [PetSkill, number][];
      const min = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
      weakSkillRef.current = s.total >= 5 ? min[0] : undefined;
      // Скин: выбор может быть 'auto' — эволюция по стадии.
      const choice = await getPetSkinChoice();
      setSkin(resolvePetSkin(choice, s.stage));
    }).catch(() => {});
    getSessions().then((ss) => {
      const last = ss.length ? ss[ss.length - 1]?.timestamp : null;
      lastSessionAtRef.current = last ? Date.parse(last) || null : null;
    }).catch(() => {});
    /**
     * 🔴 ВИД ПО ЗАБОТЕ. Ради него и рисовались восемь шкал внешности: не кормили —
     * отощал, не мыли — грязный, забросили — унылый, всё в порядке — показывает,
     * насколько вырос. Без этого вызова 56 кадров просто лежали бы в сборке.
     *
     * Считается на КАЖДОЙ навигации, а не по таймеру: вид меняется на суточном
     * масштабе, и чаще его пересчитывать незачем.
     */
    Promise.all([getFedDays(), getDaysSinceWash(), getPetStats(), getSessions()])
      .then(([fedDays, daysSinceWash, stats, ss]) => {
        const last = ss.length ? ss[ss.length - 1]?.timestamp : null;
        const t = last ? Date.parse(last) : NaN;
        const daysSincePlay = Number.isFinite(t) ? (Date.now() - t) / 86400000 : 999;
        const шкалы = Object.values(stats.skills);
        setLook(petLook({
          fedDays,
          daysSinceWash,
          daysSincePlay,
          stage: stats.stage,
          skillAvg: шкалы.reduce((a, b) => a + b, 0) / Math.max(1, шкалы.length),
        }));
      })
      .catch(() => {});
  }, [pathname]);

  // Праздник рекорда: api.saveSession оставил маркер → на первой же навигации
  // после игры питомец прыгает и хвалит, не дожидаясь таймера болтовни.
  React.useEffect(() => {
    if (!active) return;
    let alive = true;
    const id = setTimeout(async () => {
      if (!alive || !(await consumeRecentRecord())) return;
      if (!alive) return;
      /**
       * ПРАЗДНИК РЕКОРДА — состояние `celebrate` (задача 00218752). Своих кадров у
       * него пока нет ни в одном паке, и `PetSprite` сам подставляет `jump`. Но
       * НАЗЫВАЕТСЯ событие теперь правильно: появятся кадры — праздник заиграет
       * сам, без правки этого файла. Раньше «подключить за час» означало найти три
       * таких места и не забыть ни одного.
       */
      setSprite('celebrate');
      setBubble({ text: pickRecordLine(langRef.current).text });
      setTimeout(() => { if (alive) { setSprite('idle'); setBubble(null); } }, 5000);
    }, 1300);
    return () => { alive = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, active]);

  // Ползунок и тумблер в настройках шлют события живьём — питомец меняется
  // прямо под пальцем (репорт Rulon: тумблер «не работал», пока не сменишь экран).
  React.useEffect(() => {
    const subScale = DeviceEventEmitter.addListener(PET_SCALE_EVENT, (v: number) => {
      if (Number.isFinite(v)) setScale(v);
    });
    const subOn = DeviceEventEmitter.addListener(PET_VISIBLE_EVENT, (on: boolean) => {
      setPetOn(!!on);
    });
    return () => { subScale.remove(); subOn.remove(); };
  }, []);

  // Позиция/язык в ref'ах: таймеры-замыкания живут дольше рендера, а
  // перезапускать всю прогулку из-за смены языка или ресайза не хотим.
  const reduced = useReducedMotion();
  const x = React.useRef(new Animated.Value(40)).current;
  const flip = React.useRef(new Animated.Value(1)).current;   // scaleX: 1 вправо, -1 влево
  const posRef = React.useRef(40);
  const widthRef = React.useRef(width);
  widthRef.current = width;
  const langRef = React.useRef(language);
  langRef.current = language;
  /**
   * Те же грабли, что с языком: цикл прогулки живёт в замыкании эффекта и
   * перезапускать его из-за смены облика или режима движения не нужно.
   *
   * ⚠️ Синхронизация ЭФФЕКТОМ, а не присвоением в теле рендера. Соседние
   * `widthRef`/`langRef` написаны присвоением — это старый приём файла, и линт
   * на него ругается («Cannot access refs during render»). Повторять его значит
   * добавлять к чужому долгу; правило храповика ровно об этом.
   */
  const skinRef = React.useRef(skin);
  const reducedRef = React.useRef(reduced);
  React.useEffect(() => { skinRef.current = skin; }, [skin]);
  React.useEffect(() => { reducedRef.current = reduced; }, [reduced]);
  // Размер в ref: step() живёт в замыкании эффекта, а перезапускать прогулку
  // на каждый сдвиг ползунка нельзя (шторм таймеров при живом драге).
  const size = Math.round(PET_SIZE * scale);
  const sizeRef = React.useRef(size);
  sizeRef.current = size;

  React.useEffect(() => {
    if (!active) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { if (alive) fn(); }, ms); timers.push(id); };

    const step = () => {
      const W = widthRef.current;
      // Гуляем в полосе 10%..90% ширины (координата — левый край спрайта)
      const min = W * 0.10;
      const max = Math.max(min + 40, W * 0.90 - sizeRef.current);
      const target = min + Math.random() * (max - min);
      const dist = Math.abs(target - posRef.current);
      // Разворот мордой по ходу движения; проход scaleX через 0 сам по себе
      // выглядит как поворот корпуса — отдельной анимации не нужно
      Animated.timing(flip, { toValue: target >= posRef.current ? 1 : -1, duration: 260, useNativeDriver: true }).start();
      // Длительность пропорциональна дистанции — скорость постоянная
      walkingRef.current = true;
      setSprite('walk');
      Animated.timing(x, {
        toValue: target,
        duration: Math.max(900, (dist / WALK_SPEED) * 1000),
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        posRef.current = target;
        walkingRef.current = false;
        if (finished && alive) {
          setSprite('idle');
          const pause = PAUSE_MIN + Math.random() * PAUSE_SPAN;
          if (pause > 5500) {
            /**
             * Затяжной отдых → задремал. Поза сна теперь случайная из семи, а не
             * всегда клубок: питомец на экране часами, и одна и та же поза сна
             * читается как «картинка залипла».
             */
            const поза = PET_SLEEP_POSES[Math.floor(Math.random() * PET_SLEEP_POSES.length)];
            later(() => { if (!walkingRef.current) setSprite(поза); }, 4000);
          } else if (!reducedRef.current) {
            /**
             * 🔴 МЕЛОЧИ БЕЗДЕЛЬЯ — ради них состояния и рисовались.
             *
             * Кот на коротком отдыхе зевает, чешется, гоняется за хвостом,
             * оглядывается. Без этого двадцать дорисованных состояний остались бы
             * мёртвым грузом в сборке: их бы никто не вызывал, и «весело» бы не
             * стало — а Денис просил ровно этого.
             *
             * ⚠️ Возврат в покой считается по ДЛИНЕ ЦИКЛА, а не круглым числом:
             * у зевка семь кадров по 260 мс, у чесания семь по 130 — обрыв на
             * середине выглядит как рывок. Мелочь запускается, только если весь
             * цикл успевает пройти до следующего перехода.
             */
            /**
             * ⚠️ Только те мелочи, что у ОБЛИКА есть своими кадрами. У робота и
             * Созвездия их нет, и `PetSprite` подставил бы замену: `tailchase`
             * заменяется ходьбой, и робот «пошёл» бы, стоя на месте. Лучше
             * ничего, чем движение не по делу.
             */
            const доступные = PET_FIDGETS.filter((st) => petHasState(skinRef.current, st));
            if (!доступные.length) { later(step, pause); return; }
            const мелочь = доступные[Math.floor(Math.random() * доступные.length)];
            const цикл = petCycleMs(skinRef.current, мелочь);
            const старт = 700;
            if (старт + цикл < pause - 300) {
              later(() => { if (!walkingRef.current) setSprite(мелочь); }, старт);
              later(() => { if (!walkingRef.current) setSprite('idle'); }, старт + цикл);
            }
          }
          later(step, pause);
        }
      });
    };

    const speak = () => {
      const last = lastSessionAtRef.current;
      const line: PetLine = pickPetLine(langRef.current, {
        hour: new Date().getHours(),
        stage: stageRef.current,
        minutesSinceLastSession: last != null ? (Date.now() - last) / 60000 : null,
        weakSkill: weakSkillRef.current,
      });
      setBubble({ text: line.text, skill: line.skill });
      // говорит — машет лапкой (если не в пути)
      if (!walkingRef.current) {
        setSprite('wave');
        later(() => { if (!walkingRef.current) setSprite('idle'); }, 1600);
      }
      // Диалог-цепочка: вторая фраза сменяет первую в том же пузыре.
      if (line.follow) {
        later(() => setBubble({ text: line.follow!, skill: line.skill }), SPEECH_SHOW - 1000);
        later(() => setBubble(null), SPEECH_SHOW - 1000 + SPEECH_SHOW);
      } else {
        later(() => setBubble(null), SPEECH_SHOW);
      }
      lastSpokeAt = Date.now();
      later(speak, SPEECH_MIN + Math.random() * SPEECH_SPAN);
    };

    /**
     * Щадящий режим: питомец остаётся, но перестаёт ходить.
     *
     * Прогулка — самая тяжёлая петля в приложении: персонаж без конца ездит
     * поперёк нижнего края, то есть по периферии зрения, где движение
     * ловится сильнее всего и откуда его не убрать, не уходя с экрана. При
     * этом сама прогулка ничего не сообщает — это «живость», не сигнал.
     *
     * Убирать питомца целиком было бы подменой: он не украшение, а
     * собеседник — фразы, подсказка слабой шкалы, тап на экран /pet. Всё это
     * текст и нажатия, они остаются. Стоит на месте и разговаривает.
     */
    if (!reduced) later(step, 1200);                      // первый шаг почти сразу
    // Когда заговорить: за сессию ещё не говорил → быстро (4-8 с). Уже говорил →
    // досиживаем ОСТАТОК паузы с прошлого раза, а не полные 20-40 с заново.
    const sinceLast = lastSpokeAt === 0 ? Infinity : Date.now() - lastSpokeAt;
    const firstDelay = lastSpokeAt === 0
      ? FIRST_SPEECH_MIN + Math.random() * FIRST_SPEECH_SPAN
      : Math.max(2500, SPEECH_MIN + Math.random() * SPEECH_SPAN - sinceLast);
    later(speak, firstDelay);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      // Запоминаем, где остановились — после возврата из игры продолжит оттуда
      x.stopAnimation((v) => { posRef.current = v; });
      flip.stopAnimation();
      setBubble(null);
    };
  }, [active, x, flip, reduced]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.walker, { bottom: insets.bottom + 6 + BOTTOM_BAR_LIFT(pathname), transform: [{ translateX: x }] }]}
    >
      {bubble != null && (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!bubble.skill}
          activeOpacity={0.7}
          onPress={() => {
            // Тренерский пузырь: тап открывает случайную игру слабой шкалы.
            const cats = bubble.skill === 'logic' ? ['logic', 'intuition']
              : bubble.skill === 'speed' ? ['action']
              : [bubble.skill as string];
            const pool = GAMES.filter((g) => cats.includes(g.category));
            const game = pool[Math.floor(Math.random() * pool.length)];
            // game.route, а НЕ `/games/${game.id}`: у 35 игр из 61 id не совпадает
            // с именем файла экрана, и собранный из id адрес открывает
            // «Unmatched Route» вместо игры.
            if (game) { setBubble(null); router.push(game.route as any); }
          }}
          style={[styles.bubble, {
            backgroundColor: colors.surface,
            borderColor: bubble.skill ? colors.primary : colors.border,
            borderWidth: bubble.skill ? 1.5 : 1,
          }]}
        >
          <Text style={[styles.bubbleText, { color: colors.text }]} numberOfLines={2}>{bubble.text}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => {
          // прыжок-отклик, затем экран питомца
          setSprite('jump');
          setTimeout(() => router.push('/pet' as any), 450);
        }}
        onLongPress={() => {
          // Поглаживание: долгий тап — ласка без навигации.
          setSprite('wave');
          setBubble({ text: pickPettedLine(langRef.current).text });
          setTimeout(() => { setSprite('idle'); setBubble(null); }, 3200);
        }}
        delayLongPress={420}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('a11yPet')}
      >
        <Animated.View style={{ transform: [{ scaleX: flip }] }}>
          <PetSprite state={sprite} size={size} skin={skin} accessory={accessory} look={look} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // zIndex ниже FeedbackWidget (100) и тостов — питомец никогда ничего не перекрывает
  walker: { position: 'absolute', left: 0, alignItems: 'center', zIndex: 60 },
  // Пузырь в стиле сайта (.pet-speech): скруглён, «хвостик» — острый нижний угол
  bubble: {
    maxWidth: 170,
    marginBottom: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 13,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bubbleText: { fontSize: 11.5, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
});
