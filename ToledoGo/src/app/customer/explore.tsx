import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

interface Vendor {
  id: string;
  business_name: string;
  cuisine_specialty?: string | null;
  physical_address?: string | null;
  store_type?: string | null;
  fulfillment_mode?: string | null;
  meetup_details?: string | null;
  store_photo_url?: string | null;
  profile_photo_url?: string | null;
  menus?: MenuItem[];
}

interface MenuItem {
  id: string;
  vendor_id: string;
  name: string;
  description?: string | null;
  price: number;
  menu_image_url?: string | null;
  category?: string | null;
  stock_quantity: number;
}

const categories = ['All', 'Home-cooked', 'Baked goods', 'Seafood', 'Snacks'];
const fulfillmentFilters = ['All options', 'In-store', 'Meet-ups', 'Both'];

const getCategory = (specialty?: string | null) => {
  const value = specialty?.toLowerCase() ?? '';
  if (value.includes('bread') || value.includes('cake') || value.includes('bake')) return 'Baked goods';
  if (value.includes('seafood') || value.includes('fish') || value.includes('shell')) return 'Seafood';
  if (value.includes('snack') || value.includes('kakanin') || value.includes('dessert')) return 'Snacks';
  return 'Home-cooked';
};

const getFulfillmentLabel = (mode?: string | null) => {
  if (mode === 'both') return 'In-store + meet-up';
  if (mode === 'meetup') return 'Location meet-up';
  return 'In-store pickup';
};

const getFulfillmentIcon = (mode?: string | null) => mode === 'meetup' ? 'map-marker' : mode === 'both' ? 'swap-horizontal' : 'storefront-outline';

