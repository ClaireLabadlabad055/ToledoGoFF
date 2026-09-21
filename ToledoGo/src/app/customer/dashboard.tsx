import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  owner_name?: string | null;
  cuisine_specialty?: string | null;
  physical_address?: string | null;
  store_type?: string | null;
  fulfillment_mode?: string | null;
  meetup_details?: string | null;
  store_photo_url?: string | null;
  profile_photo_url?: string | null;
  menus?: MenuItem[];
  isDemo?: boolean;
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

const featuredItems = [
  { name: 'Humba bowl', detail: 'Slow-cooked comfort food', search: 'humba', icon: 'food-drumstick-outline' as const, colors: ['#7C2D12', '#C2410C'] as const },
  { name: 'Fresh from Toledo', detail: 'Local catch and grilled favorites', search: 'seafood', icon: 'fish' as const, colors: ['#9F1239', '#E11D48'] as const },
  { name: 'Baked this morning', detail: 'Bread, cakes, and kakanin', search: 'baked', icon: 'cupcake' as const, colors: ['#92400E', '#D97706'] as const },
];

const demoVendors: Vendor[] = [
  {
    id: 'demo-aling-nitas',
    business_name: 'Aling Nita\'s Lutong Bahay',
    owner_name: 'Nita Santos',
    cuisine_specialty: 'Humba, sinugba, and daily home-cooked meals',
    physical_address: 'Barangay Tubod, Toledo City',
    store_type: 'home',
    fulfillment_mode: 'both',
    meetup_details: 'Toledo Plaza, Fridays 4-6 PM',
    isDemo: true,
  },
  {
    id: 'demo-bakeshop',
    business_name: 'Copper Kettle Bakes',
    owner_name: 'Mara Villacorta',
    cuisine_specialty: 'Fresh bread, ensaymada, and cakes',
    physical_address: 'Toledo Public Market',
    store_type: 'physical',
    fulfillment_mode: 'instore',
    isDemo: true,
  },
  {
    id: 'demo-seafood',
    business_name: 'Bato Fresh Catch',
    owner_name: 'Joel Ramirez',
    cuisine_specialty: 'Fresh seafood and grilled fish',
    physical_address: 'Barangay Bato, Toledo City',
    store_type: 'home',
    fulfillment_mode: 'meetup',
    meetup_details: 'Bato covered court, Saturdays 9-11 AM',
    isDemo: true,
  },
];

const getCategory = (specialty?: string | null) => {
  const value = specialty?.toLowerCase() ?? '';
  if (value.includes('bread') || value.includes('cake') || value.includes('bake')) return 'Baked goods';
  if (value.includes('seafood') || value.includes('fish') || value.includes('shell')) return 'Seafood';
  if (value.includes('snack') || value.includes('kakanin') || value.includes('dessert')) return 'Snacks';
  return 'Home-cooked';
};

const getFulfillmentLabel = (mode?: string | null) => {
  if (mode === 'both') return 'Pickup + meet-up';
  if (mode === 'meetup') return 'Location meet-up';
  return 'In-store pickup';
};

