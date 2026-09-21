import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type Review = {
  id: string;
  customer_id: string;
  rating: number;
  comment?: string | null;
  photo_url?: string | null;
  vendor_response?: string | null;
  vendor_responded_at?: string | null;
  created_at: string;
  menu?: { name?: string | null } | null;
  customerName: string;
  photoUri?: string | null;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function CustomerReviewsScreen() {
  const router = useRouter();
  const { vendorId, vendorName } = useLocalSearchParams<{ vendorId: string; vendorName?: string }>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!vendorId) return;
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data: reviewRows, error: reviewError } = await supabase
        .from('reviews')
        .select('id, customer_id, rating, comment, photo_url, vendor_response, vendor_responded_at, created_at, menu:menus(name)')
        .eq('vendor_id', vendorId)
        .eq('moderation_status', 'published')
        .order('created_at', { ascending: false });
      if (reviewError) throw reviewError;

      const customerIds = Array.from(new Set((reviewRows ?? []).map((review) => review.customer_id).filter(Boolean)));
      const { data: customerRows, error: customerError } = customerIds.length
        ? await supabase.from('customers').select('id, full_name').in('id', customerIds)
        : { data: [], error: null };
      if (customerError) throw customerError;
      const customerNames = new Map((customerRows ?? []).map((customer) => [customer.id, customer.full_name]));

      const mappedReviews = await Promise.all((reviewRows ?? []).map(async (review) => {
        let photoUri: string | null = null;
        if (review.photo_url) {
          const { data: signedPhoto } = await supabase.storage.from('review-photos').createSignedUrl(review.photo_url, 3600);
          photoUri = signedPhoto?.signedUrl ?? null;
        }
        return { ...review, customerName: customerNames.get(review.customer_id) || 'ToledoGo neighbor', photoUri } as Review;
      }));
      setReviews(mappedReviews);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load customer reviews.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, vendorId]);

  useEffect(() => {
    let isMounted = true;
    const runLoad = async () => {
      await loadReviews();
      if (!isMounted) return;
    };
    runLoad();
    return () => {
      isMounted = false;
    };
  }, [loadReviews]);

  const average = useMemo(() => reviews.length ? reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length : 0, [reviews]);
  const ratingCounts = useMemo(() => [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviews.filter((review) => Number(review.rating) === rating).length })), [reviews]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReviews(); }} tintColor="#C2410C" />}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back to vendor menu">
              <Feather name="arrow-left" size={19} color="#292524" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>CUSTOMER STORIES</Text>
              <Text style={styles.title}>Reviews &amp; Ratings</Text>
              <Text style={styles.subtitle}>{vendorName || 'This local kitchen'}</Text>
            </View>
            <Feather name="message-circle" size={26} color="#FFF7ED" />
          </View>

          {!loading && !error ? <>
            <View style={styles.summaryCard}>
              <View style={styles.scoreBlock}><Text style={styles.average}>{reviews.length ? average.toFixed(1) : 'New'}</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Feather key={star} name="star" size={15} color="#D97706" fill={star <= Math.round(average) ? '#D97706' : 'transparent'} />)}</View><Text style={styles.reviewCount}>{reviews.length} review{reviews.length === 1 ? '' : 's'}</Text></View>
              <View style={styles.breakdown}>{ratingCounts.map(({ rating, count }) => <View key={rating} style={styles.breakdownRow}><Text style={styles.breakdownLabel}>{rating}</Text><Feather name="star" size={10} color="#D97706" fill="#D97706" /><View style={styles.barTrack}><View style={[styles.barFill, { width: `${reviews.length ? count / reviews.length * 100 : 0}%` }]} /></View><Text style={styles.breakdownCount}>{count}</Text></View>)}</View>
            </View>

            <Text style={styles.sectionTitle}>What neighbors are saying</Text>
            {reviews.length === 0 ? <View style={styles.emptyState}><Feather name="message-square" size={32} color="#C2410C" /><Text style={styles.emptyTitle}>No reviews yet</Text><Text style={styles.emptyText}>Be the first customer to share how this dish made your day.</Text></View> : reviews.map((review) => <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}><View style={styles.avatar}><Text style={styles.avatarText}>{review.customerName.charAt(0).toUpperCase()}</Text></View><View style={styles.reviewIdentity}><Text style={styles.customerName}>{review.customerName}</Text><Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text></View><View style={styles.rating}><Feather name="star" size={12} color="#D97706" fill="#D97706" /><Text style={styles.ratingText}>{review.rating}.0</Text></View></View>
              <Text style={styles.dishName}>{review.menu?.name || 'Menu item'}</Text>
              {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : <Text style={styles.noComment}>Shared a rating for this dish.</Text>}
              {review.photoUri ? <Image source={{ uri: review.photoUri }} style={styles.reviewPhoto} resizeMode="cover" /> : null}
              {review.vendor_response ? <View style={styles.vendorResponse}><View style={styles.vendorResponseHeading}><Feather name="corner-up-left" size={14} color="#9A3412" /><Text style={styles.vendorResponseTitle}>Vendor response</Text>{review.vendor_responded_at ? <Text style={styles.vendorResponseDate}>{formatDate(review.vendor_responded_at)}</Text> : null}</View><Text style={styles.vendorResponseText}>{review.vendor_response}</Text></View> : null}
            </View>)}
          </> : null}
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {!loading && error ? <View style={styles.errorState}><Feather name="alert-circle" size={28} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={loadReviews}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingBottom: 35 },
  header: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, backgroundColor: '#7C2D12', flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  summaryCard: { margin: 16, padding: 16, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', flexDirection: 'row', gap: 18 },
  scoreBlock: { width: 92, alignItems: 'center', justifyContent: 'center' },
  average: { color: '#292524', fontSize: 30, fontWeight: '900' },
  stars: { flexDirection: 'row', gap: 2, marginTop: 4 },
  reviewCount: { color: '#78716C', fontSize: 10, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  breakdown: { flex: 1, justifyContent: 'center', gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  breakdownLabel: { width: 9, color: '#57534E', fontSize: 10, fontWeight: '800', textAlign: 'right' },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F5EDE5', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: '#D97706' },
  breakdownCount: { width: 15, color: '#A8A29E', fontSize: 10, textAlign: 'right' },
  sectionTitle: { marginHorizontal: 18, color: '#292524', fontSize: 19, fontWeight: '900', marginBottom: 10 },
  reviewCard: { marginHorizontal: 16, marginBottom: 12, padding: 15, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#C2410C', fontSize: 13, fontWeight: '900' },
  reviewIdentity: { flex: 1 },
  customerName: { color: '#292524', fontSize: 12, fontWeight: '900' },
  reviewDate: { color: '#A8A29E', fontSize: 10, marginTop: 3 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FFFBEB' },
  ratingText: { color: '#92400E', fontSize: 10, fontWeight: '900' },
  dishName: { color: '#C2410C', fontSize: 10, fontWeight: '900', marginTop: 13, textTransform: 'uppercase', letterSpacing: 0.7 },
  comment: { color: '#57534E', fontSize: 13, lineHeight: 20, marginTop: 6 },
  noComment: { color: '#A8A29E', fontSize: 12, fontStyle: 'italic', marginTop: 6 },
  reviewPhoto: { width: '100%', height: 190, borderRadius: 12, marginTop: 12, backgroundColor: '#F5EDE5' },
  vendorResponse: { marginTop: 14, padding: 12, borderRadius: 13, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  vendorResponseHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendorResponseTitle: { color: '#9A3412', fontSize: 11, fontWeight: '900' },
  vendorResponseDate: { color: '#A8A29E', fontSize: 10, marginLeft: 'auto' },
  vendorResponseText: { color: '#57534E', fontSize: 12, lineHeight: 18, marginTop: 7 },
  emptyState: { margin: 16, padding: 36, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center' },
  emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 11 },
  emptyText: { color: '#78716C', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  loader: { marginVertical: 35 },
  errorState: { margin: 18, padding: 25, borderRadius: 17, backgroundColor: '#FEF2F2', alignItems: 'center' },
  errorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center', marginTop: 10 },
  retryButton: { marginTop: 15, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#B91C1C' },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
