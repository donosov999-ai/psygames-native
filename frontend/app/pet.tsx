/**
 * /pet — экран питомца «Синапс» (порт блока NeuroPet с промо-сайта).
 *
 * Показывает: персонажа крупно (стадия из реального числа тренировок),
 * уровень + счётчик тренировок и 4 шкалы навыков, посчитанные из НАСТОЯЩЕГО
 * лога сессий (getSessions) — никаких выдуманных цифр, питомец отражает то,
 * что человек реально натренировал. Математика — в src/services/pet.ts.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, Redirect, router } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import PetSprite, { PetAccessory, PetSkin, petFrame } from '@/src/components/pet/PetSprite';
import { Image } from 'react-native';
import {
  getFedToday, getPetAccessory, getPetName, getPetSkinChoice, getPetStats, markFedToday,
  PET_FEED_COST, PetSkinChoice, pickReaction, PetStats, resolvePetSkin, setPetName, setPetSkin,
} from '@/src/services/pet';
import { pickPettedLine } from '@/src/services/petLines';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getTokens, spendTokens } from '@/src/services/tokens';
import { sndToken, sndWrong } from '@/src/services/feedback';
import { a11yDecor } from '@/src/services/a11y';
import { CATEGORY_TO_SKILL } from '@/src/services/pet';
import { GAMES } from '@/src/constants/games';
import { isGameAllowed } from '@/src/constants/profiles';

/** Цвета шкал — 1:1 с сайта (.pet-skill-memory и т.д.) */
const SKILL_COLORS: Record<keyof PetStats['skills'], string> = {
  memory: '#8a68f5',
  attention: '#25b989',
  logic: '#e55fa2',
  speed: '#4a91ed',
};
const SKILL_ORDER: (keyof PetStats['skills'])[] = ['memory', 'attention', 'logic', 'speed'];

/** Русские формы «N тренировок» (1 тренировка / 2 тренировки / 5 тренировок). */
function ruTrainings(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'тренировка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'тренировки';
  return 'тренировок';
}

