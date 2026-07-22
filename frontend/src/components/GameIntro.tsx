import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { JuicyButton } from '@/src/components/juice';
import { gameIconByNameKey } from '@/src/constants/gameIcons';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';
import { isEmbed } from '@/src/services/buildTarget';

interface Benefit {
  icon: string;
  textKey: string;
}

interface GameIntroProps {
  nameKey: string;
  icon: string;
  gradient: string[];
  skillKey: string;
  descriptionKey: string;
  benefits: Benefit[];
  onStart: () => void;
  onBack: () => void;
}

export default function GameIntro({
  nameKey,
  icon,
  gradient,
  skillKey,
  descriptionKey,
  benefits,
  onStart,
  onBack,
}: GameIntroProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [helpOpen, setHelpOpen] = React.useState(false);
  const heroImg = gameIconByNameKey(nameKey);

  // ?embed=1 (iframe на страницах promo-сайта): интро пропускаем — сайт уже
  // показал описание игры своей статьёй, iframe должен открыть чистое поле.
  // Контракт с Кодексом 22.07: /play/games/<slug>?embed=1&lang=<code>.
  const embedded = isEmbed();
  React.useEffect(() => {
    if (embedded) onStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);
  if (embedded) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={onBack}
        >
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('title_about_game')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <GamePreviewBackground />
          {heroImg ? (
            <Image source={heroImg} style={styles.heroImage} />
          ) : (
            <View style={styles.iconContainer}>
              <Ionicons name={icon as any} size={48} color="#FFFFFF" />
            </View>
          )}
          <Text style={styles.gameName}>{t(nameKey)}</Text>
          <View style={styles.skillBadge}>
            <Ionicons name="fitness-outline" size={16} color="#FFFFFF" style={styles.skillIcon} />
            <Text style={styles.skillText}>{t(skillKey)}</Text>
          </View>
        </LinearGradient>

        {/* Description */}
        <View style={[styles.descriptionCard, { backgroundColor: colors.surface }]}>
          <View style={styles.descriptionHeader}>
            <Ionicons name="information-circle" size={24} color={gradient[0]} style={styles.descriptionIcon} />
            <Text style={[styles.descriptionTitle, { color: colors.text }]}>
              {t('title_how_it_works')}
            </Text>
          </View>
          <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
            {t(descriptionKey)}
          </Text>
        </View>

        {/* Benefits */}
        <View style={[styles.benefitsCard, { backgroundColor: colors.surface }]}>
          <View style={styles.benefitsHeader}>
            <Ionicons name="star" size={24} color={gradient[0]} style={styles.benefitsIcon} />
            <Text style={[styles.benefitsTitle, { color: colors.text }]}>
              {t('title_real_life_benefits')}
            </Text>
          </View>
          <View style={styles.benefitsList}>
            {benefits.map((benefit, index) => (
              <View key={index} style={styles.benefitItem}>
                <View style={[styles.benefitIcon, { backgroundColor: gradient[0] + '20' }]}>
                  <Ionicons name={benefit.icon as any} size={20} color={gradient[0]} />
                </View>
                <Text style={[styles.benefitText, { color: colors.text }]}>
                  {t(benefit.textKey)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tips */}
        <View style={[styles.tipsCard, { backgroundColor: colors.surface }]}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={24} color={gradient[0]} style={styles.tipsIcon} />
            <Text style={[styles.tipsTitle, { color: colors.text }]}>
              {t('title_tip')}
            </Text>
          </View>
          <Text style={[styles.tipsText, { color: colors.textSecondary }]}>
            {t('desc_regular_training_tip')}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom: Справка + Старт (две кнопки в ряд) */}
      <View style={styles.bottomContainer}>
        <View style={styles.btnRow}>
          <JuicyButton label={t('btn_help')} icon="help-circle" colors={['#fde047', '#f59e0b']} tint="#1a1a1a" onPress={() => setHelpOpen(true)} style={{ flex: 1 }} />
          <JuicyButton label={t('start')} icon="play" colors={gradient as [string, string]} onPress={onStart} style={{ flex: 1 }} />
        </View>
      </View>

      {/* Help modal (структурная справка — как играть + что тренирует) */}
      <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>{t(nameKey)}</Text>
              <TouchableOpacity onPress={() => setHelpOpen(false)} style={[styles.modalClose, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalSkill, { backgroundColor: gradient[0] + '22' }]}>
              <Ionicons name="fitness-outline" size={14} color={gradient[0]} />
              <Text style={[styles.modalSkillText, { color: gradient[0] }]}>{t(skillKey)}</Text>
            </View>
            <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalBody, { color: colors.text }]}>{t(descriptionKey)}</Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setHelpOpen(false)} style={[styles.modalOk, { backgroundColor: gradient[0] }]}>
              <Text style={styles.modalOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,   // крупный шрифт: заголовок ужимается, а не выталкивает спейсер за край
    minWidth: 0,     // web-flex: без этого Yoga не даёт тексту ужаться
  },
  placeholder: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroCard: {
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroImage: { width: 88, height: 88, borderRadius: 22, marginBottom: 12 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  skillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 7, 20, 0.46)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skillIcon: {
    marginRight: 8,
  },
  skillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  descriptionCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.4)',   // заметная рамка — карточка не сливается со светлым фоном
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  descriptionIcon: {
    marginRight: 10,
  },
  descriptionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
  },
  benefitsCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  benefitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  benefitsIcon: {
    marginRight: 10,
  },
  benefitsTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  benefitsList: {
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,   // крупный шрифт: иконка не сплющивается рядом с растущим текстом
  },
  benefitText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
    minWidth: 0,     // web-flex: даём тексту ужиматься/переноситься, а не уезжать за край
  },
  tipsCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipsIcon: {
    marginRight: 10,
  },
  tipsTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  tipsText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  helpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
  },
  helpBtnText: { fontSize: 16, fontWeight: '700' },
  startButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  startButtonIcon: {
    marginRight: 10,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalSheet: { width: '100%', maxWidth: 520, maxHeight: '82%', borderRadius: 20, borderWidth: 1, padding: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalTitle: { flex: 1, fontSize: 22, fontWeight: '800' },
  modalClose: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  modalSkill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  modalSkillText: { fontSize: 13, fontWeight: '700' },
  modalBody: { fontSize: 16.5, lineHeight: 25 },
  modalOk: { marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalOkText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
