import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../Services/supabase';
import { isAdminUser } from '../../Services/adminAuth';

type VendorStatus = 'active' | 'pending' | 'rejected';
type Vendor = { id: string; business_name?: string | null; owner_name?: string | null; cuisine_specialty?: string | null; physical_address?: string | null; store_type?: string | null; verification_status?: string | null; is_verified: boolean; is_open?: boolean | null; profile_photo_url?: string | null; store_photo_url?: string | null; created_at: string; };

const tabs: { key: VendorStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Needs review' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminVendorsScreen() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<VendorStatus>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    try {
      setError(null);
      if (!(await isAdminUser())) { router.replace('/login'); return; }
      const { data, error: queryError } = await supabase.from('vendors').select('id, business_name, owner_name, cuisine_specialty, physical_address, store_type, verification_status, is_verified, is_open, profile_photo_url, store_photo_url, created_at').order('created_at', { ascending: false });
      if (queryError) throw queryError;
      const loadedVendors = (data ?? []) as Vendor[];
      const signedEntries = await Promise.all(loadedVendors.filter((vendor) => vendor.profile_photo_url || vendor.store_photo_url).map(async (vendor) => {
        const photoPath = vendor.profile_photo_url ?? vendor.store_photo_url;
        const { data: signedPhoto } = await supabase.storage.from('vendor-verification').createSignedUrl(photoPath!, 3600);
        return signedPhoto?.signedUrl ? [vendor.id, signedPhoto.signedUrl] as const : null;
      }));
      setPhotoUrls(Object.fromEntries(signedEntries.filter(Boolean) as [string, string][]));
      setVendors(loadedVendors);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load vendors.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { loadVendors(); }, [loadVendors]));

  const vendorStatus = (vendor: Vendor): VendorStatus => {
    if (vendor.is_verified || vendor.verification_status === 'approved') return 'active';
    if (vendor.verification_status === 'rejected') return 'rejected';
    return 'pending';
  };

  const visibleVendors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vendors.filter((vendor) => vendorStatus(vendor) === tab && (!query || [vendor.business_name, vendor.owner_name, vendor.cuisine_specialty, vendor.physical_address].some((value) => value?.toLowerCase().includes(query))));
  }, [search, tab, vendors]);

  const updateVendor = async (vendor: Vendor, status: 'approved' | 'rejected') => {
    const { error: updateError } = await supabase.from('vendors').update({ verification_status: status, is_verified: status === 'approved' }).eq('id', vendor.id);
    if (updateError) { Alert.alert('Could not update vendor', updateError.message); return; }
    setVendors((current) => current.map((item) => item.id === vendor.id ? { ...item, verification_status: status, is_verified: status === 'approved' } : item));
  };

  const countFor = (status: VendorStatus) => vendors.filter((vendor) => vendorStatus(vendor) === status).length;

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}>
    <View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/admin/dashboard')}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>ADMIN OPERATIONS</Text><Text style={styles.title}>Vendor management</Text><Text style={styles.subtitle}>Review the kitchens serving Toledo City.</Text></View><MaterialCommunityIcons name="storefront-outline" size={28} color="#FFF7ED" /></View>
    <View style={styles.tabBar}>{tabs.map((item) => <TouchableOpacity key={item.key} style={[styles.tab, tab === item.key && styles.tabActive]} onPress={() => setTab(item.key)}><Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text><View style={[styles.count, tab === item.key && styles.countActive]}><Text style={[styles.countText, tab === item.key && styles.countTextActive]}>{countFor(item.key)}</Text></View></TouchableOpacity>)}</View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVendors(); }} tintColor="#C2410C" />}>
      <View style={styles.searchBox}><Feather name="search" size={17} color="#A8A29E" /><TextInput value={search} onChangeText={setSearch} placeholder="Search by shop, owner, or area" placeholderTextColor="#A8A29E" style={styles.searchInput} /></View>
      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={loadVendors}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View> : null}
      {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
      {!loading && !error && visibleVendors.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="store-off-outline" size={42} color="#C2410C" /><Text style={styles.emptyTitle}>No vendors in this view</Text><Text style={styles.emptyText}>Try another status or search term.</Text></View> : null}
      {visibleVendors.map((vendor) => <TouchableOpacity key={vendor.id} style={styles.card} onPress={() => router.push({ pathname: '/admin/vendor-details', params: { id: vendor.id, name: vendor.business_name ?? 'Vendor' } })} activeOpacity={0.88}><View style={styles.cardRow}>{photoUrls[vendor.id] ? <Image source={{ uri: photoUrls[vendor.id] }} style={styles.avatarImage} /> : <View style={styles.avatar}><Feather name={vendor.store_type?.toLowerCase().includes('home') ? 'home' : 'map-pin'} size={19} color="#C2410C" /></View>}<View style={styles.cardCopy}><Text style={styles.vendorName} numberOfLines={1}>{vendor.business_name || 'Unnamed vendor'}</Text><Text style={styles.ownerName} numberOfLines={1}>{vendor.owner_name || 'Owner not provided'} · {vendor.cuisine_specialty || 'General menu'}</Text><Text style={styles.location} numberOfLines={1}>{vendor.physical_address || 'Address not provided'}</Text></View><View style={[styles.statusPill, vendor.is_open === false && styles.closedPill]}><Text style={[styles.statusText, vendor.is_open === false && styles.closedText]}>{vendor.is_open === false ? 'Closed' : tab === 'active' ? 'Live' : tab === 'rejected' ? 'Rejected' : 'Pending'}</Text></View></View>{tab !== 'active' ? <View style={styles.actionRow}><TouchableOpacity style={styles.secondaryButton} onPress={() => router.push({ pathname: '/admin/vendor-details', params: { id: vendor.id } })}><Text style={styles.secondaryText}>Review details</Text></TouchableOpacity>{tab === 'pending' ? <TouchableOpacity style={styles.approveButton} onPress={() => updateVendor(vendor, 'approved')}><Feather name="check" size={14} color="#FFFFFF" /><Text style={styles.approveText}>Approve</Text></TouchableOpacity> : null}</View> : null}</TouchableOpacity>)}
    </ScrollView>
  </SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#7C2D12' }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 }, tabBar: { flexDirection: 'row', gap: 8, padding: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3E8DC' }, tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }, tabActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' }, tabText: { color: '#7C2D12', fontSize: 11, fontWeight: '900' }, tabTextActive: { color: '#FFFFFF' }, count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEDD5' }, countActive: { backgroundColor: 'rgba(255,255,255,0.2)' }, countText: { color: '#C2410C', fontSize: 9, fontWeight: '900' }, countTextActive: { color: '#FFFFFF' }, content: { padding: 16, paddingBottom: 35 }, searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 13, paddingHorizontal: 12, marginBottom: 14 }, searchInput: { flex: 1, minHeight: 43, color: '#292524', fontSize: 12 }, loader: { marginVertical: 30 }, errorBox: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 12 }, errorText: { color: '#B91C1C', fontSize: 12 }, retryText: { color: '#991B1B', fontSize: 12, fontWeight: '900', marginTop: 8 }, empty: { alignItems: 'center', paddingVertical: 70 }, emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 12 }, emptyText: { color: '#78716C', fontSize: 12, marginTop: 5 }, card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 14, marginBottom: 12 }, cardRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEDD5' }, avatarImage: { width: 43, height: 43, borderRadius: 13 }, cardCopy: { flex: 1 }, vendorName: { color: '#292524', fontSize: 15, fontWeight: '900' }, ownerName: { color: '#78716C', fontSize: 11, marginTop: 3 }, location: { color: '#A8A29E', fontSize: 10, marginTop: 3 }, statusPill: { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 }, statusText: { color: '#15803D', fontSize: 9, fontWeight: '900' }, closedPill: { backgroundColor: '#F3F4F6' }, closedText: { color: '#6B7280' }, actionRow: { flexDirection: 'row', gap: 8, marginTop: 13 }, secondaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10 }, secondaryText: { color: '#9A3412', fontSize: 11, fontWeight: '900' }, approveButton: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 38, backgroundColor: '#15803D', borderRadius: 10 }, approveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' } });
