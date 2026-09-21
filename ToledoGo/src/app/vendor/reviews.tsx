import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type Review = {
  id: string;
  customer_id: string;
  rating: number;
  comment?: string | null;
  photo_url?: string | null;
  moderation_status: 'published' | 'hidden';
  vendor_response?: string | null;
  vendor_responded_at?: string | null;
  created_at: string;
  menu?: { name?: string | null } | null;
  customerName: string;
  photoUri?: string | null;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function VendorReviewsScreen() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('Your kitchen');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }

      const [{ data: vendor, error: vendorError }, { data: reviewRows, error: reviewError }] = await Promise.all([
        supabase.from('vendors').select('business_name').eq('id', userData.user.id).maybeSingle(),
        supabase.from('reviews').select('id, customer_id, rating, comment, photo_url, moderation_status, vendor_response, vendor_responded_at, created_at, menu:menus(name)').eq('vendor_id', userData.user.id).order('created_at', { ascending: false }),
      ]);
      if (vendorError) throw vendorError;
      if (reviewError) throw reviewError;
      if (!vendor) throw new Error('Vendor profile not found.');
      setBusinessName(vendor.business_name);

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
        return { ...review, customerName: customerNames.get(review.customer_id) || 'Customer', photoUri } as Review;
      }));
      setReviews(mappedReviews);
      setResponseDrafts(Object.fromEntries(mappedReviews.map((review) => [review.id, review.vendor_response ?? ''])));
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your reviews.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const runLoad = async () => {
      await loadReviews();
      if (!isMounted) return;
    };
    runLoad();
    return () => { isMounted = false; };
  }, [loadReviews]);

  const average = useMemo(() => reviews.length ? reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length : 0, [reviews]);
  const fiveStarCount = reviews.filter((review) => Number(review.rating) === 5).length;
  const photoCount = reviews.filter((review) => Boolean(review.photo_url)).length;

  const saveResponse = async (review: Review) => {
    const response = responseDrafts[review.id]?.trim() ?? '';
    if (!response || savingReviewId) return;
    setSavingReviewId(review.id);
    try {
      const { error: responseError } = await supabase.rpc('respond_to_review', { response_review_id: review.id, response_text: response });
      if (responseError) throw responseError;
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, vendor_response: response, vendor_responded_at: new Date().toISOString() } : item));
      Alert.alert('Response posted', 'Customers can now see your reply on this review.');
    } catch (responseError: any) {
      Alert.alert('Could not post response', responseError.message ?? 'Please try again.');
    } finally {
      setSavingReviewId(null);
    }
  };

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
            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/vendor/dashboard')} accessibilityLabel="Back to vendor dashboard"><Feather name="arrow-left" size={19} color="#292524" /></TouchableOpacity>
            <View style={styles.headerCopy}><Text style={styles.eyebrow}>VENDOR INSIGHTS</Text><Text style={styles.title}>Reviews &amp; Ratings</Text><Text style={styles.subtitle}>{businessName} · Customer feedback</Text></View>
            <MaterialCommunityIcons name="star-circle-outline" size={28} color="#FED7AA" />
          </View>

          {!loading && !error ? <>
            <View style={styles.summaryCard}>
              <View style={styles.scoreBlock}><Text style={styles.average}>{reviews.length ? average.toFixed(1) : 'New'}</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Feather key={star} name="star" size={15} color="#D97706" fill={star <= Math.round(average) ? '#D97706' : 'transparent'} />)}</View><Text style={styles.summaryLabel}>{reviews.length} review{reviews.length === 1 ? '' : 's'}</Text></View>
              <View style={styles.insightGrid}><View style={styles.insight}><Text style={styles.insightValue}>{fiveStarCount}</Text><Text style={styles.insightLabel}>5-star reviews</Text></View><View style={styles.insight}><Text style={styles.insightValue}>{photoCount}</Text><Text style={styles.insightLabel}>Food photos</Text></View></View>
            </View>
            <View style={styles.tip}><Feather name="zap" size={16} color="#B45309" /><Text style={styles.tipText}>Use customer photos and comments to tune portions, packaging, and your best-selling dishes.</Text></View>
            <Text style={styles.sectionTitle}>Customer feedback</Text>
            {reviews.length === 0 ? <View style={styles.emptyState}><Feather name="message-square" size={32} color="#C2410C" /><Text style={styles.emptyTitle}>No reviews yet</Text><Text style={styles.emptyText}>Completed customer orders will appear here when buyers share feedback.</Text></View> : reviews.map((review) => <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}><View style={styles.avatar}><Text style={styles.avatarText}>{review.customerName.charAt(0).toUpperCase()}</Text></View><View style={styles.identity}><Text style={styles.customerName}>{review.customerName}</Text><Text style={styles.reviewDate}>{formatDate(review.created_at)} · {review.moderation_status === 'hidden' ? 'Hidden from customers' : 'Published'}</Text></View><View style={styles.rating}><Feather name="star" size={12} color="#D97706" fill="#D97706" /><Text style={styles.ratingText}>{review.rating}.0</Text></View></View>
              <Text style={styles.dishName}>{review.menu?.name || 'Menu item'}</Text>
              {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : <Text style={styles.noComment}>Customer shared a rating without a written comment.</Text>}
              {review.photoUri ? <Image source={{ uri: review.photoUri }} style={styles.reviewPhoto} resizeMode="cover" /> : null}
              <View style={styles.responseBox}><View style={styles.responseHeading}><Feather name="corner-up-left" size={15} color="#C2410C" /><Text style={styles.responseTitle}>{review.vendor_response ? 'Your public response' : 'Reply to this customer'}</Text></View><TextInput style={styles.responseInput} value={responseDrafts[review.id] ?? ''} onChangeText={(value) => setResponseDrafts((current) => ({ ...current, [review.id]: value }))} placeholder="Thank them or address their concern..." placeholderTextColor="#A8A29E" multiline maxLength={500} /><TouchableOpacity style={[styles.respondButton, !responseDrafts[review.id]?.trim() && styles.respondButtonDisabled]} onPress={() => saveResponse(review)} disabled={!responseDrafts[review.id]?.trim() || savingReviewId === review.id}>{savingReviewId === review.id ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="send" size={14} color="#FFFFFF" /><Text style={styles.respondText}>{review.vendor_response ? 'Update response' : 'Post response'}</Text></>}</TouchableOpacity></View>
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
  container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, content: { paddingBottom: 35 },
  header: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, backgroundColor: '#7C2D12', flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  summaryCard: { margin: 16, padding: 16, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', flexDirection: 'row', gap: 18 }, scoreBlock: { width: 92, alignItems: 'center', justifyContent: 'center' }, average: { color: '#292524', fontSize: 30, fontWeight: '900' }, stars: { flexDirection: 'row', gap: 2, marginTop: 4 }, summaryLabel: { color: '#78716C', fontSize: 10, fontWeight: '700', marginTop: 6 }, insightGrid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, insight: { flex: 1, minHeight: 64, borderRadius: 12, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }, insightValue: { color: '#C2410C', fontSize: 20, fontWeight: '900' }, insightLabel: { color: '#78716C', fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 3 }, tip: { marginHorizontal: 16, padding: 12, borderRadius: 13, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', gap: 8 }, tipText: { flex: 1, color: '#92400E', fontSize: 11, lineHeight: 17, fontWeight: '700' }, sectionTitle: { marginHorizontal: 18, color: '#292524', fontSize: 19, fontWeight: '900', marginTop: 20, marginBottom: 10 },
  reviewCard: { marginHorizontal: 16, marginBottom: 12, padding: 15, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC' }, reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#C2410C', fontSize: 13, fontWeight: '900' }, identity: { flex: 1 }, customerName: { color: '#292524', fontSize: 12, fontWeight: '900' }, reviewDate: { color: '#A8A29E', fontSize: 10, marginTop: 3 }, rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FFFBEB' }, ratingText: { color: '#92400E', fontSize: 10, fontWeight: '900' }, dishName: { color: '#C2410C', fontSize: 10, fontWeight: '900', marginTop: 13, textTransform: 'uppercase', letterSpacing: 0.7 }, comment: { color: '#57534E', fontSize: 13, lineHeight: 20, marginTop: 6 }, noComment: { color: '#A8A29E', fontSize: 12, fontStyle: 'italic', marginTop: 6 }, reviewPhoto: { width: '100%', height: 190, borderRadius: 12, marginTop: 12, backgroundColor: '#F5EDE5' },
  responseBox: { marginTop: 14, padding: 12, borderRadius: 13, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }, responseHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, responseTitle: { color: '#9A3412', fontSize: 11, fontWeight: '900' }, responseInput: { minHeight: 58, marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3D2B3', color: '#292524', fontSize: 12, textAlignVertical: 'top' }, respondButton: { minHeight: 39, marginTop: 9, borderRadius: 10, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, respondButtonDisabled: { backgroundColor: '#D6D3D1' }, respondText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  emptyState: { margin: 16, padding: 36, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center' }, emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 11 }, emptyText: { color: '#78716C', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 }, loader: { marginVertical: 35 }, errorState: { margin: 18, padding: 25, borderRadius: 17, backgroundColor: '#FEF2F2', alignItems: 'center' }, errorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center', marginTop: 10 }, retryButton: { marginTop: 15, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#B91C1C' }, retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
