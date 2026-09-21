import { useRouter } from 'expo-router';
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
  Alert,
  ActivityIndicator
} from 'react-native';
import Animated, { 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
// Import the Supabase client
import { supabase } from '../Services/supabase';

const { width } = Dimensions.get('window');

// Toledo City Center Coordinates & Service Boundary Setup
const TOLEDO_CITY_CENTER = {
  latitude: 10.3788,
  longitude: 123.6425,
};
const MAX_RADIUS_KM = 15;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of Earth in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

export default function RegisterVendorScreen() {
  const router = useRouter();

  // Vendor Form States
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [cuisineSpecialty, setCuisineSpecialty] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Store Type & Security Verification Document States
  const [storeType, setStoreType] = useState<'home' | 'physical'>('home');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [ownerIdImage, setOwnerIdImage] = useState<string | null>(null);
  const [permitImage, setPermitImage] = useState<string | null>(null);
  const [storePhoto, setStorePhoto] = useState<string | null>(null);
  const [ownerIdAsset, setOwnerIdAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [permitAsset, setPermitAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [storePhotoAsset, setStorePhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [ownerIdType, setOwnerIdType] = useState('image/jpeg');
  const [permitType, setPermitType] = useState('image/jpeg');
  const [storePhotoType, setStorePhotoType] = useState('image/jpeg');

  // Fulfillment is limited to pickup and agreed meet-up locations.
  const [fulfillmentMode, setFulfillmentMode] = useState<'instore' | 'meetup' | 'both'>('instore');
  const [meetupDetails, setMeetupDetails] = useState('');

  // Flow step state ('form' vs 'otp' vs 'pending')
  const [step, setStep] = useState<'form' | 'otp' | 'pending'>('form');
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

  const validatePhoneNumber = (number: string) => {
    const phMobileRegex = /^09\d{9}$/;
    return phMobileRegex.test(number);
  };

  const pickOwnerId = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setOwnerIdImage(result.assets[0].uri);
      setOwnerIdAsset(result.assets[0]);
      setOwnerIdType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const pickPermit = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPermitImage(result.assets[0].uri);
      setPermitAsset(result.assets[0]);
      setPermitType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const pickStorePhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setStorePhoto(result.assets[0].uri);
      setStorePhotoAsset(result.assets[0]);
      setStorePhotoType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const uploadVerificationFile = async (asset: ImagePicker.ImagePickerAsset, userId: string, fileType: string, contentType: string) => {
    if (!asset) {
      throw new Error(`${fileType} image was not selected. Please choose the image again.`);
    }

    let file: Blob | ArrayBuffer;
    if (asset.file) {
      file = asset.file;
    } else if (asset.base64) {
      file = decode(asset.base64);
    } else {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('The selected image could not be read. Please choose it again.');
      file = await response.blob();
    }

    const fileSize = file instanceof Blob ? file.size : file.byteLength;
    if (!contentType.startsWith('image/') || fileSize < 100) {
      throw new Error('The selected file is not a valid image. Please choose a JPG or PNG photo.');
    }

    const extension = contentType.split('/')[1] || 'jpg';
    const path = `${userId}/${fileType}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('vendor-verification').upload(path, file, {
      contentType,
      upsert: false,
    });

    if (error) {
      throw new Error(`Storage upload failed for ${fileType}: ${error.message} (code: ${error.name || 'unknown'})`);
    }
    return path;
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
    return String(error);
  };

  const handleInitialSubmit = async () => {
    if (isSubmitting) return;

    if (!businessName || !ownerName || !email || !phone || !password || !cuisineSpecialty) {
      Alert.alert('Incomplete Fields', 'Please complete all required business details.');
      return;
    }

    if (!physicalAddress) {
      Alert.alert(
        'Address Required',
        storeType === 'home'
          ? 'Please enter your home kitchen address in Toledo City.'
          : 'Please enter your physical store address or market stall in Toledo City.'
      );
      return;
    }

    if (storeType === 'physical') {
      if (!storePhoto) {
        Alert.alert('Store Photo Required', 'Please upload a photo of your physical store/stall for admin verification.');
        return;
      }
    }

    if ((fulfillmentMode === 'meetup' || fulfillmentMode === 'both') && !meetupDetails.trim()) {
      Alert.alert('Meet-Up Details Required', 'Please specify your batch meet-up locations or schedules.');
      return;
    }

    if (!ownerIdImage) {
      Alert.alert('Owner ID Required', 'Please upload a valid government-issued ID for the owner.');
      return;
    }

    if (storeType === 'physical' && !permitImage) {
      Alert.alert('Business Permit Required', 'Please upload your Toledo business permit or DTI certificate.');
      return;
    }

    if (!validatePhoneNumber(phone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 11-digit Philippine mobile number starting with 09.');
      return;
    }

    setIsSubmitting(true);

    // --- AUTOMATIC LOCATION VERIFICATION ---
    let currentLat = 10.3768;
    let currentLng = 123.6384;

    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to verify that your kitchen is within Toledo City.');
        return;
      }

      let location = null;
      try {
        location = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000))
        ]) as Location.LocationObject;
      } catch (e) {
        location = await Location.getLastKnownPositionAsync();
      }

      if (location && location.coords) {
        currentLat = location.coords.latitude;
        currentLng = location.coords.longitude;
      }
    } catch (error) {
      Alert.alert('Location Warning', 'Could not detect exact GPS. Using default Toledo service zone center.');
    }

    // --- TOLEDO CITY BOUNDARY RADIUS VERIFICATION ---
    const distance = calculateDistance(
      currentLat, 
      currentLng, 
      TOLEDO_CITY_CENTER.latitude, 
      TOLEDO_CITY_CENTER.longitude
    );

    if (distance > MAX_RADIUS_KM) {
      Alert.alert(
        'Outside Service Area',
        `Your current location is about ${distance.toFixed(1)}km away from Toledo City center. ToledoGo vendor accounts are restricted to local service zones within ${MAX_RADIUS_KM}km.`
      );
      return;
    }

    console.log('GPS location verified:', JSON.stringify({
      latitude: currentLat,
      longitude: currentLng,
      distanceFromToledoCenterKm: Number(distance.toFixed(2)),
      maxAllowedDistanceKm: MAX_RADIUS_KM,
    }, null, 2));

    // Create the auth user and save the vendor application directly while OTP is disabled.
    let registrationStep = 'creating your account';
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            role: 'vendor', // Keep basic role in metadata if needed
          },
        },
      });

      if (signUpError) {
        Alert.alert('Registration Error', signUpError.message);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        Alert.alert('Error', 'No user session returned.');
        return;
      }

      console.log('Auth signup result:', JSON.stringify({
        userId: user.id,
        hasSession: Boolean(signUpData.session),
        emailConfirmedAt: user.email_confirmed_at,
      }, null, 2));

      if (!signUpData.session) {
        console.error('REGISTRATION STOPPED: Supabase returned no authenticated session. Email confirmation is probably enabled.');
        Alert.alert(
          'Email Confirmation Required',
          'Supabase created the account but did not sign you in. Disable email confirmation in Supabase Authentication settings before testing direct registration.'
        );
        return;
      }

      // Ensure Storage requests use the session returned by signup immediately.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: signUpData.session.access_token,
        refresh_token: signUpData.session.refresh_token,
      });
      if (sessionError) {
        throw new Error(`Could not establish the new account session: ${sessionError.message}`);
      }

      const { data: activeUser } = await supabase.auth.getUser();
      if (activeUser.user?.id !== user.id) {
        throw new Error('The new account session is not ready. Please try registration again.');
      }

      console.log('Auth user created with ID:', user.id);

      registrationStep = 'uploading your verification document';
      const ownerIdPath = await uploadVerificationFile(ownerIdAsset!, user.id, 'owner-id', ownerIdType);
      const permitPath = storeType === 'physical'
        ? await uploadVerificationFile(permitAsset!, user.id, 'permit', permitType)
        : null;
      const storePhotoPath = storePhoto
        ? await uploadVerificationFile(storePhotoAsset!, user.id, 'store-photo', storePhotoType)
        : null;

      registrationStep = 'saving your vendor application';
      const { error: vendorInsertError } = await supabase.from('vendors').insert({
        id: user.id,
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        store_type: storeType,
        physical_address: physicalAddress.trim() || null,
        fulfillment_mode: fulfillmentMode,
        meetup_details: meetupDetails.trim() || null,
        cuisine_specialty: cuisineSpecialty.trim(),
        owner_id_url: ownerIdPath,
        permit_url: permitPath,
        store_photo_url: storePhotoPath,
        verification_status: 'pending',
        admin_notes: null,
        is_verified: false,
      });

      if (vendorInsertError) {
        console.error('FULL VENDOR INSERT ERROR:', JSON.stringify(vendorInsertError, null, 2));
        Alert.alert('Database Error', `Failed to save vendor record: ${vendorInsertError.message}`);
        return;
      }

      console.log('Vendor record successfully saved!');

    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      console.error(`FULL REGISTRATION ERROR while ${registrationStep}:`, errorMessage, err);
      Alert.alert('Registration Error', `Could not finish ${registrationStep}. ${errorMessage}`);
      return;
    } finally {
      setIsSubmitting(false);
    }

    console.log('Location verified within Toledo City!');
    // OTP email verification temporarily disabled for testing.
    setStep('pending');
  };

  /* OTP verification temporarily disabled for testing.
  const handleVerifyOTP = async () => {
    console.log('Verify OTP button clicked. Code length:', otpCode.length);

    if (otpCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the full 6-digit verification code sent to your email.');
      return;
    }

    try {
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'signup',
      });

      if (otpError) {
        Alert.alert('Verification Error', otpError.message);
        return;
      }

      const user = otpData.user;
      if (!user) {
        Alert.alert('Verification Error', 'Your email was verified, but no user session was returned.');
        return;
      }

      console.log('User authenticated successfully with ID:', user.id);

      // Insert into vendors table
      const { error: vendorInsertError } = await supabase.from('vendors').insert({
        id: user.id,
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        store_type: storeType,
        physical_address: physicalAddress.trim() || null,
        fulfillment_mode: fulfillmentMode,
        meetup_details: meetupDetails.trim() || null,
        cuisine_specialty: cuisineSpecialty.trim(),
        is_verified: false,
      });

      if (vendorInsertError) {
        console.error('Vendor insert failed completely:', JSON.stringify(vendorInsertError, null, 2));
        Alert.alert('Database Error', `Failed to save vendor record: ${vendorInsertError.message}`);
        return;
      }

      console.log('Vendor record successfully saved!');

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: ownerName.trim(),
        business_name: businessName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: 'vendor',
        store_type: storeType,
        cuisine_specialty: cuisineSpecialty.trim(),
        is_verified: true,
      });

      if (upsertError) {
        console.log('Profile upsert error:', upsertError.message);
      }
    } catch (err: any) {
      Alert.alert('Database Error', err?.message ?? 'An unexpected error occurred while saving your vendor account.');
      return;
    }

    Alert.alert(
      'Success!',
      'Your account has been security-verified and registered.',
      [
        {
          text: 'GET STARTED',
          onPress: () => {
            setStep('pending');
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
              
              <Animated.View 
                entering={FadeInDown.delay(100).duration(600).springify()}
                style={styles.topHeader}
              >
                <TouchableOpacity 
                  style={styles.backButton}
                  onPress={() => {
                    if (step === 'otp') setStep('form');
                    else if (step === 'pending') router.replace('/login');
                    else if (router.canGoBack()) router.back();
                    else router.replace('/register');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>

                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>🍳 Secure Vendor Partner</Text>
                </View>
              </Animated.View>

              {/* STEP 1: VENDOR REGISTRATION FORM */}
              {step === 'form' && (
                <>
                  <Animated.View 
                    entering={FadeInDown.delay(200).duration(800).springify()}
                    style={styles.headerSection}
                  >
                    <Text style={styles.title}>Register Your Kitchen</Text>
                    <Text style={styles.subtitle}>
                      We vet all kitchens and local permits to maintain a trusted marketplace within Toledo City.
                    </Text>
                  </Animated.View>

                  <View style={styles.formContainer}>
                    
                    <Animated.View entering={FadeInDown.delay(220).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Kitchen Operation Type</Text>
                      <View style={styles.toggleRow}>
                        <TouchableOpacity 
                          style={[styles.toggleBtn, storeType === 'home' && styles.toggleBtnActive]}
                          onPress={() => {
                            setStoreType('home');
                            setPhysicalAddress(''); 
                            setStorePhoto(null);    
                            setStorePhotoAsset(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.toggleText, storeType === 'home' && styles.toggleTextActive]}>
                            🏠 Home-Based
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.toggleBtn, storeType === 'physical' && styles.toggleBtnActive]}
                          onPress={() => setStoreType('physical')}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.toggleText, storeType === 'physical' && styles.toggleTextActive]}>
                            🏪 Physical Store
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(250).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Business / Kitchen Name</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="e.g., Aling Nena's Lutong Bahay"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={businessName}
                        onChangeText={setBusinessName}
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        {storeType === 'home' ? 'Home Kitchen Address' : 'Physical Store Address / Landmark'}
                      </Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder={storeType === 'home' ? 'e.g., Barangay Tubod, Toledo City' : 'e.g., Stall 12, Toledo Public Market'}
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={physicalAddress}
                        onChangeText={setPhysicalAddress}
                      />
                    </Animated.View>

                    {storeType === 'physical' && (
                      <>
                        <Animated.View entering={FadeInDown.duration(450).springify()} style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Upload Store / Stall Photo</Text>
                          <TouchableOpacity 
                            style={styles.uploadBox}
                            onPress={pickStorePhoto}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.uploadBoxText}>
                              {storePhoto ? '✅ Store Photo Attached (Tap to Change)' : '📸 Upload Exterior / Stall Photo'}
                            </Text>
                          </TouchableOpacity>
                        </Animated.View>
                      </>
                    )}

                    <Animated.View entering={FadeInDown.delay(280).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Order Fulfillment Method</Text>
                      <View style={styles.toggleRow}>
                        <TouchableOpacity 
                          style={[styles.toggleBtn, fulfillmentMode === 'instore' && styles.toggleBtnActive]}
                          onPress={() => {
                            setFulfillmentMode('instore');
                            setMeetupDetails('');
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.toggleText, fulfillmentMode === 'instore' && styles.toggleTextActive]}>
                            🛍️ In-Store Pickup
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.toggleBtn, fulfillmentMode === 'meetup' && styles.toggleBtnActive]}
                          onPress={() => setFulfillmentMode('meetup')}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.toggleText, fulfillmentMode === 'meetup' && styles.toggleTextActive]}>
                            📍 Location Meet-Ups
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.toggleBtn, fulfillmentMode === 'both' && styles.toggleBtnActive]}
                          onPress={() => setFulfillmentMode('both')}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.toggleText, fulfillmentMode === 'both' && styles.toggleTextActive]}>
                            🛍️ + 📍 Both
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>

                    {(fulfillmentMode === 'meetup' || fulfillmentMode === 'both') && (
                      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Batch Meet-Up Spots & Schedule</Text>
                        <TextInput 
                          style={styles.textInput}
                          placeholder="e.g., Toledo Plaza (Fridays 4-6 PM)"
                          placeholderTextColor="rgba(255, 255, 255, 0.4)"
                          value={meetupDetails}
                          onChangeText={setMeetupDetails}
                        />
                      </Animated.View>
                    )}

                    <Animated.View entering={FadeInDown.delay(350).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Owner / Head Chef Full Name</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="e.g., Maria Santos"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={ownerName}
                        onChangeText={setOwnerName}
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(380).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Owner Government ID (Required)</Text>
                      <TouchableOpacity 
                        style={styles.uploadBox}
                        onPress={pickOwnerId}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.uploadBoxText}>
                          {ownerIdImage ? '✅ Owner ID Attached (Tap to Change)' : '📁 Upload Owner ID'}
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>

                    {storeType === 'physical' && (
                      <Animated.View entering={FadeInDown.delay(410).duration(800).springify()} style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Business Permit / DTI Certificate (Required)</Text>
                        <TouchableOpacity style={styles.uploadBox} onPress={pickPermit} activeOpacity={0.8}>
                          <Text style={styles.uploadBoxText}>
                            {permitImage ? '✅ Business Permit Attached (Tap to Change)' : '📁 Upload Business Permit'}
                          </Text>
                        </TouchableOpacity>
                      </Animated.View>
                    )}

                    <Animated.View entering={FadeInDown.delay(450).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Primary Food Specialty</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="e.g., Humba, Kakanin, Fresh Seafood"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={cuisineSpecialty}
                        onChangeText={setCuisineSpecialty}
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(550).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Business Email (For Verification)</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="kitchen@example.com"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(650).duration(800).springify()} style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Contact Mobile Number (11 Digits)</Text>
                      <TextInput 
                        style={styles.textInput}
                        placeholder="09123456789"
                        placeholderTextColor="rgba(255, 255, 255, 0.4)"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        maxLength={11}
                      />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(750).duration(800).springify()} style={styles.inputGroup}>
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

                    <Animated.View entering={FadeInDown.delay(850).duration(800).springify()} style={styles.buttonWrapper}>
                      <TouchableOpacity 
                        style={styles.submitBtn} 
                        activeOpacity={0.9}
                        onPress={handleInitialSubmit}
                        disabled={isSubmitting}
                      >
                        <LinearGradient colors={['#FFFFFF', '#FFF7ED']} style={styles.btnGradient}>
                          {isSubmitting ? <ActivityIndicator color="#451A03" /> : <Text style={styles.btnText}>Verify Location & Send Email OTP</Text>}
                        </LinearGradient>
                      </TouchableOpacity>
                      <Text style={styles.helperText}>Requires location permissions enabled on your device.</Text>
                    </Animated.View>
                  </View>
                </>
              )}

              {/* STEP 2: EMAIL OTP VERIFICATION - temporarily disabled for testing */}
              {false && (
                <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.otpContainer}>
                  <Text style={styles.title}>Email Verification</Text>
                  <Text style={styles.subtitle}>
                    We've sent a 6-digit confirmation code to your business email <Text style={{color: '#FFF', fontWeight: '700'}}>{email}</Text>. Enter it below to complete registration.
                  </Text>

                  <View style={[styles.inputGroup, {marginTop: 20}]}>
                    <Text style={styles.inputLabel}>Enter 6-Digit Email Code</Text>
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
                      <Text style={styles.btnText}>Verify Email & Submit Application</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* STEP 3: PENDING APPROVAL SCREEN */}
              {step === 'pending' && (
                <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.pendingContainer}>
                  <Text style={styles.pendingEmoji}>⏳</Text>
                  <Text style={styles.title}>Pending Admin Approval</Text>
                  <Text style={styles.subtitle}>
                    Thank you for registering <Text style={{color: '#FFF', fontWeight: '700'}}>{businessName}</Text>! Your kitchen zone within Toledo City has been successfully verified. Our administrators are reviewing your permits for marketplace compliance.
                  </Text>

                  <View style={styles.pendingCard}>
                    <Text style={styles.pendingCardTitle}>What happens next?</Text>
                    <Text style={styles.pendingCardText}>• Admins verify your permits or clearance.</Text>
                    <Text style={styles.pendingCardText}>• Your store location is auto-mapped.</Text>
                    <Text style={styles.pendingCardText}>• You will receive an email once approved to start listing your specialties.</Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.submitBtn, {marginTop: 25}]} 
                    activeOpacity={0.9}
                    onPress={() => router.replace('/login')}
                  >
                    <LinearGradient colors={['#FFFFFF', '#FFF7ED']} style={styles.btnGradient}>
                      <Text style={styles.btnText}>Back to Sign In</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {step === 'form' && (
                <Animated.View entering={FadeInDown.delay(950).duration(800).springify()} style={styles.footerSection}>
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
              )}

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
  title: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#FED7AA', lineHeight: 18 },
  formContainer: { marginBottom: 10 },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  toggleText: {
    color: '#FED7AA',
    fontWeight: '700',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#451A03',
  },
  uploadBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderStyle: 'dashed'
  },
  uploadBoxText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  otpContainer: { marginTop: 20, flex: 1, justifyContent: 'center' },
  pendingContainer: { marginTop: 20, flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  pendingEmoji: { fontSize: 50, marginBottom: 15, textAlign: 'center' },
  pendingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginTop: 20,
  },
  pendingCardTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, marginBottom: 8 },
  pendingCardText: { color: '#FED7AA', fontSize: 13, lineHeight: 20 },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#FFEDD5', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  helperText: { fontSize: 10, color: '#FED7AA', marginTop: 6, marginLeft: 4, textAlign: 'center' },
  buttonWrapper: { marginTop: 10 },
  submitBtn: { 
    borderRadius: 18, 
    overflow: 'hidden',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 6
  },
  btnGradient: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#451A03', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  footerSection: { alignItems: 'center', paddingVertical: 10 },
  switchLink: { paddingVertical: 6 },
  switchLinkText: { color: '#FFEDD5', fontSize: 14, fontWeight: '500' },
  highlightText: { fontWeight: '800', color: '#FFFFFF', textDecorationLine: 'underline' }
});