export default function CustomerDashboardScreen() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customerName, setCustomerName] = useState('there');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPhotoUrls, setCoverPhotoUrls] = useState<Record<string, string>>({});
  const [customerAvatarUrl, setCustomerAvatarUrl] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace('/login');
        return;
      }

      const { data: dailyBonus } = await supabase.rpc('claim_daily_login_bonus');
      if (Number(dailyBonus) > 0) {
        Alert.alert('Welcome back!', 'You earned 0.5 ToledoCoin for today. Keep exploring local favorites!');
      }

      const [{ data: vendorData, error: vendorError }, { data: customer }, { data: menuData, error: menuError }] = await Promise.all([
        supabase
          .from('vendors')
          .select('id, business_name, owner_name, cuisine_specialty, physical_address, store_type, fulfillment_mode, meetup_details, store_photo_url, profile_photo_url')
          .eq('is_verified', true)
          .order('business_name'),
        supabase.from('customers').select('full_name, profile_photo_url').eq('id', userData.user.id).maybeSingle(),
        supabase.from('menus').select('id, vendor_id, name, description, price, menu_image_url, category, stock_quantity').eq('is_available', true).gt('stock_quantity', 0),
      ]);

      if (vendorError) throw vendorError;
      if (menuError) throw menuError;
      const verifiedVendors = (vendorData ?? []) as Vendor[];
      const availableMenus = (menuData ?? []) as MenuItem[];
      const menusByVendor = availableMenus.reduce<Record<string, MenuItem[]>>((grouped, menu) => {
        grouped[menu.vendor_id] = [...(grouped[menu.vendor_id] ?? []), menu];
        return grouped;
      }, {});
      verifiedVendors.forEach((vendor) => { vendor.menus = menusByVendor[vendor.id] ?? []; });
      const visibleVendors = verifiedVendors.length > 0 ? verifiedVendors : demoVendors;
      const signedPhotoEntries = await Promise.all(
        visibleVendors
          .filter((vendor) => vendor.profile_photo_url || vendor.store_photo_url)
          .map(async (vendor) => {
            const photoPath = vendor.profile_photo_url ?? vendor.store_photo_url;
            const { data } = await supabase.storage
              .from('vendor-verification')
              .createSignedUrl(photoPath!, 3600);
            return data?.signedUrl ? [vendor.id, data.signedUrl] as const : null;
          })
      );
      setCoverPhotoUrls(Object.fromEntries(signedPhotoEntries.filter(Boolean) as [string, string][]));
      setVendors(visibleVendors);
      setCustomerName(customer?.full_name?.split(' ')[0] || 'there');
      if (customer?.profile_photo_url) {
        const { data: signedAvatar } = await supabase.storage.from('customer-avatars').createSignedUrl(customer.profile_photo_url, 3600);
        setCustomerAvatarUrl(signedAvatar?.signedUrl ?? null);
      } else {
        setCustomerAvatarUrl(null);
      }
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load local vendors.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      await loadDashboard();
      if (!isMounted) return;
    };

    runLoad();
    return () => {
      isMounted = false;
    };
  }, [loadDashboard]);

  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vendors.filter((vendor) => {
      const matchesCategory = category === 'All' || getCategory(vendor.cuisine_specialty) === category;
      const searchable = `${vendor.business_name} ${vendor.cuisine_specialty ?? ''} ${vendor.physical_address ?? ''}`.toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [category, search, vendors]);

  const physicalVendors = filteredVendors.filter((vendor) => vendor.store_type?.toLowerCase() === 'physical');
  const homeVendors = filteredVendors.filter((vendor) => vendor.store_type?.toLowerCase() !== 'physical');

  const renderVendor = ({ item }: { item: Vendor }) => (
    <TouchableOpacity style={styles.vendorCard} activeOpacity={0.88} onPress={() => router.push({ pathname: '/customer/vendor/[id]', params: { id: item.id } })}>
      {coverPhotoUrls[item.id] ? (
        <Image source={{ uri: coverPhotoUrls[item.id] }} style={styles.vendorCover} resizeMode="cover" />
      ) : (
        <LinearGradient colors={item.store_type === 'physical' ? ['#7C2D12', '#C2410C'] : ['#9F1239', '#E11D48']} style={styles.vendorCover}>
          <MaterialCommunityIcons name={item.store_type === 'physical' ? 'storefront-outline' : 'home-heart'} size={34} color="#FFF7ED" />
          <Text style={styles.coverPlaceholderText}>{item.store_type === 'physical' ? 'LOCAL STORE' : 'HOME KITCHEN'}</Text>
        </LinearGradient>
      )}
      <View style={styles.vendorContent}>
        <View style={styles.vendorHeading}>
          <Text style={styles.vendorName} numberOfLines={1}>{item.business_name}</Text>
          <View style={styles.verifiedMark}>
            <Feather name="check" size={11} color="#166534" />
          </View>
        </View>
        <Text style={styles.specialty} numberOfLines={1}>{item.cuisine_specialty || 'Local specialties'}</Text>
        {item.isDemo ? <Text style={styles.demoLabel}>DEMO VENDOR</Text> : null}
        <View style={styles.metaRow}>
          <Feather name="map-pin" size={13} color="#A8A29E" />
          <Text style={styles.metaText} numberOfLines={1}>{item.physical_address || 'Toledo City'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Feather name="shopping-bag" size={13} color="#A8A29E" />
          <Text style={styles.metaText}>{getFulfillmentLabel(item.fulfillment_mode)}</Text>
        </View>
      </View>
      <View style={styles.cardArrow}><Feather name="arrow-up-right" size={17} color="#C2410C" /></View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F2" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboard(); }} tintColor="#C2410C" />}
        >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <View style={styles.locationRow}>
                    <Feather name="map-pin" size={13} color="#C2410C" />
                    <Text style={styles.locationLabel}>TOLEDO CITY</Text>
                    <View style={styles.locationBadge}><Text style={styles.locationBadgeText}>LOCAL ZONE</Text></View>
                  </View>
                  <Text style={styles.greeting}>Good day, {customerName}.</Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/customer/wallet')} accessibilityLabel="Open ToledoCoin wallet">
                    <Feather name="award" size={18} color="#B45309" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.profileAvatarButton} onPress={() => router.push('/customer/profile')} accessibilityLabel="Open profile">
                    {customerAvatarUrl ? <Image source={{ uri: customerAvatarUrl }} style={styles.profileAvatarImage} /> : <Feather name="user" size={18} color="#7C2D12" />}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.hero}>
                <View style={styles.heroGlow} />
                <View style={styles.heroCopy}>
                  <View style={styles.promoTag}><Text style={styles.promoTagText}>TOLEDO WEEKEND PICKS</Text></View>
                  <Text style={styles.heroTitle}>Made nearby. Worth sharing.</Text>
                  <Text style={styles.heroSubtitle}>Discover comfort food, fresh catch, and baked favorites from verified local kitchens.</Text>
                  <TouchableOpacity style={styles.heroAction} onPress={() => router.replace('/customer/explore')} activeOpacity={0.85}>
                    <Text style={styles.heroActionText}>Explore kitchens</Text>
                    <Feather name="arrow-up-right" size={14} color="#7C2D12" />
                  </TouchableOpacity>
                </View>
                <View style={styles.heroVisual}>
                  <View style={styles.heroCircle} />
                  <MaterialCommunityIcons name="silverware-fork-knife" size={48} color="#FFF7ED" />
                </View>
              </View>

              <View style={styles.featuredHeader}>
                <View>
                  <Text style={styles.sectionTitle}>What are you craving?</Text>
                  <Text style={styles.sectionSubtitle}>Fresh picks from Toledo makers</Text>
                </View>
                <TouchableOpacity style={styles.inlineAction} onPress={() => router.replace('/customer/explore')}>
                  <Feather name="arrow-up-right" size={18} color="#C2410C" />
                </TouchableOpacity>
              </View>
              <FlatList
                horizontal
                data={featuredItems}
                keyExtractor={(item) => item.name}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featuredList}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.featuredCard} activeOpacity={0.9} onPress={() => { setCategory('All'); setSearch(item.search); }}>
                    <LinearGradient colors={item.colors} style={styles.featuredArt}>
                      <MaterialCommunityIcons name={item.icon} size={54} color="#FFF7ED" />
                      <View style={styles.artSparkOne} />
                      <View style={styles.artSparkTwo} />
                    </LinearGradient>
                    <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.featuredDetail} numberOfLines={1}>{item.detail}</Text>
                  </TouchableOpacity>
                )}
              />

              <View style={styles.searchBox}>
                <Feather name="search" size={18} color="#A8A29E" />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search kitchens and specialties"
                  placeholderTextColor="#A8A29E"
                  returnKeyType="search"
                />
                {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x-circle" size={17} color="#A8A29E" /></TouchableOpacity> : null}
              </View>

              <FlatList
                horizontal
                data={categories}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryList}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.categoryChip, category === item && styles.categoryChipActive]} onPress={() => setCategory(item)}>
                    <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {loading ? <ActivityIndicator style={styles.loader} color="#C2410C" /> : null}
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Physical stores</Text>
                  <Text style={styles.sectionSubtitle}>{physicalVendors.length} {physicalVendors.length === 1 ? 'shop' : 'shops'} with a storefront</Text>
                </View>
                <MaterialCommunityIcons name="storefront-outline" size={23} color="#C2410C" />
              </View>
              {physicalVendors.length > 0 ? physicalVendors.map((vendor) => <View key={vendor.id}>{renderVendor({ item: vendor })}</View>) : <Text style={styles.emptyText}>No physical stores match your search.</Text>}

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Home-based kitchens</Text>
                  <Text style={styles.sectionSubtitle}>{homeVendors.length} local {homeVendors.length === 1 ? 'maker' : 'makers'} cooking from home</Text>
                </View>
                <MaterialCommunityIcons name="home-heart" size={23} color="#C2410C" />
              </View>
              {homeVendors.length > 0 ? homeVendors.map((vendor) => <View key={vendor.id}>{renderVendor({ item: vendor })}</View>) : <Text style={styles.emptyText}>No home-based kitchens match your search.</Text>}
        </ScrollView>
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => { setCategory('All'); setSearch(''); }}>
            <View style={styles.navIconActive}><Feather name="home" size={17} color="#FFFFFF" /></View>
            <Text style={styles.navLabelActive}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/customer/explore')}>
            <Feather name="compass" size={19} color="#A8A29E" />
            <Text style={styles.navLabel}>Explore</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/customer/orders')}>
            <Feather name="shopping-bag" size={19} color="#A8A29E" />
            <Text style={styles.navLabel}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/customer/profile')}>
            <Feather name="user" size={19} color="#A8A29E" />
            <Text style={styles.navLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 112 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 20 },
  headerCopy: { flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationLabel: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  locationBadge: { backgroundColor: '#FFF1E6', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 3 },
  locationBadgeText: { color: '#9A3412', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  greeting: { color: '#292524', fontSize: 25, fontWeight: '900', marginTop: 5 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileAvatarButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF1E6', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileAvatarImage: { width: '100%', height: '100%' },
  hero: { backgroundColor: '#7C2D12', borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', position: 'relative' },
  heroGlow: { position: 'absolute', right: -20, top: -18, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroCopy: { flex: 1, paddingRight: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', lineHeight: 27 },
  heroSubtitle: { color: '#FED7AA', fontSize: 13, lineHeight: 19, marginTop: 7 },
  promoTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,247,237,0.16)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 9 },
  promoTagText: { color: '#FED7AA', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  heroAction: { alignSelf: 'flex-start', marginTop: 13, backgroundColor: '#FFF7ED', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroActionText: { color: '#7C2D12', fontSize: 11, fontWeight: '900' },
  heroVisual: { width: 90, height: 90, borderRadius: 26, backgroundColor: 'rgba(255,247,237,0.12)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  heroCircle: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', top: 8, right: 6 },
  featuredHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 23, marginBottom: 11 },
  inlineAction: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  featuredList: { gap: 12, paddingBottom: 4 },
  featuredCard: { width: 154, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: '#F3E8DC' },
  featuredArt: { height: 108, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artSparkOne: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', top: -15, right: -7 },
  artSparkTwo: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', bottom: 9, left: 12 },
  featuredName: { color: '#292524', fontSize: 13, fontWeight: '900', marginTop: 9 },
  featuredDetail: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  searchBox: { marginTop: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 14, minHeight: 50, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, color: '#292524', fontSize: 14, marginLeft: 10 },
  categoryList: { paddingVertical: 17, gap: 8 },
  categoryChip: { borderRadius: 18, borderWidth: 1, borderColor: '#E7D9CC', paddingHorizontal: 15, paddingVertical: 9, backgroundColor: '#FFFFFF' },
  categoryChipActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' },
  categoryText: { color: '#78716C', fontSize: 12, fontWeight: '800' },
  categoryTextActive: { color: '#FFFFFF' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#292524', fontSize: 19, fontWeight: '900' },
  sectionSubtitle: { color: '#A8A29E', fontSize: 12, marginTop: 3 },
  vendorCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 8, marginBottom: 13 },
  vendorCover: { width: '100%', height: 128, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { color: '#FFF7ED', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 5 },
  cardArrow: { position: 'absolute', right: 16, bottom: 15, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  vendorContent: { minWidth: 0, padding: 6, paddingBottom: 4, paddingRight: 40 },
  vendorHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendorName: { color: '#292524', fontSize: 15, fontWeight: '900', flexShrink: 1 },
  verifiedMark: { backgroundColor: '#DCFCE7', width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  specialty: { color: '#C2410C', fontSize: 12, fontWeight: '700', marginTop: 3, marginBottom: 6 },
  demoLabel: { color: '#A8A29E', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 2 },
  menuPreview: { backgroundColor: '#FFF9F2', borderRadius: 10, padding: 9, marginTop: 10 },
  menuPreviewLabel: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  menuThumb: { width: 42, height: 42, borderRadius: 9, marginTop: 6 },
  menuPreviewText: { color: '#292524', fontSize: 11, fontWeight: '700', marginTop: 4, flexShrink: 1 },
  menuMore: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  noMenuText: { color: '#A8A29E', fontSize: 10, fontStyle: 'italic', marginTop: 9 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  metaText: { color: '#78716C', fontSize: 11, marginLeft: 6, flexShrink: 1 },
  loader: { marginVertical: 18 },
  emptyText: { color: '#78716C', fontSize: 14, textAlign: 'center', paddingVertical: 35 },
  errorText: { color: '#B91C1C', fontSize: 12, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 12 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3E8DC', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 58, gap: 4 },
  navIconActive: { width: 32, height: 27, borderRadius: 13, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center' },
  navLabel: { color: '#A8A29E', fontSize: 10, fontWeight: '700' },
  navLabelActive: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
});
