import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../Services/supabase'; // Make sure this path correctly points to your Supabase client file
import { isAdminUser } from '../../Services/adminAuth';

const { width } = Dimensions.get('window');

interface Vendor {
  id: string;
  business_name: string;
  owner_name: string;
  cuisine_specialty: string;
  physical_address: string;
  store_type: 'Physical Store' | 'Home-Based' | string;
  sales_volume?: string;
  is_verified: boolean;
  profile_photo_url?: string | null;
  store_photo_url?: string | null;
}

interface Metrics {
  activeVendors: number;
  totalOrders: number;
  customers: number;
  pendingApprovals: number;
  pendingSettlements: number;
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({
    activeVendors: 0,
    totalOrders: 0,
    customers: 0,
    pendingApprovals: 0,
    pendingSettlements: 0,
  });
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      if (!(await isAdminUser())) {
        router.replace('/login');
        return;
      }

      // 1. Fetch Active (Verified) Vendors
      const { data: activeData, error: activeError } = await supabase
        .from('vendors')
        .select('*')
        .eq('is_verified', true);

      if (activeError) throw activeError;

      // 2. Fetch pending approvals from both account types
      const [{ count: pendingVendorCount, error: pendingVendorError }, { count: pendingCustomerCount, error: pendingCustomerError }, { count: orderCount, error: orderError }, { count: customerCount, error: customerError }, { count: settlementCount, error: settlementError }] = await Promise.all([
        supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('vendor_settlement_adjustments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      if (pendingVendorError) throw pendingVendorError;
      if (pendingCustomerError) throw pendingCustomerError;
      if (orderError) throw orderError;
      if (customerError) throw customerError;
      if (settlementError) throw settlementError;

      if (activeData) {
        const loadedVendors = activeData as Vendor[];
        const signedEntries = await Promise.all(loadedVendors.filter((vendor) => vendor.profile_photo_url || vendor.store_photo_url).map(async (vendor) => {
          const photoPath = vendor.profile_photo_url ?? vendor.store_photo_url;
          const { data: signedPhoto } = await supabase.storage.from('vendor-verification').createSignedUrl(photoPath!, 3600);
          return signedPhoto?.signedUrl ? [vendor.id, signedPhoto.signedUrl] as const : null;
        }));
        setPhotoUrls(Object.fromEntries(signedEntries.filter(Boolean) as [string, string][]));
        setVendors(loadedVendors);
      }

      setMetrics(prev => ({
        ...prev,
        activeVendors: activeData ? activeData.length : 0,
        totalOrders: orderCount ?? 0,
        customers: customerCount ?? 0,
        pendingApprovals: (pendingVendorCount || 0) + (pendingCustomerCount || 0),
        pendingSettlements: settlementCount ?? 0,
      }));

    } catch (error: any) {
      console.error('Error loading dashboard data:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const physicalVendors = vendors.filter((vendor) => {
    const storeType = vendor.store_type?.trim().toLowerCase();
    return storeType === 'physical' || storeType === 'physical store' || storeType === 'store';
  });
  const homeVendors = vendors.filter((vendor) => !physicalVendors.some((physicalVendor) => physicalVendor.id === vendor.id));

  const handleLogout = () => {
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFBF7" />
      
      <SafeAreaView style={styles.safeArea}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <View style={styles.badgeWrapper}>
              <Text style={styles.adminTag}>ToledoGo Administrator</Text>
            </View>
            <Text style={styles.headerTitle}>System Overview</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Feather name="log-out" size={18} color="#D97706" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />
          }
        >
          
          {/* --- 1. KPI METRICS GRID --- */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#FDF3E7' }]}>
                <MaterialCommunityIcons name="storefront-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{metrics.activeVendors}</Text>
              <Text style={styles.statLabel}>Active Vendors</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#FDF3E7' }]}>
                <MaterialCommunityIcons name="shopping-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{metrics.totalOrders}</Text>
              <Text style={styles.statLabel}>Total Orders</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#FDF3E7' }]}>
                <MaterialCommunityIcons name="account-multiple-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{metrics.customers}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#FDF3E7' }]}>
                <MaterialCommunityIcons name="clock-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{metrics.pendingApprovals}</Text>
              <Text style={styles.statLabel}>Pending Reviews</Text>
            </View>
          </View>

          {/* --- 2. SYSTEM CONTROL (QUICK ACTIONS) --- */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>System Control</Text>
          </View>
          
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => router.push('/admin/vendor')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FDF3E7' }]}>
                <Feather name="users" size={20} color="#D97706" />
              </View>
              <Text style={styles.actionText}>Manage Vendors</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/admin/settlements')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FDF3E7' }]}>
                <Feather name="repeat" size={20} color="#D97706" />
              </View>
              <Text style={styles.actionText}>Refund Settlements</Text>
              {metrics.pendingSettlements > 0 && <View style={styles.actionBadge}><Text style={styles.actionBadgeText}>{metrics.pendingSettlements}</Text></View>}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => router.push('/admin/approvals')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FDF3E7' }]}>
                <Feather name="check-square" size={20} color="#D97706" />
              </View>
              <Text style={styles.actionText}>Approvals</Text>
              {metrics.pendingApprovals > 0 && (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>{metrics.pendingApprovals}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => router.push('/admin/support')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FDF3E7' }]}> 
                <Feather name="message-square" size={20} color="#D97706" />
              </View>
              <Text style={styles.actionText}>Support Tickets</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/admin/ledger')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#ECFDF5' }]}>
                <Feather name="bar-chart-2" size={20} color="#15803D" />
              </View>
              <Text style={styles.actionText}>Financial Ledger</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/admin/moderation')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#F5F3FF' }]}>
                <Feather name="shield" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.actionText}>Moderation</Text>
            </TouchableOpacity>
          </View>

          {loading && !refreshing ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#D97706" />
            </View>
          ) : (
            <>
              {/* --- 3A. PHYSICAL STORE VENDORS --- */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="store-marker-outline" size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Physical Store Vendors</Text>
                </View>
              </View>

              {physicalVendors.length === 0 ? (
                <Text style={styles.emptySubText}>No active physical stores found.</Text>
              ) : (
                physicalVendors.map((vendor) => (
                  <TouchableOpacity 
                    key={vendor.id} 
                    style={styles.vendorCard}
                    onPress={() => router.push({
                      pathname: '/admin/vendor-details',
                      params: { id: vendor.id, name: vendor.business_name }
                    })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.vendorInfoRow}>
                      {photoUrls[vendor.id] ? <Image source={{ uri: photoUrls[vendor.id] }} style={styles.vendorAvatar} /> : <View style={[styles.vendorAvatar, { backgroundColor: '#FDF3E7' }]}>
                        <Feather name="map-pin" size={18} color="#D97706" />
                      </View>}
                      
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.vendorNameText} numberOfLines={1}>{vendor.business_name}</Text>
                        <Text style={styles.vendorSpecialty} numberOfLines={1}>{vendor.cuisine_specialty || 'General Delicacies'}</Text>
                        
                        <View style={styles.vendorMetaRow}>
                          <View style={styles.statusDot} />
                          <Text style={styles.barangayText} numberOfLines={1}>{vendor.physical_address || 'Toledo City'}</Text>
                        </View>
                      </View>
                      
                      <Feather name="chevron-right" size={18} color="#A8A29E" />
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {/* --- 3B. HOME-BASED VENDORS --- */}
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="home-outline" size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Home-Based Vendors</Text>
                </View>
              </View>

              {homeVendors.length === 0 ? (
                <Text style={styles.emptySubText}>No active home-based vendors found.</Text>
              ) : (
                homeVendors.map((vendor) => (
                  <TouchableOpacity 
                    key={vendor.id} 
                    style={styles.vendorCard}
                    onPress={() => router.push({
                      pathname: '/admin/vendor-details',
                      params: { id: vendor.id, name: vendor.business_name }
                    })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.vendorInfoRow}>
                      {photoUrls[vendor.id] ? <Image source={{ uri: photoUrls[vendor.id] }} style={styles.vendorAvatar} /> : <View style={[styles.vendorAvatar, { backgroundColor: '#F5EFEB' }]}>
                        <Feather name="home" size={18} color="#78716C" />
                      </View>}
                      
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.vendorNameText} numberOfLines={1}>{vendor.business_name}</Text>
                        <Text style={styles.vendorSpecialty} numberOfLines={1}>{vendor.cuisine_specialty || 'Home-based items'}</Text>
                        
                        <View style={styles.vendorMetaRow}>
                          <View style={[styles.statusDot, { backgroundColor: '#3B82F6' }]} />
                          <Text style={styles.barangayText} numberOfLines={1}>{vendor.physical_address || 'Toledo City'}</Text>
                        </View>
                      </View>
                      
                      <Feather name="chevron-right" size={18} color="#A8A29E" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF7' },
  safeArea: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFEB'
  },
  headerTextBlock: { alignItems: 'flex-start' },
  badgeWrapper: {
    backgroundColor: '#FDF3E7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4
  },
  adminTag: { 
    fontSize: 10, 
    fontWeight: '800', 
    color: '#D97706', 
    textTransform: 'uppercase', 
    letterSpacing: 1.2,
  },
  headerTitle: { color: '#292524', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  logoutBtn: { 
    backgroundColor: '#FFFFFF', 
    padding: 10, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: '#E7E5E4',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1
  },
  scrollContent: { padding: 20, paddingTop: 16, paddingBottom: 40 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  statCard: { 
    backgroundColor: '#FFFFFF', 
    width: (width - 52) / 2, 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F5EFEB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statValue: { fontSize: 20, fontWeight: '900', color: '#292524', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, color: '#78716C', fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#292524', letterSpacing: -0.3 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 24 },
  actionCard: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    padding: 14, 
    borderRadius: 18, 
    alignItems: 'center', 
    justifyContent: 'center',
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#F5EFEB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionText: { fontSize: 11, fontWeight: '800', color: '#292524', textAlign: 'center', letterSpacing: -0.2 },
  actionBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#D97706', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  actionBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  vendorCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 14, 
    borderRadius: 18, 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F5EFEB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  vendorInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  vendorAvatar: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  vendorNameText: { fontSize: 14, fontWeight: '800', color: '#292524', letterSpacing: -0.2 },
  vendorSpecialty: { fontSize: 11, color: '#78716C', fontWeight: '600', marginTop: 1 },
  vendorMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  barangayText: { fontSize: 10, color: '#A8A29E', fontWeight: '600', flex: 1 },
  emptySubText: { fontSize: 12, color: '#A8A29E', fontStyle: 'italic', marginBottom: 10, marginLeft: 4 }
});