export default function CustomerExploreScreen() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [fulfillment, setFulfillment] = useState('All options');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVendors = async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const [{ data, error: vendorError }, { data: menuData, error: menuError }] = await Promise.all([
        supabase
        .from('vendors')
        .select('id, business_name, cuisine_specialty, physical_address, store_type, fulfillment_mode, meetup_details, store_photo_url, profile_photo_url')
        .eq('is_verified', true)
        .order('business_name'),
        supabase.from('menus').select('id, vendor_id, name, description, price, menu_image_url, category, stock_quantity').eq('is_available', true).gt('stock_quantity', 0),
      ]);

      if (vendorError) throw vendorError;
      if (menuError) throw menuError;
      const visibleVendors = (data ?? []) as Vendor[];
      const menusByVendor = ((menuData ?? []) as MenuItem[]).reduce<Record<string, MenuItem[]>>((grouped, menu) => {
        grouped[menu.vendor_id] = [...(grouped[menu.vendor_id] ?? []), menu];
        return grouped;
      }, {});
      visibleVendors.forEach((vendor) => { vendor.menus = menusByVendor[vendor.id] ?? []; });
      const signedEntries = await Promise.all(visibleVendors.filter((vendor) => vendor.profile_photo_url || vendor.store_photo_url).map(async (vendor) => {
        const photoPath = vendor.profile_photo_url ?? vendor.store_photo_url;
        const { data: signed } = await supabase.storage.from('vendor-verification').createSignedUrl(photoPath!, 3600);
        return signed?.signedUrl ? [vendor.id, signed.signedUrl] as const : null;
      }));
      setPhotoUrls(Object.fromEntries(signedEntries.filter(Boolean) as [string, string][]));
      setVendors(visibleVendors);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load verified kitchens.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      await loadVendors();
      if (!isMounted) return;
    };

    runLoad();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredVendors = useMemo(() => vendors.filter((vendor) => {
    const query = search.trim().toLowerCase();
    const searchable = `${vendor.business_name} ${vendor.cuisine_specialty ?? ''} ${vendor.physical_address ?? ''}`.toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    const matchesCategory = category === 'All' || getCategory(vendor.cuisine_specialty) === category;
    const matchesFulfillment = fulfillment === 'All options'
      || (fulfillment === 'In-store' && (vendor.fulfillment_mode === 'instore' || vendor.fulfillment_mode === 'both'))
      || (fulfillment === 'Meet-ups' && (vendor.fulfillment_mode === 'meetup' || vendor.fulfillment_mode === 'both'))
      || (fulfillment === 'Both' && vendor.fulfillment_mode === 'both');
    return matchesSearch && matchesCategory && matchesFulfillment;
  }), [category, fulfillment, search, vendors]);

  const physicalVendors = filteredVendors.filter((vendor) => vendor.store_type?.toLowerCase() === 'physical');
  const homeVendors = filteredVendors.filter((vendor) => vendor.store_type?.toLowerCase() !== 'physical');

  const renderVendor = (vendor: Vendor) => (
    <TouchableOpacity key={vendor.id} style={styles.vendorCard} activeOpacity={0.9} onPress={() => router.push({ pathname: '/customer/vendor/[id]', params: { id: vendor.id } })}>
      {photoUrls[vendor.id] ? (
        <Image source={{ uri: photoUrls[vendor.id] }} style={styles.cover} resizeMode="cover" />
      ) : (
        <LinearGradient colors={vendor.store_type === 'physical' ? ['#7C2D12', '#C2410C'] : ['#9F1239', '#E11D48']} style={styles.cover}>
          <MaterialCommunityIcons name={vendor.store_type === 'physical' ? 'storefront-outline' : 'home-heart'} size={34} color="#FFF7ED" />
          <Text style={styles.coverLabel}>{vendor.store_type === 'physical' ? 'PHYSICAL STORE' : 'HOME KITCHEN'}</Text>
        </LinearGradient>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.vendorName} numberOfLines={1}>{vendor.business_name}</Text>
          <View style={styles.verified}><Feather name="check" size={11} color="#166534" /></View>
        </View>
        <Text style={styles.specialty} numberOfLines={1}>{vendor.cuisine_specialty || 'Local specialties'}</Text>
        <View style={styles.detailRow}>
          <Feather name="map-pin" size={13} color="#A8A29E" />
          <Text style={styles.detailText} numberOfLines={1}>{vendor.physical_address || 'Toledo City'}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name={getFulfillmentIcon(vendor.fulfillment_mode) as any} size={14} color="#A8A29E" />
          <Text style={styles.detailText}>{getFulfillmentLabel(vendor.fulfillment_mode)}</Text>
        </View>
        {vendor.meetup_details && (vendor.fulfillment_mode === 'meetup' || vendor.fulfillment_mode === 'both') ? (
          <Text style={styles.meetupText} numberOfLines={1}>Meet-up: {vendor.meetup_details}</Text>
        ) : null}
      </View>
      <View style={styles.openButton}><Text style={styles.openButtonText}>View menu</Text><Feather name="arrow-up-right" size={14} color="#FFFFFF" /></View>
    </TouchableOpacity>
  );

  const renderSection = (title: string, subtitle: string, icon: 'storefront-outline' | 'home-heart', list: Vendor[]) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}><MaterialCommunityIcons name={icon} size={20} color="#C2410C" /></View>
        <View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>
      </View>
      {list.length > 0 ? list.map(renderVendor) : <Text style={styles.emptyText}>No results in this section.</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F2" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVendors(); }} tintColor="#C2410C" />}
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/customer/dashboard')} accessibilityLabel="Back to dashboard">
              <Feather name="arrow-left" size={19} color="#292524" />
            </TouchableOpacity>
            <View><Text style={styles.eyebrow}>TOLEDOGO DISCOVER</Text><Text style={styles.title}>Explore local food</Text></View>
            <View style={styles.countBubble}><Text style={styles.countText}>{filteredVendors.length}</Text></View>
          </View>

          <View style={styles.searchBox}>
            <Feather name="search" size={18} color="#A8A29E" />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search vendors, dishes, or places" placeholderTextColor="#A8A29E" />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x-circle" size={17} color="#A8A29E" /></TouchableOpacity> : null}
          </View>

          <Text style={styles.filterHeading}>Browse by taste</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
            {categories.map((item) => <TouchableOpacity key={item} style={[styles.chip, category === item && styles.chipActive]} onPress={() => setCategory(item)}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}
          </ScrollView>

          <Text style={styles.filterHeading}>How do you want to collect?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
            {fulfillmentFilters.map((item) => <TouchableOpacity key={item} style={[styles.chip, fulfillment === item && styles.chipActive]} onPress={() => setFulfillment(item)}><Text style={[styles.chipText, fulfillment === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {!loading && filteredVendors.length === 0 ? <Text style={styles.emptyText}>No verified kitchens match these filters yet.</Text> : null}
          {renderSection('Physical stores', 'Open storefronts around Toledo City', 'storefront-outline', physicalVendors)}
          {renderSection('Home-based kitchens', 'Local makers cooking from home', 'home-heart', homeVendors)}
        </ScrollView>
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/customer/dashboard')}><Feather name="home" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Home</Text></TouchableOpacity>
          <View style={styles.navItem}><View style={styles.activeNavIcon}><Feather name="compass" size={17} color="#FFFFFF" /></View><Text style={styles.activeNavLabel}>Explore</Text></View>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/customer/orders')}><Feather name="shopping-bag" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Orders</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/customer/profile')}><Feather name="user" size={19} color="#A8A29E" /><Text style={styles.navLabel}>Profile</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 20, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#292524', fontSize: 23, fontWeight: '900', marginTop: 3 },
  countBubble: { marginLeft: 'auto', minWidth: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#C2410C', fontSize: 13, fontWeight: '900' },
  searchBox: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 14, minHeight: 52, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, color: '#292524', fontSize: 14, marginLeft: 10 },
  filterHeading: { color: '#292524', fontSize: 13, fontWeight: '900', marginTop: 20, marginBottom: 9 },
  chipList: { gap: 8, paddingBottom: 2 },
  chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' },
  chipText: { color: '#78716C', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  loader: { marginVertical: 24 },
  errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginTop: 18, fontSize: 12 },
  section: { marginTop: 25 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: '#292524', fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: '#A8A29E', fontSize: 11, marginTop: 3 },
  vendorCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 8, marginBottom: 13 },
  cover: { width: '100%', height: 142, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  coverLabel: { color: '#FFF7ED', fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginTop: 5 },
  cardBody: { padding: 7, paddingBottom: 5, paddingRight: 7 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendorName: { color: '#292524', fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verified: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  specialty: { color: '#C2410C', fontSize: 12, fontWeight: '700', marginTop: 4, marginBottom: 7 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  detailText: { color: '#78716C', fontSize: 11, marginLeft: 6, flexShrink: 1 },
  meetupText: { color: '#9F1239', fontSize: 11, fontWeight: '700', marginTop: 8 },
  menuPreview: { backgroundColor: '#FFF9F2', borderRadius: 10, padding: 9, marginTop: 10 },
  menuPreviewLabel: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  menuThumb: { width: 42, height: 42, borderRadius: 9, marginTop: 6 },
  menuPreviewText: { color: '#292524', fontSize: 11, fontWeight: '700', marginTop: 4, flexShrink: 1 },
  menuMore: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  noMenuText: { color: '#A8A29E', fontSize: 10, fontStyle: 'italic', marginTop: 9 },
  openButton: { backgroundColor: '#C2410C', borderRadius: 11, minHeight: 38, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8 },
  openButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptyText: { color: '#78716C', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3E8DC', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 58, gap: 4 },
  activeNavIcon: { width: 32, height: 27, borderRadius: 13, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center' },
  navLabel: { color: '#A8A29E', fontSize: 10, fontWeight: '700' },
  activeNavLabel: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
});
