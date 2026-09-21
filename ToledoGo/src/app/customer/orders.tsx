import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
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
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../../Services/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
type OrderTab = 'active' | 'history';

interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  note?: string | null;
  reviewed?: boolean;
}

interface CustomerOrder {
  id: string;
  qr_code_string?: string | null;
  vendor_id: string;
  status: OrderStatus;
  total: number;
  fulfillment_mode: 'instore' | 'meetup';
  pickup_details?: string | null;
  delivery_notes?: string | null;
  created_at: string;
  items: OrderItem[];
  customer_name?: string | null;
  business_name?: string | null;
}

const tabs: { key: OrderTab; label: string }[] = [
  { key: 'active', label: 'Active orders' },
  { key: 'history', label: 'Order history' },
];

const statusLabel: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusColor: Record<OrderStatus, string> = {
  pending: '#C2410C',
  preparing: '#9A5E00',
  ready: '#15803D',
  completed: '#166534',
  cancelled: '#B91C1C',
};

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [tab, setTab] = useState<OrderTab>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOrder, setReviewOrder] = useState<CustomerOrder | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewPhotoUri, setReviewPhotoUri] = useState<string | null>(null);
  const [reviewPhotoBase64, setReviewPhotoBase64] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data: orderRows, error: orderError } = await supabase
        .from('orders')
        .select('id, qr_code_string, vendor_id, status, total, fulfillment_mode, pickup_details, delivery_notes, created_at, items, customer_name')
        .eq('customer_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (orderError) throw orderError;

      const vendorIds = Array.from(new Set((orderRows ?? []).map((order) => order.vendor_id).filter(Boolean)));
      const orderIds = (orderRows ?? []).map((order) => order.id);
      const { data: reviewRows } = orderIds.length ? await supabase.from('reviews').select('order_id, menu_item_id').in('order_id', orderIds) : { data: [] };
      const reviewedKeys = new Set((reviewRows ?? []).map((review) => `${review.order_id}:${review.menu_item_id}`));
      let vendorMap: Record<string, string> = {};

      if (vendorIds.length > 0) {
        const { data: vendorRows, error: vendorError } = await supabase
          .from('vendors')
          .select('id, business_name')
          .in('id', vendorIds);

        if (vendorError) throw vendorError;
        vendorMap = Object.fromEntries((vendorRows ?? []).map((vendor) => [vendor.id, vendor.business_name]));
      }

      const mappedOrders = (orderRows ?? []).map((order) => ({
        ...order,
        items: Array.isArray(order.items) ? (order.items as OrderItem[]).map((item) => ({ ...item, reviewed: reviewedKeys.has(`${order.id}:${item.id}`) })) : [],
        business_name: vendorMap[order.vendor_id] ?? 'Local kitchen',
      })) as CustomerOrder[];

      setOrders(mappedOrders);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  const openReview = (order: CustomerOrder, item: OrderItem) => {
    setReviewOrder(order);
    setReviewItem(item);
    setReviewRating(5);
    setReviewComment('');
    setReviewPhotoUri(null);
    setReviewPhotoBase64(null);
  };

  const pickReviewPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8, base64: true });
    if (!result.canceled && result.assets?.[0]) {
      setReviewPhotoUri(result.assets[0].uri);
      setReviewPhotoBase64(result.assets[0].base64 ?? null);
    }
  };

  const submitReview = async () => {
    if (!reviewOrder || !reviewItem || submittingReview) return;
    setSubmittingReview(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      let photoPath: string | null = null;
      if (reviewPhotoBase64) {
        photoPath = `${userData.user.id}/${reviewOrder.id}-${reviewItem.id}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('review-photos').upload(photoPath, decode(reviewPhotoBase64), { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data, error: reviewError } = await supabase.rpc('submit_review', {
        review_order_id: reviewOrder.id,
        review_menu_item_id: reviewItem.id,
        review_rating: reviewRating,
        review_comment: reviewComment,
        review_photo_url: photoPath,
      });
      if (reviewError) throw reviewError;
      setOrders((current) => current.map((order) => order.id === reviewOrder.id ? { ...order, items: order.items.map((item) => item.id === reviewItem.id ? { ...item, reviewed: true } : item) } : order));
      setReviewOrder(null);
      setReviewItem(null);
      Alert.alert('Congratulations!', `Your review is live and you earned ${Number(data?.[0]?.coins_awarded ?? 0).toFixed(1)} ToledoCoins.`);
    } catch (submitError: any) {
      Alert.alert('Could not submit review', submitError.message ?? 'Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const safeLoad = async () => {
      await loadOrders();
      if (!isMounted) return;
    };

    safeLoad();

    return () => {
      isMounted = false;
    };
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    if (tab === 'active') {
      return orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled');
    }
    return orders.filter((order) => order.status === 'completed' || order.status === 'cancelled');
  }, [orders, tab]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/customer/dashboard');
            }}
          >
            <Feather name="arrow-left" size={20} color="#C2410C" />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CUSTOMER ORDERS</Text>
            <Text style={styles.title}>My orders</Text>
            <Text style={styles.subtitle}>Track every pickup, meet-up, and ready-for-collection item.</Text>
          </View>

          <View style={styles.headerIcon}>
            <Feather name="clipboard" size={20} color="#FFF7ED" />
          </View>
        </LinearGradient>

        <View style={styles.tabRow}>
          {tabs.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.tabButton, tab === item.key && styles.tabButtonActive]}
              onPress={() => setTab(item.key)}
            >
              <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor="#C2410C" />}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}

          {!loading && visibleOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="basket-outline" size={42} color="#C2410C" />
              <Text style={styles.emptyTitle}>{tab === 'active' ? 'No active orders' : 'No past orders yet'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'active'
                  ? 'Your current pickups and meet-ups will appear here.'
                  : 'Completed dishes and previous orders will show up here.'}
              </Text>
            </View>
          ) : null}

          {visibleOrders.map((order) => {
            const reminder = order.fulfillment_mode === 'meetup' && (order.pickup_details || order.delivery_notes);

            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: '/customer/order-pass', params: { orderId: order.id } })}
                accessibilityLabel={`Open order pass for ${order.business_name}`}
              >
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderId}>ORD-{order.id.slice(0, 6).toUpperCase()}</Text>
                    <Text style={styles.vendorName}>{order.business_name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor[order.status]}1A` }]}>
                    <Text style={[styles.statusText, { color: statusColor[order.status] }]}>{statusLabel[order.status]}</Text>
                  </View>
                </View>

                {order.qr_code_string ? (
                  <View style={styles.receiptBox}>
                    <QRCode value={order.qr_code_string} size={124} backgroundColor="#FFFFFF" color="#292524" />
                    <View style={styles.receiptCopy}>
                      <Text style={styles.receiptTitle}>Pickup QR receipt</Text>
                      <Text style={styles.receiptText}>Show this code to the vendor at pickup or meet-up.</Text>
                      <Text style={styles.receiptCode}>{order.qr_code_string.slice(0, 10).toUpperCase()}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.metaRow}>
                  <Feather name="clock" size={13} color="#A8A29E" />
                  <Text style={styles.metaText}>{new Date(order.created_at).toLocaleString()}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Feather name={order.fulfillment_mode === 'meetup' ? 'map-pin' : 'shopping-bag'} size={13} color="#A8A29E" />
                  <Text style={styles.metaText}>
                    {order.fulfillment_mode === 'meetup' ? 'Meet-up order' : 'Pickup order'}
                  </Text>
                </View>

                {reminder ? (
                  <View style={styles.reminderBox}>
                    <View style={styles.reminderHeader}>
                      <MaterialCommunityIcons name="calendar-clock" size={16} color="#9F1239" />
                      <Text style={styles.reminderTitle}>Meet-up reminder</Text>
                    </View>
                    <Text style={styles.reminderText}>{order.pickup_details || order.delivery_notes}</Text>
                  </View>
                ) : null}

                <View style={styles.itemList}>
                  {(order.items ?? []).map((item, index) => (
                    <View key={`${order.id}-${index}`} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.qty}x {item.name}</Text>
                      <View style={styles.itemActions}><Text style={styles.itemPrice}>PHP {Number(item.price * item.qty).toFixed(2)}</Text>{order.status === 'completed' && !item.reviewed ? <TouchableOpacity style={styles.reviewButton} onPress={() => openReview(order, item)}><Feather name="star" size={11} color="#FFFFFF" /><Text style={styles.reviewButtonText}>Review</Text></TouchableOpacity> : null}{item.reviewed ? <Text style={styles.reviewedText}>Reviewed</Text> : null}</View>
                    </View>
                  ))}
                </View>

                {order.items?.some((item) => item.note) ? (
                  <View style={styles.noteBox}>
                    <Feather name="message-square" size={13} color="#9F1239" />
                    <Text style={styles.noteText}>{order.items.filter((item) => item.note).map((item) => item.note).join(' • ')}</Text>
                  </View>
                ) : null}

                <View style={styles.footerRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <View style={styles.footerActions}>
                    <View style={styles.passLink}><Text style={styles.passLinkText}>View pass</Text><Feather name="arrow-up-right" size={15} color="#C2410C" /></View>
                    <Text style={styles.totalValue}>PHP {Number(order.total).toFixed(2)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {reviewOrder && reviewItem ? <View style={styles.reviewBackdrop}><View style={styles.reviewModal}><View style={styles.reviewHeader}><View><Text style={styles.reviewEyebrow}>POST-PURCHASE REVIEW</Text><Text style={styles.reviewTitle}>{reviewItem.name}</Text></View><TouchableOpacity onPress={() => setReviewOrder(null)}><Feather name="x" size={22} color="#292524" /></TouchableOpacity></View><Text style={styles.reviewPrompt}>How was this dish?</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} onPress={() => setReviewRating(star)}><Feather name="star" size={30} color="#D97706" fill={star <= reviewRating ? '#D97706' : 'transparent'} /></TouchableOpacity>)}</View><TextInput style={styles.reviewInput} value={reviewComment} onChangeText={setReviewComment} placeholder="Taste, portion size, packaging..." placeholderTextColor="#A8A29E" multiline /><TouchableOpacity style={styles.photoButton} onPress={pickReviewPhoto}>{reviewPhotoUri ? <><Image source={{ uri: reviewPhotoUri }} style={styles.reviewPhoto} /><Text style={styles.photoButtonText}>Change food photo</Text></> : <><Feather name="camera" size={18} color="#C2410C" /><Text style={styles.photoButtonText}>Add food photo (+3 coins)</Text></>}</TouchableOpacity><Text style={styles.rewardHint}>{reviewComment.trim() ? '+2 coins for your comment' : 'Write a comment for +2 coins'}{reviewPhotoUri ? ' · Photo reward included' : ''}</Text><TouchableOpacity style={styles.submitReviewButton} onPress={submitReview} disabled={submittingReview}>{submittingReview ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitReviewText}>Submit review</Text>}</TouchableOpacity></View></View> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3E8DC' },
  tabButton: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FCD7B6', alignItems: 'center' },
  tabButtonActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' },
  tabText: { color: '#7C2D12', fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 35 },
  loader: { marginVertical: 30 },
  errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 25 },
  emptyTitle: { color: '#292524', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#78716C', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 },
  orderCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 18, padding: 14, marginBottom: 14 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  orderId: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  vendorName: { color: '#292524', fontSize: 16, fontWeight: '900', marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '900' },
  receiptBox: { marginTop: 14, padding: 12, backgroundColor: '#FFF9F2', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  receiptCopy: { flex: 1 },
  receiptTitle: { color: '#7C2D12', fontSize: 13, fontWeight: '900' },
  receiptText: { color: '#78716C', fontSize: 11, lineHeight: 16, marginTop: 5 },
  receiptCode: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 9 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: '#6B7280', fontSize: 11, fontWeight: '700' },
  reminderBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FBCFE8' },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reminderTitle: { color: '#9F1239', fontSize: 12, fontWeight: '900' },
  reminderText: { color: '#9F1239', fontSize: 11, lineHeight: 17, marginTop: 6 },
  itemList: { marginTop: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3E8DC' },
  itemName: { color: '#292524', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  itemActions: { alignItems: 'flex-end', gap: 5 },
  itemPrice: { color: '#C2410C', fontSize: 12, fontWeight: '900' },
  reviewButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D97706', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  reviewButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  reviewedText: { color: '#15803D', fontSize: 9, fontWeight: '900' },
  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, padding: 10, backgroundColor: '#FFF7ED', borderRadius: 10 },
  noteText: { color: '#7C2D12', fontSize: 11, flex: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3E8DC' },
  footerActions: { alignItems: 'flex-end', gap: 5 },
  passLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  passLinkText: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
  totalLabel: { color: '#292524', fontSize: 13, fontWeight: '900' },
  totalValue: { color: '#C2410C', fontSize: 18, fontWeight: '900' },
  reviewBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(41,37,36,0.58)', justifyContent: 'flex-end' },
  reviewModal: { backgroundColor: '#FFF9F2', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  reviewEyebrow: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  reviewTitle: { color: '#292524', fontSize: 20, fontWeight: '900', marginTop: 4 },
  reviewPrompt: { color: '#57534E', fontSize: 13, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  reviewInput: { minHeight: 88, marginTop: 18, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', color: '#292524', textAlignVertical: 'top' },
  photoButton: { minHeight: 52, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FED7AA', backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', gap: 5, overflow: 'hidden' },
  photoButtonText: { color: '#C2410C', fontSize: 11, fontWeight: '900' },
  reviewPhoto: { width: '100%', height: 90 },
  rewardHint: { color: '#B45309', fontSize: 10, textAlign: 'center', marginTop: 10 },
  submitReviewButton: { minHeight: 48, marginTop: 16, borderRadius: 13, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center' },
  submitReviewText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
