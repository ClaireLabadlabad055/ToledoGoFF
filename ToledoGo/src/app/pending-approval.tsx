import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { 
  Dimensions, 
  StatusBar, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View 
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function PendingApprovalScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#451A03" />
      
      <LinearGradient
        colors={['#451A03', '#7C2D12', '#C2410C']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.content}>
            
            <Animated.View entering={FadeInDown.delay(200).duration(800).springify()} style={styles.iconContainer}>
              <Text style={styles.iconEmoji}>⏳</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(800).springify()} style={styles.textSection}>
              <Text style={styles.title}>Under Admin Review</Text>
              <Text style={styles.subtitle}>
                Your registration has been successfully submitted! Our local administration is currently verifying your documents and details to maintain security for Toledo City marketplaces.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(800).springify()} style={styles.cardBox}>
              <Text style={styles.cardTitle}>What happens next?</Text>
              <Text style={styles.cardText}>• Admins check your submitted permits or ID files.</Text>
              <Text style={styles.cardText}>• You will receive an email confirmation once approved.</Text>
              <Text style={styles.cardText}>• You can then log in to manage orders and batch schedules.</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500).duration(800).springify()} style={styles.buttonWrapper}>
              <TouchableOpacity 
                style={styles.submitBtn} 
                activeOpacity={0.9}
                onPress={() => router.replace('/login')}
              >
                <LinearGradient colors={['#FFFFFF', '#FFF7ED']} style={styles.btnGradient}>
                  <Text style={styles.btnText}>Return to Sign In</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#451A03' },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.15),',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 24,
  },
  iconEmoji: { fontSize: 40 },
  textSection: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', marginBottom: 10, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#FED7AA', lineHeight: 20, textAlign: 'center' },
  cardBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 30,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#FFEDD5', marginBottom: 10 },
  cardText: { fontSize: 13, color: '#FED7AA', lineHeight: 20, marginBottom: 4 },
  buttonWrapper: { width: '100%' },
  submitBtn: { 
    borderRadius: 18, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 6
  },
  btnGradient: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#451A03', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});