import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type FulfillmentMode = 'instore' | 'meetup' | 'both';

export default function VendorDashboardScreen() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('Your kitchen');
  const [isOpen, setIsOpen] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>('instore');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVendorHome = async () => {
    try {
      setError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace('/login');
        return;
      }

      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('id, business_name, is_open, verification_status, fulfillment_mode')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (vendorError) throw vendorError;
      if (!vendor) {
        setError('Vendor profile not found.');
        return;
      }

      setVendorId(vendor.id);
      setBusinessName(vendor.business_name);
      setIsOpen(vendor.is_open ?? true);
      setVerificationStatus(vendor.verification_status ?? 'pending');
      setFulfillmentMode((vendor.fulfillment_mode ?? 'instore') as FulfillmentMode);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your vendor home.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleStoreStatus = async (open: boolean) => {
    setIsOpen(open);
    const { error: statusError } = await supabase.rpc('set_vendor_open_status', { open_status: open });
    if (statusError) {
      setIsOpen(!open);
      Alert.alert('Could not update store status', statusError.message);
    }
  };

  const fulfillmentLabel = fulfillmentMode === 'both'
    ? 'In-store pickup + location meet-ups'
    : fulfillmentMode === 'meetup'
      ? 'Location meet-ups'
      : 'In-store pickup';

  useEffect(() => {
    loadVendorHome();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F2" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVendorHome(); }} tintColor="#C2410C" />}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>VENDOR HOME</Text>
              <Text style={styles.title}>{businessName}</Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={signOut} accessibilityLabel="Sign out">
              <Feather name="log-out" size={18} color="#7C2D12" />
            </TouchableOpacity>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-variant" size={27} color="#FFFFFF" /></View>
            <View style={styles.heroCopy}><Text style={styles.heroTitle}>Your menu, your way.</Text><Text style={styles.heroText}>Publish today’s dishes and make them visible on Explore.</Text></View>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusTopRow}>
              <View style={styles.statusIcon}><MaterialCommunityIcons name={isOpen ? 'store-check-outline' : 'store-off-outline'} size={23} color={isOpen ? '#166534' : '#9F1239'} /></View>
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>{isOpen ? 'Store is open' : 'Store is closed'}</Text>
                <Text style={styles.statusSubtitle}>{isOpen ? 'Customers can see your kitchen and menu.' : 'Your kitchen is hidden from customer discovery.'}</Text>
              </View>
              <Switch value={isOpen} onValueChange={toggleStoreStatus} trackColor={{ false: '#E7D9CC', true: '#86EFAC' }} thumbColor={isOpen ? '#166534' : '#A8A29E'} accessibilityLabel="Toggle store open status" />
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusDetails}>
              <View style={styles.detailBlock}><Text style={styles.detailLabel}>FULFILLMENT</Text><Text style={styles.detailValue}>{fulfillmentLabel}</Text></View>
              <View style={[styles.verificationBadge, verificationStatus === 'approved' ? styles.verifiedBadge : styles.pendingBadge]}><Feather name={verificationStatus === 'approved' ? 'check-circle' : 'clock'} size={13} color={verificationStatus === 'approved' ? '#166534' : '#92400E'} /><Text style={[styles.verificationText, verificationStatus === 'approved' ? styles.verifiedText : styles.pendingText]}>{verificationStatus === 'approved' ? 'Verified' : 'Pending verification'}</Text></View>
            </View>
          </View>

          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/analytics')}>
              <View style={styles.actionIcon}><Feather name="bar-chart-2" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Sales summary</Text>
              <Text style={styles.actionText}>Track revenue, orders, and weekly progress.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/reviews')}>
              <View style={styles.actionIcon}><Feather name="star" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Reviews &amp; Ratings</Text>
              <Text style={styles.actionText}>Read customer feedback, photos, and reply publicly.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/orders')}>
              <View style={styles.actionIcon}><Feather name="clipboard" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Orders</Text>
              <Text style={styles.actionText}>Process incoming orders and pickup handoffs.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/messages')}>
              <View style={styles.actionIcon}><Feather name="message-circle" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Messages</Text>
              <Text style={styles.actionText}>Answer custom bookings, inquiries, and bulk orders.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/menus')}>
              <View style={styles.actionIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={24} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Menu items</Text>
              <Text style={styles.actionText}>Publish dishes and manage availability.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/batches')}>
              <View style={styles.actionIcon}><Feather name="calendar" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Batch schedule</Text>
              <Text style={styles.actionText}>Set dates, order cutoffs, pickup windows, and quantities.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/vendor/profile')}>
              <View style={styles.actionIcon}><Feather name="edit-3" size={22} color="#C2410C" /></View>
              <Text style={styles.actionTitle}>Business profile</Text>
              <Text style={styles.actionText}>Update what customers see about your shop.</Text>
              <Feather name="arrow-up-right" size={17} color="#C2410C" style={styles.actionArrow} />
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 35 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 20 },
  eyebrow: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#292524', fontSize: 24, fontWeight: '900', marginTop: 4 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#7C2D12', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  heroCopy: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  heroText: { color: '#FED7AA', fontSize: 12, lineHeight: 17, marginTop: 4 },
  statusCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 14, marginBottom: 24 },
  statusTopRow: { flexDirection: 'row', alignItems: 'center' },
  statusIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  statusCopy: { flex: 1, paddingHorizontal: 11 },
  statusTitle: { color: '#292524', fontSize: 15, fontWeight: '900' },
  statusSubtitle: { color: '#78716C', fontSize: 11, lineHeight: 16, marginTop: 3 },
  statusDivider: { height: 1, backgroundColor: '#F3E8DC', marginVertical: 13 },
  statusDetails: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  detailBlock: { flex: 1 },
  detailLabel: { color: '#A8A29E', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  detailValue: { color: '#7C2D12', fontSize: 11, fontWeight: '800', marginTop: 4 },
  verificationBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7 },
  verifiedBadge: { backgroundColor: '#DCFCE7' },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  verificationText: { fontSize: 10, fontWeight: '900' },
  verifiedText: { color: '#166534' },
  pendingText: { color: '#92400E' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 3 },
  sectionTitle: { color: '#292524', fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: '#A8A29E', fontSize: 11, marginTop: 3 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 11, marginBottom: 24 },
  actionCard: { width: '48.2%', minHeight: 132, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 12, position: 'relative' },
  actionIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  actionTitle: { color: '#292524', fontSize: 14, fontWeight: '900' },
  actionText: { color: '#78716C', fontSize: 10.5, lineHeight: 15, marginTop: 5, paddingRight: 2 },
  actionArrow: { position: 'absolute', right: 13, bottom: 13 },
  loader: { marginVertical: 20 },
  emptyText: { color: '#78716C', textAlign: 'center', fontSize: 13, paddingVertical: 25 },
  errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 12 },
});
