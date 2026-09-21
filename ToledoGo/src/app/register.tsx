import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { 
  Dimensions, 
  StatusBar, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View 
} from 'react-native';
import Animated, { 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function RegisterRoleScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'customer' | 'vendor' | null>(null);

  // Floating background glow animations
  const glowTopAnim = useSharedValue(0);
  const glowBottomAnim = useSharedValue(0);

  useEffect(() => {
    glowTopAnim.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    glowBottomAnim.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const topGlowStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + glowTopAnim.value * 0.15 },
      { translateY: glowTopAnim.value * 15 }
    ],
    opacity: 0.07 + glowTopAnim.value * 0.05,
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + glowBottomAnim.value * 0.12 },
      { translateX: glowBottomAnim.value * -15 }
    ],
    opacity: 0.15 + glowBottomAnim.value * 0.08,
  }));

const handleContinue = () => {
    if (!selectedRole) return;

    if (selectedRole === 'vendor') {
      // Route specifically to the new secure vendor registration screen
      router.push('/register-vendor');
    } else {
      // Keep your exact existing logic for the customer side
      router.push({
        pathname: '/register-form',
        params: { role: selectedRole }
      });
    }
  };
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#451A03" />
      
      <LinearGradient
        colors={['#451A03', '#7C2D12', '#C2410C']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View style={[styles.glowCircleTop, topGlowStyle]} />
        <Animated.View style={[styles.glowCircleBottom, bottomGlowStyle]} />

        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.contentWrapper}>
            
            {/* Top Navigation / Back Button */}
            <Animated.View 
              entering={FadeInDown.delay(100).duration(600).springify()}
              style={styles.topHeader}
            >
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </Animated.View>

          {/* Header Content */}
            <View style={styles.headerSection}>
              <Animated.View entering={FadeInDown.delay(200).duration(800).springify()}>
                <Text style={styles.title}>Join ToledoGo</Text>
                <Text style={styles.subtitle}>How would you like to use the marketplace?</Text>
              </Animated.View>
            </View>

            {/* Role Selection Cards Container */}
            <Animated.View 
              entering={FadeInDown.delay(400).duration(800).springify()}
              style={styles.cardsContainer}
            >
              {/* Customer Option Card */}
              <TouchableOpacity 
                style={[
                  styles.roleCard, 
                  selectedRole === 'customer' && styles.selectedCard
                ]}
                activeOpacity={0.85}
                onPress={() => setSelectedRole('customer')}
              >
                <View style={styles.iconWrapper}>
                  <Text style={styles.cardEmoji}>🛒</Text>
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>Customer</Text>
                  <Text style={styles.cardDesc}>Browse local specialties, schedule pickups, and claim with secure QR codes.</Text>
                </View>
                <View style={[styles.radioButton, selectedRole === 'customer' && styles.radioSelected]} />
              </TouchableOpacity>

              {/* Vendor Option Card */}
              <TouchableOpacity 
                style={[
                  styles.roleCard, 
                  selectedRole === 'vendor' && styles.selectedCard
                ]}
                activeOpacity={0.85}
                onPress={() => setSelectedRole('vendor')}
              >
                <View style={styles.iconWrapper}>
                  <Text style={styles.cardEmoji}>🍳</Text>
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>Food Vendor</Text>
                  <Text style={styles.cardDesc}>Manage daily batch inventory, post menus, and track community landmark orders.</Text>
                </View>
                <View style={[styles.radioButton, selectedRole === 'vendor' && styles.radioSelected]} />
              </TouchableOpacity>
            </Animated.View>

            {/* Bottom Action Section */}
            <Animated.View 
              entering={FadeInDown.delay(600).duration(800).springify()}
              style={styles.footerSection}
            >
              <TouchableOpacity 
                style={[styles.submitBtn, !selectedRole && styles.disabledBtn]} 
                activeOpacity={selectedRole ? 0.9 : 1}
                onPress={handleContinue}
                disabled={!selectedRole}
              >
                <LinearGradient
                  colors={selectedRole ? ['#FFFFFF', '#FFF7ED'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.2)']}
                  style={styles.btnGradient}
                >
                  <Text style={[styles.btnText, !selectedRole && styles.disabledBtnText]}>Continue</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.loginLink}
                activeOpacity={0.7}
                onPress={() => router.push('/login')}
              >
                <Text style={styles.loginLinkText}>
                  Already have an account? <Text style={styles.signInHighlight}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>

          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#451A03'
  },
  glowCircleTop: {
    position: 'absolute',
    top: -width * 0.3,
    right: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  glowCircleBottom: {
    position: 'absolute',
    bottom: -width * 0.2,
    left: -width * 0.3,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingVertical: 16
  },
  topHeader: {
    paddingTop: 10
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  headerSection: {
    marginTop: 10,
    marginBottom: 10
  },
  title: { 
    fontSize: 34, 
    fontWeight: '900', 
    color: '#FFFFFF', 
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#FED7AA',
    lineHeight: 20,
  },
  cardsContainer: {
    gap: 16,
    marginVertical: 10
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 20,
  },
  selectedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: '#FFFFFF',
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#FFEDD5',
    lineHeight: 18,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  radioSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  footerSection: { 
    paddingBottom: 10
  },
  submitBtn: { 
    borderRadius: 18, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 6
  },
  disabledBtn: {
    shadowOpacity: 0,
    elevation: 0,
  },
  btnGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnText: { 
    color: '#451A03', 
    fontSize: 17, 
    fontWeight: '800',
    letterSpacing: 0.5
  },
  disabledBtnText: {
    color: 'rgba(69, 26, 3, 0.5)',
  },
  loginLink: { 
    marginTop: 20, 
    alignItems: 'center',
    paddingVertical: 6
  },
  loginLinkText: { 
    color: '#FFEDD5', 
    fontSize: 14,
    fontWeight: '500'
  },
  signInHighlight: {
    fontWeight: '800', 
    color: '#FFFFFF',
    textDecorationLine: 'underline'
  }
}); 