export default function PetScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const ru = language === 'ru';   // остался только для русской плюрализации (ruTrainings)

  const { width: winW, height: winH } = useWindowDimensions();
  // Жалоба «питомец мелкий на Mac»: портрет адаптивный — desktop крупнее,
  // но не выше трети окна, чтобы шкалы не уезжали.
  const portrait = Math.min(winW >= 768 ? 300 : 220, Math.round(winH * 0.34));

  const { profile } = useProfile();
  const [stats, setStats] = React.useState<PetStats | null>(null);
  // Реплика выбирается раз на визит (не на каждый рендер) — питомец «здоровается»
  const [greeting, setGreeting] = React.useState('');
  // v1.140: скин; + 'auto' — эволюция по стадии (Искра=кот → Импульс=робот → Созвездие=Нейрон)
  const [skinChoice, setSkinChoice] = React.useState<PetSkinChoice>('cat');
  const [accessory, setAccessory] = React.useState<PetAccessory | null>(null);
  // Имя питомца: тап по заголовку — инлайн-редактор (глобально, 20 симв.)
  const [petName, setPetNameState] = React.useState('');
  const [editingName, setEditingName] = React.useState(false);
  // Кормление: раз в день за токены активного профиля
  const [fed, setFed] = React.useState(false);
  const [balance, setBalance] = React.useState(0);
  const [feastAnim, setFeastAnim] = React.useState(false);

  // На фокусе, не на маунте: вернулся с тренировки → шкалы уже подросли
  useFocusEffect(
    React.useCallback(() => {
      getPetStats().then(setStats).catch(() => {});
      getPetSkinChoice().then(setSkinChoice).catch(() => {});
      getPetAccessory().then(setAccessory).catch(() => {});
      getPetName().then(setPetNameState).catch(() => {});
      getFedToday().then(setFed).catch(() => {});
      if (profile?.id) getTokens(profile.id).then(setBalance).catch(() => {});
      setGreeting(pickReaction(language));
    }, [language, profile?.id]),
  );

  const pickSkin = (s: PetSkinChoice) => { setSkinChoice(s); setPetSkin(s).catch(() => {}); };

  const saveName = () => {
    setEditingName(false);
    setPetName(petName).catch(() => {});
  };

  const feed = async () => {
    const pid = profile?.id;
    if (!pid || fed) return;
    if (balance < PET_FEED_COST) { sndWrong(); return; }
    const ok = await spendTokens(pid, PET_FEED_COST);
    if (!ok) { sndWrong(); return; }
    sndToken();
    await markFedToday();
    setFed(true);
    setBalance(await getTokens(pid));
    // Радость: прыжки на пару секунд + благодарная реплика
    setFeastAnim(true);
    setGreeting(pickPettedLine(language).text);
    setTimeout(() => setFeastAnim(false), 2600);
  };

  const skillLabel = (k: keyof PetStats['skills']): string => {
    switch (k) {
      case 'memory': return t('catMemory');
      case 'attention': return t('catAttention');
      case 'logic': return t('petSkillLogic');
      case 'speed': return t('petSkillSpeed');
    }
  };

  const stage = stats?.stage ?? 1;
  const stageName = t(`petStage${stage}`);
  const total = stats?.total ?? 0;
  const skin: PetSkin = resolvePetSkin(skinChoice, stage);
  const shownName = petName || t('petName');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        {editingName ? (
          // v1.156 (репорт Дениса): раньше имя сохранялось только по onBlur/Enter —
          // на Android клавиатура закрывается без blur, и имя терялось. Явная
          // кнопка «✓» рядом с полем.
          <View style={styles.nameEditRow}>
            <TextInput
              value={petName}
              onChangeText={setPetNameState}
              onBlur={saveName}
              onSubmitEditing={saveName}
              autoFocus
              maxLength={20}
              placeholder={t('petName')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.title, styles.nameInput, { color: colors.text, borderColor: colors.border }]}
            />
            <TouchableOpacity
              accessibilityRole="button" onPress={saveName} style={[styles.nameSaveBtn, { backgroundColor: '#8a68f5' }]} accessibilityLabel={t('apply')}>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            accessibilityRole="button" onPress={() => setEditingName(true)} style={styles.nameRow} accessibilityLabel={t('petRename')}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{shownName}</Text>
            <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Пузырь-приветствие (стиль .pet-speech сайта) */}
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.bubbleText, { color: colors.text }]}>{greeting}</Text>
        </View>

        {/* v1.140: живой портрет — анимированный idle текущего скина (512px кадры);
            после угощения пару секунд прыгает от радости */}
        <PetSprite state={feastAnim ? 'jump' : 'idle'} size={portrait} skin={skin} accessory={accessory} />
        <Text style={[styles.stageName, { color: colors.text }]}>{stageName}</Text>
        <Text style={[styles.stageHint, { color: colors.textSecondary }]}>
          {t('petGrowsHint')}
        </Text>
        {/* v1.164 (репорт Вали «что нужно сделать, чтобы котик вырос, может кормить или
            гладить… у нас была тамагочи»): раньше тут было только «растёт после каждой
            тренировки» — без числа. Непонятно, сколько осталось, и рост не ощущается целью.
            Показываем счётчик и остаток до следующей стадии; на последней — сколько до
            следующего уровня, чтобы полоса не упиралась в тупик. */}
        {stats && (() => {
          const total = stats.total;
          const nextStageAt = total < 10 ? 10 : total < 30 ? 30 : null;
          const prevStageAt = total < 10 ? 0 : total < 30 ? 10 : 30;
          const target = nextStageAt ?? (Math.floor(total / 5) + 1) * 5;
          const base = nextStageAt ? prevStageAt : Math.floor(total / 5) * 5;
          const left = Math.max(0, target - total);
          const frac = Math.max(0, Math.min(1, (total - base) / Math.max(1, target - base)));
          return (
            <View style={{ width: '82%', maxWidth: 320, marginTop: 6, gap: 5 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(frac * 100)}%`, height: 6, backgroundColor: '#8a68f5' }} />
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                {t('petTrainingsDone').replace('{n}', String(total))}
                {' · '}
                {nextStageAt
                  ? t('petUntilNextStage')
                      .replace('{n}', String(left))
                      .replace('{stage}', t(`petStage${total < 10 ? 2 : 3}`))
                  : t('petUntilNextLevel').replace('{n}', String(left))}
              </Text>
            </View>
          );
        })()}

        {/* Кормление: раз в день, за токены активного профиля */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={feed}
          disabled={fed}
          activeOpacity={0.8}
          style={[styles.feedBtn, {
            backgroundColor: fed ? colors.surface : '#8a68f5',
            borderColor: fed ? colors.border : '#8a68f5',
          }]}
        >
          <Text style={[styles.feedText, { color: fed ? colors.textSecondary : '#fff' }]}>
            {fed ? `❤️ ${t('petFedToday')}` : `🍪 ${t('petFeed')} · ${PET_FEED_COST} ⭐`}
          </Text>
        </TouchableOpacity>
        {!fed && balance < PET_FEED_COST && (
          <Text style={[styles.feedHint, { color: colors.textSecondary }]}>{t('needMoreTokens')}</Text>
        )}

        {/* Подпись над рядом. Без неё это четыре карточки с чужими именами
            («Нейро-кот», «Нейрон», «Робот») и ни намёка, что все они — один и тот
            же питомец в разном виде. Репорт Вали: «не могу понять, кто такой
            Синапс, в списке он называется по-другому». Имя подставляем текущее:
            питомца можно переименовать, и тогда «Синапс» в подписи только запутает. */}
        <Text style={[styles.skinSectionTitle, { color: colors.textSecondary }]}>
          {t('petSkinSectionTitle').replace('{name}', shownName)}
        </Text>
        {/* Выбор скина: кот/робот/Нейрон или «Авто» — эволюция по стадии.
            Прокрутка обязательна: четыре карточки по 96pt с отступами дают ~414pt,
            а на экране 360pt это не помещается — раньше ряд просто обрезался, и
            «Авто» было не достать (репорт Rulon, голосом, v1.170). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.skinRow}
          style={styles.skinScroll}
        >
          {(['cat', 'robot', 'constellation', 'auto'] as PetSkinChoice[]).map((s) => {
            const on = skinChoice === s;
            const thumbSkin: PetSkin = s === 'auto' ? resolvePetSkin('auto', stage) : s;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                key={s}
                style={[styles.skinCard, { backgroundColor: colors.surface, borderColor: on ? '#8a68f5' : colors.border, borderWidth: on ? 2 : 1 }]}
                onPress={() => pickSkin(s)}
                activeOpacity={0.75}
              >
                <Image {...a11yDecor} source={petFrame(thumbSkin, 'idle', 0)} style={styles.skinThumb} resizeMode="contain" />
                {s === 'auto' && (
                  <Ionicons name="sparkles" size={13} color={on ? '#8a68f5' : colors.textSecondary} style={styles.autoBadge} />
                )}
                <Text style={[styles.skinLabel, { color: on ? '#8a68f5' : colors.textSecondary }]}>
                  {t(s === 'cat' ? 'petSkinCat' : s === 'robot' ? 'petSkinRobot' : s === 'constellation' ? 'petSkinConstellation' : 'petSkinAuto')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Уровень + счётчик тренировок (как .pet-status на сайте) */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statusBig, { color: colors.text }]}>{stats?.level ?? 1}</Text>
            <Text style={[styles.statusSmall, { color: colors.textSecondary }]}>{t('level')}</Text>
          </View>
          <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statusBig, { color: colors.text }]}>{total}</Text>
            <Text style={[styles.statusSmall, { color: colors.textSecondary }]}>
              {ru ? ruTrainings(total) : t(total === 1 ? 'unitTrainingOne' : 'unitTrainings')}
            </Text>
          </View>
        </View>

        {/* v1.170 (идея Вали): «он даёт статистику — память 100%, логика 100%, а вот
            эта не 100. А во что нужно поиграть, чтобы было 100? Он же сопроводитель,
            он должен давать советы». Шкалы показывали цифру и молчали о том, что с
            ней делать. Берём самую отстающую и предлагаем игру из ЕЁ категории —
            связь «шкала → игры» уже есть, ею пользуется тренерский пузырь питомца.
            Игру выбираем среди доступных профилю, иначе совет упрётся в замок. */}
        {stats && (() => {
          const weakest = SKILL_ORDER.reduce((a, b) => (stats.skills[a] <= stats.skills[b] ? a : b));
          if (stats.skills[weakest] >= 100) return null;   // всё на максимуме — советовать нечего
          const pool = GAMES.filter((g) => CATEGORY_TO_SKILL[g.category] === weakest && isGameAllowed(profile, g.id));
          if (!pool.length) return null;
          const pick = pool[stats.total % pool.length];   // без случайности: совет стабилен в пределах сессии
          // Переход строго по pick.route, а НЕ по `/games/${pick.id}`: id и имя
          // файла экрана совпадают лишь у 26 игр из 61 (schulte_table лежит в
          // /games/schulte), для остальных 35 собранный из id адрес открывал
          // «Unmatched Route» — совет вёл в никуда (репорт Rulon голосом, v1.171).
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${t('petAdviceTitle')}: ${t(pick.nameKey)}`}
              onPress={() => router.push(pick.route as any)}
              style={[styles.adviceCard, { backgroundColor: colors.surface, borderColor: SKILL_COLORS[weakest] }]}
            >
              <Text style={[styles.adviceTitle, { color: SKILL_COLORS[weakest] }]}>
                💡 {t('petAdviceTitle')}
              </Text>
              <Text style={[styles.adviceBody, { color: colors.text }]}>
                {t('petAdviceBody')
                  .replace('{skill}', skillLabel(weakest))
                  .replace('{game}', t(pick.nameKey))}
              </Text>
            </TouchableOpacity>
          );
        })()}

        {/* 4 шкалы навыков из реальных сессий */}
        <View style={styles.skills}>
          {SKILL_ORDER.map((k) => {
            const value = stats?.skills[k] ?? 0;
            return (
              <View key={k} style={[styles.skillCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.skillTop}>
                  <Text style={[styles.skillLabel, { color: colors.text }]}>{skillLabel(k)}</Text>
                  <Text style={[styles.skillValue, { color: SKILL_COLORS[k] }]}>{value}</Text>
                </View>
                <View style={[styles.meter, { backgroundColor: colors.border }]}>
                  <View style={[styles.meterFill, { width: `${value}%`, backgroundColor: SKILL_COLORS[k] }]} />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Шапка — как на других экранах (achievements/statistics)
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', flexShrink: 1, minWidth: 0, textAlign: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  nameSaveBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  nameInput: { borderBottomWidth: 1.5, paddingVertical: 2, minWidth: 140, maxWidth: 220 },
  placeholder: { width: 44 },
  feedBtn: { borderRadius: 999, borderWidth: 1.5, paddingVertical: 9, paddingHorizontal: 20, marginTop: 8 },
  feedText: { fontSize: 13.5, fontWeight: '800' },
  feedHint: { fontSize: 11.5, marginTop: 3 },
  autoBadge: { position: 'absolute', top: 6, right: 8 },
  scroll: { padding: 16, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%', gap: 6 },
  bubble: {
    maxWidth: 260, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1,
    borderRadius: 15, borderBottomLeftRadius: 4, marginBottom: 6,
  },
  bubbleText: { fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'center' },
  stageName: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  stageHint: { fontSize: 12.5, textAlign: 'center' },
  // flexGrow+center: когда карточки влезают целиком (планшет, альбомная), ряд
  // стоит по центру, а не жмётся к левому краю.
  skinSectionTitle: { fontSize: 12.5, fontWeight: '700', marginTop: 14, alignSelf: 'center' },
  skinScroll: { marginTop: 6, alignSelf: 'stretch' },
  skinRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 4, flexGrow: 1, justifyContent: 'center' },
  skinCard: { borderRadius: 15, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', minWidth: 96 },
  skinThumb: { width: 52, height: 52 },
  skinLabel: { fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  statusRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 6 },
  statusBox: {
    minWidth: 112, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1,
    borderRadius: 15, alignItems: 'center',
  },
  statusBig: { fontSize: 20, fontWeight: '900' },
  statusSmall: { fontSize: 11.5, marginTop: 1 },
  adviceCard: { borderWidth: 1.5, borderRadius: 14, padding: 13, gap: 4, marginBottom: 4 },
  adviceTitle: { fontSize: 12.5, fontWeight: '800' },
  adviceBody: { fontSize: 13.5, lineHeight: 19 },
  skills: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  skillCard: { borderWidth: 1, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 14 },
  skillTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  skillLabel: { fontSize: 13.5, fontWeight: '700' },
  skillValue: { fontSize: 15, fontWeight: '900' },
  meter: { height: 7, borderRadius: 999, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999 },
});
