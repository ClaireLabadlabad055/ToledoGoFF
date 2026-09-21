import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { decode } from 'base64-arraybuffer';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';
import {
  CustomerPreferences,
  FavoriteKitchen,
  getCustomerPreferences,
  saveCustomerPreferences,
} from '../../Services/customerPreferences';

interface CustomerProfile {
  full_name?: string | null;
  phone?: string | null;
  profile_photo_url?: string | null;
}

const initialPreferences: CustomerPreferences = {
  defaultAddress: '',
  orderUpdates: true,
  localPicks: true,
  favorites: [],
};

type ProfilePanel = 'profile' | 'saved' | 'preferences' | 'security' | null;

export default function CustomerProfileScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferences, setPreferences] = useState(initialPreferences);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingPasswordEmail, setSendingPasswordEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ProfilePanel>(null);

  const loadProfile = useCallback(async () => {
    try {
      setError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError || !user) {
        router.replace('/login');
        return;
      }

      const [{ data: customer, error: customerError }, storedPreferences] = await Promise.all([
        supabase.from('customers').select('full_name, phone, profile_photo_url').eq('id', user.id).maybeSingle(),
        getCustomerPreferences(user.id),
      ]);

      if (customerError) throw customerError;
      const profile = (customer ?? {}) as CustomerProfile;
      setUserId(user.id);
      setEmail(user.email ?? '');
      setFullName(profile.full_name ?? user.user_metadata?.full_name ?? '');
      setPhone(profile.phone ?? user.user_metadata?.phone ?? '');
      setAvatarPath(profile.profile_photo_url ?? null);
      if (profile.profile_photo_url) {
        const { data: signedAvatar } = await supabase.storage.from('customer-avatars').createSignedUrl(profile.profile_photo_url, 3600);
        setAvatarUri(signedAvatar?.signedUrl ?? null);
      }
      setPreferences(storedPreferences);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      await loadProfile();
      if (!isMounted) return;
    };

    runLoad();
    return () => {
      isMounted = false;
    };
  }, [loadProfile]);

  const updatePreference = async (key: keyof Pick<CustomerPreferences, 'orderUpdates' | 'localPicks'>, value: boolean) => {
    const nextPreferences = { ...preferences, [key]: value };
    setPreferences(nextPreferences);
    await saveCustomerPreferences(userId, nextPreferences);
  };

  const saveProfile = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Missing details', 'Add your name and phone number before saving.');
      return;
    }

    setSaving(true);
    const { error: customerError } = await supabase
      .from('customers')
      .update({ full_name: fullName.trim(), phone: phone.trim() })
      .eq('id', userId);

    if (customerError) {
      Alert.alert('Could not save profile', customerError.message);
    } else {
      await supabase.auth.updateUser({ data: { full_name: fullName.trim(), phone: phone.trim() } });
      await saveCustomerPreferences(userId, preferences);
      Alert.alert('Profile saved', 'Your personal information and delivery preferences are up to date.');
    }
    setSaving(false);
  };

  const sendPasswordResetEmail = async () => {
    if (!email) return;
    setSendingPasswordEmail(true);
    const { error: passwordError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setSendingPasswordEmail(false);
    if (passwordError) {
      Alert.alert('Could not send confirmation email', passwordError.message);
      return;
    }
    Alert.alert('Check your email', `We sent a password-change confirmation link to ${email}. Open it to choose your new password.`);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const uploadAvatar = async (base64: string, localUri: string) => {
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      const nextPath = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('customer-avatars').upload(nextPath, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase.from('customers').update({ profile_photo_url: nextPath }).eq('id', userId);
      if (profileError) throw profileError;

      if (avatarPath) await supabase.storage.from('customer-avatars').remove([avatarPath]);
      const { data: signedAvatar } = await supabase.storage.from('customer-avatars').createSignedUrl(nextPath, 3600);
      setAvatarPath(nextPath);
      setAvatarUri(signedAvatar?.signedUrl ?? localUri);
      Alert.alert('Profile photo updated', 'Your new photo is now visible on your profile and dashboard.');
    } catch (uploadError: any) {
      Alert.alert('Could not update photo', uploadError.message ?? 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset?.base64) {
      setAvatarUri(asset.uri);
      await uploadAvatar(asset.base64, asset.uri);
    }
  };

  const deleteAvatar = async () => {
    if (!userId || !avatarPath) return;
    setUploadingAvatar(true);
    try {
      const { error: removeError } = await supabase.storage.from('customer-avatars').remove([avatarPath]);
      if (removeError) throw removeError;
      const { error: profileError } = await supabase.from('customers').update({ profile_photo_url: null }).eq('id', userId);
      if (profileError) throw profileError;
      setAvatarPath(null);
      setAvatarUri(null);
    } catch (removeError: any) {
      Alert.alert('Could not delete photo', removeError.message ?? 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const initials = fullName.trim()
    ? fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : 'TG';

  const togglePanel = (panel: Exclude<ProfilePanel, null>) => {
    setActivePanel((current) => current === panel ? null : panel);
  };

  const renderFavorite = (favorite: FavoriteKitchen) => (
    <TouchableOpacity
      key={favorite.id}
      style={styles.favoriteRow}
      onPress={() => router.push({ pathname: '/customer/vendor/[id]', params: { id: favorite.id } })}
      activeOpacity={0.85}
    >
      <LinearGradient colors={favorite.store_type === 'physical' ? ['#7C2D12', '#C2410C'] : ['#9F1239', '#E11D48']} style={styles.favoriteIcon}>
        <MaterialCommunityIcons name={favorite.store_type === 'physical' ? 'storefront-outline' : 'home-heart'} size={20} color="#FFF7ED" />
      </LinearGradient>
      <View style={styles.favoriteCopy}>
        <Text style={styles.favoriteName} numberOfLines={1}>{favorite.business_name}</Text>
        <Text style={styles.favoriteDetail} numberOfLines={1}>{favorite.cuisine_specialty || favorite.physical_address || 'Local Toledo kitchen'}</Text>
      </View>
      <Feather name="chevron-right" size={18} color="#A8A29E" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F2" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <LinearGradient colors={['#7C2D12', '#C2410C', '#F97316']} style={styles.profileHero}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/customer/dashboard')} accessibilityLabel="Back to dashboard">
                <Feather name="arrow-left" size={19} color="#7C2D12" />
              </TouchableOpacity>
              <View style={styles.heroPatternOne} />
              <View style={styles.heroPatternTwo} />
              <TouchableOpacity style={styles.avatar} onPress={pickAvatar} disabled={uploadingAvatar} accessibilityLabel="Change profile photo">
                {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
                <View style={styles.avatarCamera}><Feather name="camera" size={12} color="#FFFFFF" /></View>
              </TouchableOpacity>
              <Text style={styles.heroName}>{fullName || 'ToledoGo customer'}</Text>
              <Text style={styles.heroEmail}>{email || 'Your local food account'}</Text>
              <Text style={styles.heroCaption}>Local food, made personal.</Text>
              {avatarPath ? <TouchableOpacity style={styles.deleteAvatarButton} onPress={deleteAvatar} disabled={uploadingAvatar}><Feather name="trash-2" size={12} color="#FFF7ED" /><Text style={styles.deleteAvatarText}>Remove photo</Text></TouchableOpacity> : <Text style={styles.avatarHint}>{uploadingAvatar ? 'Updating photo...' : 'Tap your photo to change it'}</Text>}
            </LinearGradient>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}

            {!loading ? <View style={styles.menuSheet}>
              <TouchableOpacity style={styles.menuRow} onPress={() => togglePanel('profile')}>
                <View style={styles.menuIcon}><Feather name="edit-3" size={17} color="#C2410C" /></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Edit profile</Text><Text style={styles.menuSubtitle}>Name, phone, and barangay address</Text></View>
                <Feather name={activePanel === 'profile' ? 'chevron-down' : 'chevron-right'} size={16} color="#A8A29E" />
              </TouchableOpacity>
              {activePanel === 'profile' ? <View style={styles.panel}>
                <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Personal information</Text><Text style={styles.sectionSubtitle}>The details kitchens use to prepare your order.</Text></View><Feather name="edit-3" size={18} color="#C2410C" /></View>
                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your full name" placeholderTextColor="#A8A29E" />
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={styles.readOnlyInput}><Feather name="mail" size={15} color="#A8A29E" /><Text style={styles.readOnlyText}>{email}</Text></View>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="09XXXXXXXXX" placeholderTextColor="#A8A29E" keyboardType="phone-pad" />
                <Text style={styles.fieldLabel}>Default delivery / barangay address</Text>
                <TextInput style={[styles.input, styles.addressInput]} value={preferences.defaultAddress} onChangeText={(defaultAddress) => setPreferences({ ...preferences, defaultAddress })} placeholder="Street, barangay, Toledo City" placeholderTextColor="#A8A29E" multiline />
                <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="check" size={16} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Save profile</Text></>}
                </TouchableOpacity>
              </View> : null}

              <TouchableOpacity style={styles.menuRow} onPress={() => togglePanel('saved')}>
                <View style={[styles.menuIcon, styles.menuIconRose]}><Feather name="bookmark" size={17} color="#9F1239" /></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Saved kitchens</Text><Text style={styles.menuSubtitle}>{preferences.favorites.length ? `${preferences.favorites.length} local maker${preferences.favorites.length === 1 ? '' : 's'} saved` : 'Your favorite local makers'}</Text></View>
                <Feather name={activePanel === 'saved' ? 'chevron-down' : 'chevron-right'} size={16} color="#A8A29E" />
              </TouchableOpacity>
              {activePanel === 'saved' ? <View style={styles.panel}>
                <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Saved kitchens</Text><Text style={styles.sectionSubtitle}>Your quick bookmarks for local makers.</Text></View><Feather name="bookmark" size={18} color="#C2410C" /></View>
                {preferences.favorites.length > 0 ? preferences.favorites.map(renderFavorite) : <View style={styles.emptyFavorites}><Feather name="bookmark" size={22} color="#C2410C" /><Text style={styles.emptyTitle}>No saved kitchens yet</Text><Text style={styles.emptyText}>Tap the bookmark on a kitchen page to keep it close.</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/customer/explore')}><Text style={styles.secondaryButtonText}>Explore kitchens</Text><Feather name="arrow-up-right" size={15} color="#C2410C" /></TouchableOpacity></View>}
              </View> : null}

              <TouchableOpacity style={styles.menuRow} onPress={() => togglePanel('preferences')}>
                <View style={[styles.menuIcon, styles.menuIconGold]}><Feather name="sliders" size={17} color="#B45309" /></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Order preferences</Text><Text style={styles.menuSubtitle}>Updates and local recommendations</Text></View>
                <Feather name={activePanel === 'preferences' ? 'chevron-down' : 'chevron-right'} size={16} color="#A8A29E" />
              </TouchableOpacity>
              {activePanel === 'preferences' ? <View style={styles.panel}>
                <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Preferences</Text><Text style={styles.sectionSubtitle}>Tune what ToledoGo keeps in touch about.</Text></View><Feather name="sliders" size={18} color="#C2410C" /></View>
                <View style={styles.preferenceRow}><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Order updates</Text><Text style={styles.preferenceDetail}>Get notified when a kitchen confirms your order.</Text></View><Switch value={preferences.orderUpdates} onValueChange={(value) => updatePreference('orderUpdates', value)} trackColor={{ false: '#E7D9CC', true: '#FDBA74' }} thumbColor={preferences.orderUpdates ? '#C2410C' : '#A8A29E'} /></View>
                <View style={styles.preferenceRow}><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Local picks</Text><Text style={styles.preferenceDetail}>See seasonal Toledo makers and weekend favorites.</Text></View><Switch value={preferences.localPicks} onValueChange={(value) => updatePreference('localPicks', value)} trackColor={{ false: '#E7D9CC', true: '#FDBA74' }} thumbColor={preferences.localPicks ? '#C2410C' : '#A8A29E'} /></View>
              </View> : null}

              <TouchableOpacity style={styles.menuRow} onPress={() => togglePanel('security')}>
                <View style={[styles.menuIcon, styles.menuIconGreen]}><Feather name="lock" size={17} color="#166534" /></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Privacy & security</Text><Text style={styles.menuSubtitle}>Password and account access</Text></View>
                <Feather name={activePanel === 'security' ? 'chevron-down' : 'chevron-right'} size={16} color="#A8A29E" />
              </TouchableOpacity>
              {activePanel === 'security' ? <View style={styles.panel}>
                <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Password</Text><Text style={styles.sectionSubtitle}>We&apos;ll email you a secure link before any change is made.</Text></View><Feather name="lock" size={18} color="#C2410C" /></View>
                <View style={styles.readOnlyInput}><Feather name="mail" size={15} color="#A8A29E" /><Text style={styles.readOnlyText}>{email}</Text></View>
                <TouchableOpacity style={styles.outlineButton} onPress={sendPasswordResetEmail} disabled={sendingPasswordEmail}>{sendingPasswordEmail ? <ActivityIndicator color="#C2410C" /> : <><Feather name="mail" size={16} color="#C2410C" /><Text style={styles.outlineButtonText}>Email me a password link</Text></>}</TouchableOpacity>
              </View> : null}

              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuRow} onPress={() => Alert.alert('ToledoGo help', 'For order questions, contact the kitchen from your order details.') }>
                <View style={[styles.menuIcon, styles.menuIconBlue]}><Feather name="help-circle" size={17} color="#0369A1" /></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Help & support</Text><Text style={styles.menuSubtitle}>Questions about orders or pickups</Text></View>
                <Feather name="chevron-right" size={16} color="#A8A29E" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutButton} onPress={signOut}><View style={styles.logoutIcon}><Feather name="log-out" size={16} color="#B91C1C" /></View><Text style={styles.logoutText}>Log out</Text><Feather name="chevron-right" size={16} color="#B91C1C" /></TouchableOpacity>
            </View> : null}
          </ScrollView>
          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/customer/dashboard')}><Feather name="home" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Home</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/customer/explore')}><Feather name="compass" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Explore</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.push('/customer/orders')}><Feather name="shopping-bag" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Orders</Text></TouchableOpacity>
            <View style={styles.navItem}><View style={styles.activeNavIcon}><Feather name="user" size={17} color="#FFFFFF" /></View><Text style={styles.activeNavLabel}>Profile</Text></View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingBottom: 110 },
  profileHero: { height: 330, alignItems: 'center', paddingTop: 28, overflow: 'hidden' },
  backButton: { position: 'absolute', top: 16, left: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroPatternOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,247,237,0.14)', right: -52, top: -76 },
  heroPatternTwo: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(124,45,18,0.18)', left: -54, bottom: -62 },
  avatar: { width: 94, height: 94, borderRadius: 47, backgroundColor: '#FFF7ED', borderWidth: 5, borderColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center', marginTop: 35 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 47 },
  avatarText: { color: '#C2410C', fontSize: 28, fontWeight: '900' },
  avatarCamera: { position: 'absolute', right: -2, bottom: -2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#7C2D12', borderWidth: 2, borderColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  heroName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 10 },
  heroEmail: { color: '#FED7AA', fontSize: 11, fontWeight: '700', marginTop: 3 },
  heroCaption: { color: '#FFF7ED', fontSize: 10, marginTop: 14, letterSpacing: 0.5 },
  avatarHint: { color: '#FED7AA', fontSize: 10, marginTop: 7 },
  deleteAvatarButton: { marginTop: 7, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: 'rgba(69,26,3,0.35)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  deleteAvatarText: { color: '#FFF7ED', fontSize: 10, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 20, gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#292524', fontSize: 25, fontWeight: '900', marginTop: 3 },
  subtitle: { color: '#A8A29E', fontSize: 11, fontWeight: '700', marginTop: 3 },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  menuSheet: { backgroundColor: '#FFFFFF', borderRadius: 24, marginHorizontal: 14, marginTop: -18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, zIndex: 3, shadowColor: '#7C2D12', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  menuRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  menuIconRose: { backgroundColor: '#FFF1F2' },
  menuIconGold: { backgroundColor: '#FFFBEB' },
  menuIconGreen: { backgroundColor: '#F0FDF4' },
  menuIconBlue: { backgroundColor: '#F0F9FF' },
  menuCopy: { flex: 1 },
  menuTitle: { color: '#292524', fontSize: 13, fontWeight: '900' },
  menuSubtitle: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  menuDivider: { height: 1, backgroundColor: '#F3E8DC', marginVertical: 5 },
  panel: { borderTopWidth: 1, borderTopColor: '#F3E8DC', paddingTop: 6, paddingBottom: 12 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 18, padding: 15, marginBottom: 14 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  sectionTitle: { color: '#292524', fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: '#A8A29E', fontSize: 11, marginTop: 3, maxWidth: 275 },
  fieldLabel: { color: '#57534E', fontSize: 11, fontWeight: '900', marginBottom: 6, marginTop: 10 },
  input: { minHeight: 43, backgroundColor: '#FFF9F2', borderWidth: 1, borderColor: '#E7D9CC', borderRadius: 10, paddingHorizontal: 12, color: '#292524', fontSize: 13 },
  addressInput: { minHeight: 70, paddingTop: 11, textAlignVertical: 'top' },
  readOnlyInput: { minHeight: 43, backgroundColor: '#F5F5F4', borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  readOnlyText: { color: '#78716C', fontSize: 13 },
  primaryButton: { minHeight: 45, marginTop: 14, borderRadius: 11, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  favoriteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3E8DC', gap: 10 },
  favoriteIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  favoriteCopy: { flex: 1 },
  favoriteName: { color: '#292524', fontSize: 13, fontWeight: '900' },
  favoriteDetail: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  emptyFavorites: { alignItems: 'center', paddingVertical: 12 },
  emptyTitle: { color: '#292524', fontSize: 14, fontWeight: '900', marginTop: 8 },
  emptyText: { color: '#78716C', fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FFF1E6' },
  secondaryButtonText: { color: '#C2410C', fontSize: 11, fontWeight: '900' },
  preferenceRow: { minHeight: 58, borderTopWidth: 1, borderTopColor: '#F3E8DC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: '#292524', fontSize: 13, fontWeight: '900' },
  preferenceDetail: { color: '#A8A29E', fontSize: 10, lineHeight: 15, marginTop: 3 },
  outlineButton: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: '#F4B183', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  outlineButtonText: { color: '#C2410C', fontSize: 12, fontWeight: '900' },
  logoutButton: { minHeight: 60, alignItems: 'center', flexDirection: 'row', gap: 11 },
  logoutIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#B91C1C', fontSize: 13, fontWeight: '900' },
  errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 12 },
  loader: { marginVertical: 30 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3E8DC', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 58, gap: 4 },
  activeNavIcon: { width: 32, height: 27, borderRadius: 13, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center' },
  navLabel: { color: '#A8A29E', fontSize: 10, fontWeight: '700' },
  activeNavLabel: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
});