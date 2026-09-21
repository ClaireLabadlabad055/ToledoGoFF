import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

export default function VendorProfileScreen() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [address, setAddress] = useState('');
  const [meetupDetails, setMeetupDetails] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState('instore');
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [profilePhotoBase64, setProfilePhotoBase64] = useState<string | null>(null);
  const [paymentQrUri, setPaymentQrUri] = useState<string | null>(null);
  const [paymentQrPath, setPaymentQrPath] = useState<string | null>(null);
  const [paymentQrBase64, setPaymentQrBase64] = useState<string | null>(null);
  const [paymentAccountName, setPaymentAccountName] = useState('');
  const [gcashQrUri, setGcashQrUri] = useState<string | null>(null);
  const [gcashQrPath, setGcashQrPath] = useState<string | null>(null);
  const [gcashQrBase64, setGcashQrBase64] = useState<string | null>(null);
  const [mayaQrUri, setMayaQrUri] = useState<string | null>(null);
  const [mayaQrPath, setMayaQrPath] = useState<string | null>(null);
  const [mayaQrBase64, setMayaQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      setVendorId(userData.user.id);
      const { data, error } = await supabase.from('vendors').select('business_name, owner_name, cuisine_specialty, physical_address, meetup_details, fulfillment_mode, profile_photo_url, payment_qr_url, gcash_qr_url, maya_qr_url, payment_account_name').eq('id', userData.user.id).maybeSingle();
      if (error) Alert.alert('Could not load profile', error.message);
      if (data) {
        setBusinessName(data.business_name ?? ''); setOwnerName(data.owner_name ?? ''); setSpecialty(data.cuisine_specialty ?? '');
        setAddress(data.physical_address ?? ''); setMeetupDetails(data.meetup_details ?? ''); setFulfillmentMode(data.fulfillment_mode ?? 'instore');
        setProfilePhotoPath(data.profile_photo_url ?? null);
        setPaymentQrPath(data.payment_qr_url ?? null); setPaymentAccountName(data.payment_account_name ?? '');
        setGcashQrPath(data.gcash_qr_url ?? data.payment_qr_url ?? null); setMayaQrPath(data.maya_qr_url ?? data.payment_qr_url ?? null);
        if (data.profile_photo_url) {
          const { data: signedPhoto } = await supabase.storage.from('vendor-verification').createSignedUrl(data.profile_photo_url, 3600);
          setProfilePhotoUri(signedPhoto?.signedUrl ?? null);
        }
      }
      if (data?.payment_qr_url) {
        const { data: signedQr } = await supabase.storage.from('vendor-verification').createSignedUrl(data.payment_qr_url, 3600);
        setPaymentQrUri(signedQr?.signedUrl ?? null);
      }
      for (const [path, setter] of [[data?.gcash_qr_url, setGcashQrUri], [data?.maya_qr_url, setMayaQrUri]] as const) {
        if (path) {
          const { data: signedQr } = await supabase.storage.from('vendor-verification').createSignedUrl(path, 3600);
          setter(signedQr?.signedUrl ?? null);
        }
      }
      setLoading(false);
    };
    loadProfile();
  }, []);

  const pickProfilePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8, base64: true });
    if (!result.canceled && result.assets?.[0]) {
      setProfilePhotoUri(result.assets[0].uri);
      setProfilePhotoBase64(result.assets[0].base64 ?? null);
    }
  };

  const pickPaymentQr = async (provider: 'GCash' | 'Maya') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9, base64: true });
    if (!result.canceled && result.assets?.[0]) {
      if (provider === 'GCash') { setGcashQrUri(result.assets[0].uri); setGcashQrBase64(result.assets[0].base64 ?? null); }
      else { setMayaQrUri(result.assets[0].uri); setMayaQrBase64(result.assets[0].base64 ?? null); }
    }
  };

  const removePaymentQr = async (provider: 'GCash' | 'Maya') => {
    const path = provider === 'GCash' ? gcashQrPath : mayaQrPath;
    if (!path) return;
    Alert.alert(`Remove ${provider} QR?`, `Customers will no longer be able to pay with ${provider}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setSaving(true);
        try {
          const { error: removeError } = await supabase.storage.from('vendor-verification').remove([path]);
          if (removeError) throw removeError;
          const nextGcashPath = provider === 'GCash' ? null : gcashQrPath;
          const nextMayaPath = provider === 'Maya' ? null : mayaQrPath;
          const { error: updateError } = await supabase.rpc('update_vendor_profile', {
            vendor_business_name: businessName, vendor_owner_name: ownerName, vendor_cuisine_specialty: specialty,
            vendor_physical_address: address, vendor_meetup_details: meetupDetails, vendor_profile_photo_url: profilePhotoPath,
            vendor_gcash_qr_url: nextGcashPath, vendor_maya_qr_url: nextMayaPath, vendor_payment_account_name: paymentAccountName,
          });
          if (updateError) throw updateError;
          if (provider === 'GCash') { setGcashQrPath(null); setGcashQrUri(null); setGcashQrBase64(null); }
          else { setMayaQrPath(null); setMayaQrUri(null); setMayaQrBase64(null); }
          Alert.alert(`${provider} QR removed`, 'Customers will now be guided to Cash on Pickup for this provider.');
        } catch (error: any) {
          Alert.alert(`Could not remove ${provider} QR`, error.message);
        } finally {
          setSaving(false);
        }
      } },
    ]);
  };

  const saveProfile = async () => {
    if (!businessName.trim() || !ownerName.trim() || !specialty.trim() || !address.trim()) {
      Alert.alert('Complete your profile', 'Business name, owner name, specialty, and address are required.'); return;
    }
    if ((fulfillmentMode === 'meetup' || fulfillmentMode === 'both') && !meetupDetails.trim()) {
      Alert.alert('Meet-up details required', 'Add the location and schedule customers should use.'); return;
    }
    setSaving(true);
    try {
      let savedPhotoPath = profilePhotoPath;
      if (profilePhotoBase64 && vendorId) {
        savedPhotoPath = `${vendorId}/profile-photo-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('vendor-verification').upload(savedPhotoPath, decode(profilePhotoBase64), { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      let savedPaymentQrPath = paymentQrPath;
      if (paymentQrBase64 && vendorId) {
        savedPaymentQrPath = `${vendorId}/payment-qr-${Date.now()}.jpg`;
        const { error: qrUploadError } = await supabase.storage.from('vendor-verification').upload(savedPaymentQrPath, decode(paymentQrBase64), { contentType: 'image/jpeg', upsert: false });
        if (qrUploadError) throw qrUploadError;
      }
      let savedGcashQrPath = gcashQrPath;
      if (gcashQrBase64 && vendorId) {
        savedGcashQrPath = `${vendorId}/gcash-qr-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('vendor-verification').upload(savedGcashQrPath, decode(gcashQrBase64), { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      let savedMayaQrPath = mayaQrPath;
      if (mayaQrBase64 && vendorId) {
        savedMayaQrPath = `${vendorId}/maya-qr-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('vendor-verification').upload(savedMayaQrPath, decode(mayaQrBase64), { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.rpc('update_vendor_profile', {
        vendor_business_name: businessName, vendor_owner_name: ownerName, vendor_cuisine_specialty: specialty,
        vendor_physical_address: address, vendor_meetup_details: meetupDetails, vendor_profile_photo_url: savedPhotoPath,
        vendor_gcash_qr_url: savedGcashQrPath, vendor_maya_qr_url: savedMayaQrPath, vendor_payment_account_name: paymentAccountName,
      });
      if (error) throw error;
      setProfilePhotoPath(savedPhotoPath);
      setProfilePhotoBase64(null);
      setPaymentQrPath(savedPaymentQrPath); setPaymentQrBase64(null);
      setGcashQrPath(savedGcashQrPath); setGcashQrBase64(null); setMayaQrPath(savedMayaQrPath); setMayaQrBase64(null);
      Alert.alert('Profile updated', 'Customers will see your updated storefront details.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error.message);
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.coverHeader}>
        {profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.coverImage} resizeMode="cover" /> : <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={StyleSheet.absoluteFill} />}
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/vendor/dashboard');
        }} style={styles.backButton}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity>
        <View style={styles.coverIcon}><MaterialCommunityIcons name="storefront-outline" size={44} color="#FFF7ED" /></View>
        <View style={styles.coverOverlay}><Text style={styles.coverEyebrow}>SHOP PROFILE</Text><Text style={styles.coverTitle}>{businessName || 'Your kitchen'}</Text><Text style={styles.coverSubtitle}>Customer-facing storefront details</Text></View>
      </View>

      {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : <View style={styles.formContainer}>
        <View style={styles.card}><View style={styles.cardHeader}><Feather name="shopping-bag" size={18} color="#C2410C" /><Text style={styles.cardTitle}>Shop branding</Text></View><Text style={styles.cardSubtext}>Tell customers who is behind your local kitchen.</Text>
          <Text style={styles.fieldLabel}>Store cover photo</Text><TouchableOpacity style={styles.photoPicker} onPress={pickProfilePhoto} activeOpacity={0.85}>{profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.photoPreview} resizeMode="cover" /> : <><MaterialCommunityIcons name="image-plus" size={28} color="#C2410C" /><Text style={styles.photoPickerText}>Add a photo customers will see on your store</Text></>}</TouchableOpacity>
          <Text style={styles.fieldLabel}>Business name</Text><TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="e.g. Aling Nita's Lutong Bahay" placeholderTextColor="#94A3B8" />
          <Text style={styles.fieldLabel}>Owner name</Text><TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="e.g. Nita Santos" placeholderTextColor="#94A3B8" />
          <Text style={styles.fieldLabel}>Cuisine specialty / bio</Text><TextInput style={[styles.input, styles.textArea]} value={specialty} onChangeText={setSpecialty} placeholder="Tell customers about your delicacies" placeholderTextColor="#94A3B8" multiline />
        </View>

        <View style={styles.card}><View style={styles.cardHeader}><MaterialCommunityIcons name="map-marker-radius-outline" size={19} color="#C2410C" /><Text style={styles.cardTitle}>Pickup details</Text></View><Text style={styles.cardSubtext}>Keep your location and collection instructions clear.</Text>
          <Text style={styles.fieldLabel}>Barangay and location</Text><View style={styles.locationRow}><Feather name="map-pin" size={17} color="#C2410C" /><TextInput style={[styles.input, styles.locationInput]} value={address} onChangeText={setAddress} placeholder="Street, barangay, Toledo City" placeholderTextColor="#94A3B8" /></View>
          <View style={styles.fulfillmentBadge}><Feather name="shopping-bag" size={14} color="#C2410C" /><Text style={styles.fulfillmentText}>{fulfillmentMode === 'both' ? 'In-store pickup + location meet-ups' : fulfillmentMode === 'meetup' ? 'Location meet-ups' : 'In-store pickup'}</Text></View>
          {(fulfillmentMode === 'meetup' || fulfillmentMode === 'both') ? <><Text style={styles.fieldLabel}>Meet-up schedule and location</Text><TextInput style={[styles.input, styles.textAreaSmall]} value={meetupDetails} onChangeText={setMeetupDetails} placeholder="e.g. Toledo Plaza, Fridays 4-6 PM" placeholderTextColor="#94A3B8" multiline /></> : null}
        </View>

        <View style={styles.card}><View style={styles.cardHeader}><Feather name="credit-card" size={18} color="#C2410C" /><Text style={styles.cardTitle}>QRPH online payments</Text></View><Text style={styles.cardSubtext}>Upload separate official QR codes so customers can switch between GCash and Maya at checkout.</Text><Text style={styles.fieldLabel}>Account name</Text><TextInput style={styles.input} value={paymentAccountName} onChangeText={setPaymentAccountName} placeholder="e.g. Aling Nita's Kitchen" placeholderTextColor="#94A3B8" /><Text style={styles.fieldLabel}>GCash QRPH</Text><TouchableOpacity style={styles.photoPicker} onPress={() => pickPaymentQr('GCash')}>{gcashQrUri ? <Image source={{ uri: gcashQrUri }} style={styles.photoPreview} resizeMode="contain" /> : <><Feather name="maximize" size={28} color="#C2410C" /><Text style={styles.photoPickerText}>Add GCash QR code</Text></>}</TouchableOpacity>{gcashQrPath ? <TouchableOpacity style={styles.removeQrButton} onPress={() => removePaymentQr('GCash')}><Feather name="trash-2" size={14} color="#B91C1C" /><Text style={styles.removeQrText}>Remove GCash QR</Text></TouchableOpacity> : null}<Text style={styles.fieldLabel}>Maya QRPH</Text><TouchableOpacity style={styles.photoPicker} onPress={() => pickPaymentQr('Maya')}>{mayaQrUri ? <Image source={{ uri: mayaQrUri }} style={styles.photoPreview} resizeMode="contain" /> : <><Feather name="maximize" size={28} color="#C2410C" /><Text style={styles.photoPickerText}>Add Maya QR code</Text></>}</TouchableOpacity>{mayaQrPath ? <TouchableOpacity style={styles.removeQrButton} onPress={() => removePaymentQr('Maya')}><Feather name="trash-2" size={14} color="#B91C1C" /><Text style={styles.removeQrText}>Remove Maya QR</Text></TouchableOpacity> : null}</View>

        <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="check-circle" size={17} color="#FFFFFF" /><Text style={styles.saveText}>Update public profile</Text></>}</TouchableOpacity>
        <Text style={styles.note}>These changes will appear on your customer storefront.</Text>
      </View>}
    </ScrollView>
  </SafeAreaView></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, safeArea: { flex: 1 }, content: { paddingBottom: 35 },
  photoPicker: { height: 150, borderRadius: 14, borderWidth: 1, borderColor: '#FED7AA', borderStyle: 'dashed', backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 }, photoPreview: { width: '100%', height: '100%' }, photoPickerText: { color: '#C2410C', fontSize: 12, fontWeight: '800', marginTop: 8 }, removeQrButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, marginBottom: 4 }, removeQrText: { color: '#B91C1C', fontSize: 11, fontWeight: '900' },
  coverHeader: { height: 245, paddingHorizontal: 20, paddingTop: 18, justifyContent: 'space-between', overflow: 'hidden' }, coverImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' }, backButton: { alignSelf: 'flex-start', backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, coverIcon: { alignSelf: 'center', width: 92, height: 92, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, coverOverlay: { paddingBottom: 20 }, coverEyebrow: { color: '#FED7AA', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, coverTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 4 }, coverSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginTop: 3 }, formContainer: { padding: 16, marginTop: -22 }, card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 19, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#64748B', shadowOpacity: 0.06, shadowRadius: 12 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }, cardTitle: { color: '#1E293B', fontSize: 16, fontWeight: '900' }, cardSubtext: { color: '#64748B', fontSize: 12, lineHeight: 18, fontWeight: '600', marginBottom: 15 }, fieldLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 12, marginBottom: 5 }, input: { color: '#1E293B', fontSize: 14, fontWeight: '700', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, textArea: { height: 82, textAlignVertical: 'top', backgroundColor: '#F8FAFC', borderRadius: 13, paddingHorizontal: 12, paddingTop: 11 }, textAreaSmall: { minHeight: 68, textAlignVertical: 'top', backgroundColor: '#F8FAFC', borderRadius: 13, paddingHorizontal: 12, paddingTop: 11 }, locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, locationInput: { flex: 1, borderBottomWidth: 0 }, fulfillmentBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEDD5', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 16 }, fulfillmentText: { color: '#C2410C', fontSize: 11, fontWeight: '900' }, saveButton: { backgroundColor: '#C2410C', padding: 17, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 3, shadowColor: '#C2410C', shadowOpacity: 0.24, shadowRadius: 8 }, saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 }, note: { textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: 14, fontStyle: 'italic', fontWeight: '700' }, loader: { marginTop: 35 },
});
