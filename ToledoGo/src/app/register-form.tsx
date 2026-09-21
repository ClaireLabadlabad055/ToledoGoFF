import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { 
  Dimensions, 
  StatusBar, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Alert 
} from 'react-native';
import Animated, { 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

// Import location services and expo-location for manual capture
import * as Location from 'expo-location';
import { verifyUserLocation } from '../Services/locationService';
// Import the Supabase client
import { supabase } from '../Services/supabase';

const { width } = Dimensions.get('window');

export default function RegisterVendorFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const role = (params.role as string) || 'vendor';
  const isVendor = role === 'vendor';

  // Form states (Preserving all your original fields + GPS states)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  
  // Verification step state ('form' vs 'otp')
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpCode, setOtpCode] = useState('');

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

  // Validate Philippine Mobile Number (Must start with 09 and be exactly 11 digits)
  const validatePhoneNumber = (number: string) => {
    const phMobileRegex = /^09\d{9}$/;
    return phMobileRegex.test(number);
  };

  // --- SAFE & NON-BLOCKING MANUAL GPS FETCH HANDLER ---
  const fetchCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to map your kitchen location in Toledo City.');
        setLocationLoading(false);
        return;
      }

      // Try fetching live high-accuracy position with a safety catch/timeout
      let location = null;
      try {
        location = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000))
        ]) as Location.LocationObject;
      } catch (e) {
        // Fallback to last known position if live GPS takes too long
        location = await Location.getLastKnownPositionAsync();
      }

      if (location && location.coords) {
        setLatitude(location.coords.latitude);
        setLongitude(location.coords.longitude);
        Alert.alert('GPS Captured Successfully!', `Lat: ${location.coords.latitude.toFixed(4)}, Lng: ${location.coords.longitude.toFixed(4)}`);
      } else {
        // Ultimate fallback to Toledo City center coordinates if GPS fails entirely
        setLatitude(10.3768);
        setLongitude(123.6384);
        Alert.alert('Default Pin Set', 'Could not lock precise GPS signal. Pinned to central Toledo City as a default.');
      }
    } catch (error) {
      Alert.alert('Location Error', 'Unable to retrieve GPS coordinates. Please ensure device location is enabled.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleInitialSubmit = async () => {
    if (!fullName || !email || !phone || !password) {
      Alert.alert('Incomplete Fields', 'Please fill in all required fields to secure your account.');
      return;
    }

    if (!validatePhoneNumber(phone)) {
      Alert.alert(
        'Invalid Phone Number', 
        'To ensure scam prevention, please enter a valid 11-digit Philippine mobile number starting with 09 (e.g., 09123456789).'
      );
      return;
    }

    // Vendors need a location; customers do not.
    if (isVendor && (!latitude || !longitude)) {
      setLatitude(10.3768);
      setLongitude(123.6384);
    }

    // --- SUPABASE SIGN UP AND DIRECT CUSTOMER SAVE ---
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            role: role,
            ...(isVendor && {
              latitude: latitude || 10.3768,
              longitude: longitude || 123.6384,
            }),
          },
        },
      });

      if (error) {
        Alert.alert('Registration Error', error.message);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        Alert.alert('Registration Error', 'No user was returned after signup.');
        return;
      }

      if (!signUpData.session) {
        console.error('CUSTOMER SAVE STOPPED: Signup returned no authenticated session.');
        Alert.alert('Registration Error', 'Supabase did not create an active session. Disable email confirmation while testing direct registration.');
        return;
      }

      const { error: customerUpsertError } = await supabase.from('customers').upsert({
        id: user.id,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: role,
        is_verified: false,
      });

      if (customerUpsertError) {
        console.error('FULL CUSTOMER UPSERT ERROR:', JSON.stringify(customerUpsertError, null, 2));
        Alert.alert('Database Error', `Failed to save customer record: ${customerUpsertError.message}`);
        return;
      }

      console.log('Customer record successfully saved!', user.id);
    } catch (err: any) {
      console.error('FULL CUSTOMER SAVE ERROR:', JSON.stringify(err, null, 2));
      Alert.alert('Database Error', err?.message ?? 'An unexpected error occurred during registration.');
      return;
    }

    // OTP email verification temporarily disabled for testing.
    Alert.alert('Success!', 'Your customer account has been registered.', [
      {
        text: 'GET STARTED',
        onPress: () => router.replace('/pending-approval'),
      },
    ]);
  };

  /* OTP verification temporarily disabled for testing.
  const handleVerifyOTP = async () => {
    if (otpCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the full 6-digit verification code sent to your email and phone.');
      return;
    }

    try {
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'signup',
      });

      if (otpError) {
        console.error('FULL CUSTOMER OTP ERROR:', JSON.stringify(otpError, null, 2));
        Alert.alert('Verification Error', otpError.message);
        return;
      }

      const user = otpData.user;
      if (!user) {
        console.error('CUSTOMER SAVE FAILED: No authenticated user was returned.');
        Alert.alert('Database Error', 'Your account was verified, but no authenticated user was available to save the customer record.');
        return;
      }

      const { error: customerUpsertError } = await supabase.from('customers').upsert({
        id: user.id,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: role,
        latitude: latitude || 10.3768,
        longitude: longitude || 123.6384,
        is_verified: true,
      });

      if (customerUpsertError) {
        console.error('FULL CUSTOMER UPSERT ERROR:', JSON.stringify(customerUpsertError, null, 2));
        Alert.alert('Database Error', `Failed to save customer record: ${customerUpsertError.message}`);
        return;
      }

      console.log('Customer record successfully saved!', user.id);
    } catch (err) {
      console.error('FULL CUSTOMER SAVE ERROR:', JSON.stringify(err, null, 2));
      Alert.alert('Database Error', 'An unexpected error occurred while saving your customer record.');
      return;
    }

    Alert.alert(
      'Success!',
      'Your account has been security-verified and registered.',
      [
        {
          text: 'GET STARTED',
          onPress: () => {
            router.replace('/pending-approval');
          },
        },
      ]
    );
  };
  */

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
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              
              {/* Top Navigation / Back Button */}
              <Animated.View 
                entering={FadeInDown.delay(100).duration(600).springify()}
                style={styles.topHeader}
              >
                <TouchableOpacity 
                  style={styles.backButton}
                  onPress={() => {
                    if (step === 'otp') setStep('form');
                    else if (router.canGoBack()) router.back();
                    else router.replace('/register');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>

                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {isVendor ? '🍳 Vendor Account' : '🛡️ Secure Customer Signup'}
                  </Text>
                </View>
              </Animated.View>

              {/* STEP 1: INITIAL REGISTRATION FORM */}
              {step === 'form' ? (
                <>
                  <Animated.View 
                    entering={FadeInDown.delay(200).duration(800).springify()}
                    style={styles.headerSection}
                  >
                    <Text style={styles.title}>
                      {isVendor ? 'Create Vendor Account' : 'Create Customer Account'}
                    </Text>
                    <Text style={styles.subtitle}>
                      {isVendor 
                        ? 'Set up your vendor credentials and pin your store location.' 
                        : 'We verify mobile numbers and GPS location to protect customers and vendors.'}
                    </Text>
                  </Animated.View>

                  <View style={styles.formContainer}>
                    <Animated.View entering={FadeInDown.delay(300).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        {isVendor ? 'Business Name' : 'Full Name'}
                      </Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder={isVendor ? "e.g., Aling Nena's Kitchen" : "e.g., Maria Santos"}
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={fullName}
                        onChangeText={setFullName}
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(400).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Email Address</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="name@example.com"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(500).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Mobile Number (11 Digits)</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="09123456789"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        maxLength={11}
                      />
                      <Text style={styles.helperText}>Must start with 09 (PH Standard)</Text>
                    </Animated.View>

                    {isVendor && (
                      <Animated.View entering={FadeInDown.delay(550).duration(800).springify()} style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Store / Kitchen GPS Location</Text>
                        <TouchableOpacity 
                          style={[styles.textInput, {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}]}
                          onPress={fetchCurrentLocation}
                          activeOpacity={0.8}
                        >
                          <Text style={{color: latitude ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)', fontSize: 15}}>
                            {latitude && longitude ? `Pinned: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Tap to Capture Current GPS Location'}
                          </Text>
                          <Text style={{color: '#FED7AA', fontWeight: '700'}}>{locationLoading ? 'Locating...' : '📍 Pin'}</Text>
                        </TouchableOpacity>
                        <Text style={styles.helperText}>Required to place your store on the Toledo map.</Text>
                      </Animated.View>
                    )}

                    <Animated.View entering={FadeInDown.delay(600).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Password</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="At least 6 characters"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(750).duration(800).springify()} style={styles.buttonWrapper}>
                      <TouchableOpacity 
                        style={styles.submitBtn} 
                        activeOpacity={0.9}
                        onPress={handleInitialSubmit}
                      >
                        <LinearGradient colors={['#FFFFFF', '#FFF7ED']} style={styles.btnGradient}>
                          <Text style={styles.btnText}>Continue & Verify</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                </>
              ) : (
                /* STEP 2: SECURITY OTP VERIFICATION */
                <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.otpContainer}>
                  <Text style={styles.title}>Security Verification</Text>
                  <Text style={styles.subtitle}>
                    We've sent a 6-digit confirmation code to your email <Text style={{color: '#FFF', fontWeight: '700'}}>{email}</Text> and SMS <Text style={{color: '#FFF', fontWeight: '700'}}>{phone}</Text>.
                  </Text>

                  <View style={[styles.inputGroup, {marginTop: 20}]}>
                    <Text style={styles.inputLabel}>Enter 6-Digit Code</Text>
                    <TextInput 
                      style={[styles.textInput, {textAlign: 'center', fontSize: 24, letterSpacing: 8}]}
                      placeholder="123456"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <TouchableOpacity 
                    style={[styles.submitBtn, {marginTop: 20}]} 
                    activeOpacity={0.9}
                    onPress={() => {
                      // OTP email verification temporarily disabled for testing.
                    }}
                  >
                    <LinearGradient colors={['#FFFFFF', '#FFF7ED']} style={styles.btnGradient}>
                      <Text style={styles.btnText}>Verify & Complete</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Footer Switch */}
              <Animated.View entering={FadeInDown.delay(900).duration(800).springify()} style={styles.footerSection}>
                <TouchableOpacity 
                  style={styles.switchLink}
                  activeOpacity={0.7}
                  onPress={() => router.push('/login')}
                >
                  <Text style={styles.switchLinkText}>
                    Already have an account? <Text style={styles.highlightText}>Sign In</Text>
                  </Text>
                </TouchableOpacity>
              </Animated.View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#451A03' },
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
  scrollContent: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginBottom: 20
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  roleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  headerSection: { marginBottom: 20 },
  title: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#FED7AA', lineHeight: 18 },
  formContainer: { marginBottom: 10 },
  otpContainer: { marginTop: 20, flex: 1, justifyContent: 'center' },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#FFEDD5', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  textInput: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  helperText: { fontSize: 10, color: '#FED7AA', marginTop: 4, marginLeft: 4 },
  buttonWrapper: { marginTop: 10 },
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
  btnText: { color: '#451A03', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  footerSection: { alignItems: 'center', paddingVertical: 10 },
  switchLink: { paddingVertical: 6 },
  switchLinkText: { color: '#FFEDD5', fontSize: 14, fontWeight: '500' },
  highlightText: { fontWeight: '800', color: '#FFFFFF', textDecorationLine: 'underline' }
});