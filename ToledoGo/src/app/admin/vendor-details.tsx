import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../Services/supabase';
import { isAdminUser } from '../../Services/adminAuth';

type Vendor = { id: string; business_name?: string | null; owner_name?: string | null; email?: string | null; phone?: string | null; cuisine_specialty?: string | null; physical_address?: string | null; store_type?: string | null; fulfillment_mode?: string | null; meetup_details?: string | null; is_verified: boolean; is_open?: boolean | null; verification_status?: string | null; owner_id_url?: string | null; permit_url?: string | null; store_photo_url?: string | null; profile_photo_url?: string | null; admin_notes?: string | null; created_at: string; };

export default function AdminVendorDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVendor = useCallback(async () => {
    try {
      if (!(await isAdminUser())) { router.replace('/login'); return; }
      if (!id) return;
      const [{ data, error }, { data: orders, error: ordersError }] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
        supabase.from('orders').select('total, status').eq('vendor_id', id),
      ]);
      if (error) throw error;
      if (ordersError) throw ordersError;
      setVendor(data as Vendor | null);
      const photoPath = data?.profile_photo_url ?? data?.store_photo_url;
      if (photoPath) {
        const { data: signedPhoto } = await supabase.storage.from('vendor-verification').createSignedUrl(photoPath, 3600);
        setCoverUrl(signedPhoto?.signedUrl ?? null);
      } else {
        setCoverUrl(null);
      }
      const completedOrders = orders?.filter((order) => order.status === 'completed') ?? [];
      setOrderCount(orders?.length ?? 0);
      setRevenue(completedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0));
    } catch (loadError: any) {
      Alert.alert('Could not load vendor', loadError.message ?? 'Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [id, router]);

  useFocusEffect(useCallback(() => { loadVendor(); }, [loadVendor]));

  const updateVendor = async (values: Partial<Vendor>, message: string) => {
    if (!vendor) return;
    const { error } = await supabase.from('vendors').update(values).eq('id', vendor.id);
    if (error) { Alert.alert('Update failed', error.message); return; }
    setVendor({ ...vendor, ...values });
    Alert.alert('Vendor updated', message);
  };

  const reviewStatus = vendor?.is_verified ? 'Approved' : vendor?.verification_status === 'rejected' ? 'Rejected' : 'Pending review';

  if (loading) return <View style={styles.loadingScreen}><ActivityIndicator color="#C2410C" size="large" /></View>;
  if (!vendor) return <View style={styles.loadingScreen}><Text style={styles.emptyText}>Vendor not found.</Text><TouchableOpacity onPress={() => router.replace('/admin/vendor')}><Text style={styles.link}>Back to vendors</Text></TouchableOpacity></View>;

  const documents = [{ label: 'Owner ID', path: vendor.owner_id_url }, { label: 'Permit', path: vendor.permit_url }, { label: 'Store photo', path: vendor.store_photo_url }];

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVendor(); }} tintColor="#C2410C" />}>
    <View style={styles.topBar}><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/admin/vendor')}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><Text style={styles.topTitle}>Vendor details</Text><TouchableOpacity style={styles.backButton} onPress={loadVendor}><Feather name="refresh-cw" size={17} color="#C2410C" /></TouchableOpacity></View>
    <View style={styles.hero}>{coverUrl ? <Image source={{ uri: coverUrl }} style={styles.heroImage} /> : <View style={styles.heroIcon}><MaterialCommunityIcons name="storefront-outline" size={40} color="#C2410C" /></View>}<View style={styles.heroCopy}><Text style={styles.eyebrow}>LOCAL KITCHEN</Text><Text style={styles.name}>{vendor.business_name || 'Unnamed vendor'}</Text><Text style={styles.owner}>Owned by {vendor.owner_name || 'Unknown owner'}</Text></View><View style={[styles.status, vendor.is_verified ? styles.approvedStatus : styles.pendingStatus]}><Text style={[styles.statusText, vendor.is_verified ? styles.approvedText : styles.pendingText]}>{reviewStatus}</Text></View></View>
    <View style={styles.statsRow}><View style={styles.stat}><Text style={styles.statValue}>{orderCount}</Text><Text style={styles.statLabel}>Orders</Text></View><View style={styles.stat}><Text style={styles.statValue}>PHP {revenue.toFixed(0)}</Text><Text style={styles.statLabel}>Completed sales</Text></View><View style={styles.stat}><Text style={styles.statValue}>{vendor.is_open === false ? 'Closed' : 'Open'}</Text><Text style={styles.statLabel}>Store status</Text></View></View>
    <View style={styles.actionRow}>{!vendor.is_verified ? <TouchableOpacity style={styles.approveButton} onPress={() => updateVendor({ verification_status: 'approved', is_verified: true }, 'The vendor can now access the marketplace.')}><Feather name="check" size={16} color="#FFFFFF" /><Text style={styles.approveText}>Approve vendor</Text></TouchableOpacity> : <TouchableOpacity style={styles.rejectButton} onPress={() => updateVendor({ verification_status: 'rejected', is_verified: false }, 'The vendor is back in the review queue.')}><Feather name="x" size={16} color="#B91C1C" /><Text style={styles.rejectText}>Reopen review</Text></TouchableOpacity>}<TouchableOpacity style={styles.outlineButton} onPress={() => updateVendor({ is_open: vendor.is_open === false }, vendor.is_open === false ? 'The storefront is live.' : 'The storefront is paused.')}><Feather name={vendor.is_open === false ? 'play' : 'pause'} size={15} color="#9A3412" /><Text style={styles.outlineText}>{vendor.is_open === false ? 'Open store' : 'Pause store'}</Text></TouchableOpacity></View>
    <InfoSection title="Business profile" icon="briefcase"><Info label="Specialty" value={vendor.cuisine_specialty} /><Info label="Store type" value={vendor.store_type} /><Info label="Address" value={vendor.physical_address} /><Info label="Fulfillment" value={vendor.fulfillment_mode === 'meetup' ? `Meet-up${vendor.meetup_details ? ` · ${vendor.meetup_details}` : ''}` : 'In-store pickup'} /><Info label="Phone" value={vendor.phone} /><Info label="Email" value={vendor.email} /></InfoSection>
    <InfoSection title="Verification documents" icon="shield"><View style={styles.documents}>{documents.map((document) => <View key={document.label} style={styles.document}><Text style={styles.documentLabel}>{document.label}</Text>{document.path ? <Text style={styles.documentReady}>Submitted</Text> : <Text style={styles.documentMissing}>Missing</Text>}</View>)}</View>{vendor.admin_notes ? <><Text style={styles.notesLabel}>Admin notes</Text><Text style={styles.notes}>{vendor.admin_notes}</Text></> : null}</InfoSection>
  </ScrollView></SafeAreaView></View>;
}

