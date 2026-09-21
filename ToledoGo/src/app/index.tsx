import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect } from 'react';
import { Dimensions, Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function LandingPage() {
  const router = useRouter();

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

  return (
    <View style={styles.container}>
      {/* Status bar matching the rich warm brown/orange market theme */}
      <StatusBar barStyle="light-content" backgroundColor="#451A03" />
      
      {/* Dynamic Warm Gradient Background matching brown and orange tones */}
      <LinearGradient
        colors={['#451A03', '#7C2D12', '#C2410C']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Decorative Modern Glowing Animated Backdrop Elements */}
        <Animated.View style={[styles.glowCircleTop, topGlowStyle]} />
        <Animated.View style={[styles.glowCircleBottom, bottomGlowStyle]} />

        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.contentWrapper}>
            
            {/* Top Glassmorphic Badge Header */}
            <Animated.View 
              entering={FadeInDown.delay(200).duration(800).springify()} 
              style={styles.topHeader}
            >
              <View style={styles.glassBadge}>
                <View style={styles.badgePulse} />
                <Text style={styles.badgeText}>Toledo City's Home-Based Food Market</Text>
              </View>
            </Animated.View>

            {/* 🎯 CENTERED HERO SECTION */}
            <View style={styles.centerContent}>
              
              {/* Extra Layered Glass Logo Card */}
              <Animated.View 
                entering={FadeInDown.delay(400).duration(800).springify()}
                style={styles.logoOuterGlow}
              >
                <View style={styles.logoWrapper}>
                  {/* Replace 'logo.png' in assets/images/ with your actual logo file */}
                  <Image 
                    source={require('../../assets/images/logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </Animated.View>

              <Animated.Text 
                entering={FadeInDown.delay(600).duration(800).springify()}
                style={styles.appName}
              >
                ToledoGo
              </Animated.Text>

              <Animated.Text 
                entering={FadeInDown.delay(750).duration(800).springify()}
                style={styles.tagline}
              >
                An Integrated Order Management & QR-Verified Pick-Up System
              </Animated.Text>

              <Animated.Text 
                entering={FadeInDown.delay(900).duration(800).springify()}
                style={styles.description}
              >
                Empowering Toledo City's home-based food vendors with batch inventory control, community landmark pickups, and secure QR-verified claims.
              </Animated.Text>

              {/* Glassmorphic Feature Pills with Icons */}
              <Animated.View 
                entering={FadeInDown.delay(1050).duration(800).springify()}
                style={styles.pillContainer}
              >
                <View style={styles.pill}>
                  <Text style={styles.pillIcon}>🍳</Text>
                  <Text style={styles.pillText}>Batch Controlled</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillIcon}>📍</Text>
                  <Text style={styles.pillText}>Landmark Pickup</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillIcon}>📲</Text>
                  <Text style={styles.pillText}>QR Verified</Text>
                </View>
              </Animated.View>
            </View>

            {/* BOTTOM ACTION SECTION */}
            <Animated.View 
              entering={FadeInUp.delay(1200).duration(800).springify()}
              style={styles.footerSection}
            >
              <View style={styles.actionArea}>
               <TouchableOpacity 
  style={styles.getStartedBtn} 
  activeOpacity={0.9}
  onPress={() => router.push('/register')} // This connects it to app/register.tsx
>
  <LinearGradient
    colors={['#FFFFFF', '#FFF7ED']}
    style={styles.btnGradient}
  >
    <Text style={styles.btnText}>Get Started</Text>
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
              </View>

              <Text style={styles.footer}>
                © 2026 ToledoGo • Capstone Project
              </Text>
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
    alignItems: 'center',
    paddingTop: 10
  },
  glassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgePulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FDBA74',
    marginRight: 8
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5
  },
  centerContent: { 
    alignItems: 'center', 
    marginTop: -10
  },
  logoOuterGlow: {
    padding: 6,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  logoWrapper: { 
    width: 92, 
    height: 92, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 28, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  logoImage: {
    width: 52,
    height: 52,
  },
  appName: { 
    fontSize: 42, 
    fontWeight: '900', 
    color: '#FFFFFF', 
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FED7AA',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 10
  },
  description: { 
    fontSize: 14, 
    color: '#FFEDD5', 
    textAlign: 'center', 
    lineHeight: 22, 
    paddingHorizontal: 10,
    fontWeight: '400',
    marginBottom: 24
  },
  pillContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    flexWrap: 'wrap',
    gap: 8
  },
  pill: { 
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.12)', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center'
  },
  pillIcon: {
    fontSize: 12,
    marginRight: 6
  },
  pillText: { 
    color: '#FFFFFF', 
    fontSize: 11, 
    fontWeight: '600' 
  },
  footerSection: { 
    width: '100%',
    paddingBottom: 10
  },
  actionArea: { 
    width: '100%' 
  },
  getStartedBtn: { 
    borderRadius: 18, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 6
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
  loginLink: { 
    marginTop: 20, 
    alignItems: 'center',
    paddingVertical: 6
  },
  loginLinkText: { 
    color: '#FFEDD5', 
    fontSize: 15,
    fontWeight: '500'
  },
  signInHighlight: {
    fontWeight: '800', 
    color: '#FFFFFF',
    textDecorationLine: 'underline'
  },
  footer: {
    color: 'rgba(255, 255, 255, 0.6)', 
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '500',
    letterSpacing: 0.5
  }
});