function InfoSection({ title, icon, children }: { title: string; icon: 'briefcase' | 'shield'; children: React.ReactNode }) { return <View style={styles.section}><View style={styles.sectionHeader}><Feather name={icon} size={17} color="#C2410C" /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value || 'Not provided'}</Text></View>; }

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, content: { padding: 16, paddingBottom: 35 }, loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF9F2' }, emptyText: { color: '#78716C', fontSize: 14, fontWeight: '700' }, link: { color: '#C2410C', fontWeight: '900', marginTop: 10 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, backButton: { backgroundColor: '#FFEDD5', padding: 9, borderRadius: 13 }, topTitle: { color: '#292524', fontSize: 18, fontWeight: '900' }, hero: { backgroundColor: '#7C2D12', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, heroImage: { width: 58, height: 58, borderRadius: 16 }, heroIcon: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, heroCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, name: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', marginTop: 3 }, owner: { color: '#FED7AA', fontSize: 11, marginTop: 3 }, status: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'flex-start' }, approvedStatus: { backgroundColor: '#DCFCE7' }, pendingStatus: { backgroundColor: '#FFEDD5' }, statusText: { fontSize: 9, fontWeight: '900' }, approvedText: { color: '#15803D' }, pendingText: { color: '#9A3412' }, statsRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F3E8DC', marginTop: 12, paddingVertical: 15 }, stat: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#F3E8DC' }, statValue: { color: '#292524', fontSize: 16, fontWeight: '900' }, statLabel: { color: '#A8A29E', fontSize: 9, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' }, actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, approveButton: { flex: 1, minHeight: 43, borderRadius: 11, backgroundColor: '#15803D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, approveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, rejectButton: { flex: 1, minHeight: 43, borderRadius: 11, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, rejectText: { color: '#B91C1C', fontSize: 11, fontWeight: '900' }, outlineButton: { flex: 1, minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, outlineText: { color: '#9A3412', fontSize: 11, fontWeight: '900' }, section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 15, marginTop: 12 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }, sectionTitle: { color: '#292524', fontSize: 14, fontWeight: '900' }, infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F7F1EB' }, infoLabel: { color: '#A8A29E', fontSize: 11, fontWeight: '800' }, infoValue: { color: '#44403C', fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }, documents: { flexDirection: 'row', gap: 8 }, document: { flex: 1, minHeight: 72, borderRadius: 11, backgroundColor: '#FFF9F2', alignItems: 'center', justifyContent: 'center', padding: 8 }, documentLabel: { color: '#78716C', fontSize: 10, fontWeight: '900', textAlign: 'center' }, documentReady: { color: '#15803D', fontSize: 10, fontWeight: '900', marginTop: 7 }, documentMissing: { color: '#B91C1C', fontSize: 10, fontWeight: '900', marginTop: 7 }, notesLabel: { color: '#A8A29E', fontSize: 10, fontWeight: '900', marginTop: 15, textTransform: 'uppercase' }, notes: { color: '#57534E', fontSize: 12, lineHeight: 18, marginTop: 5 } });
