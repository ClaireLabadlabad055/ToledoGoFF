import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../Services/supabase';
import { isAdminUser } from '../../Services/adminAuth';

type SupportCase = { id: string; customer_name?: string | null; vendor_id: string; total: number; status: string; payment_method?: string | null; payment_status?: string | null; cancellation_reason?: string | null; created_at: string; vendor?: { business_name?: string | null } | null; };
type CaseFilter = 'all' | 'payments' | 'refunds';

export default function AdminSupportScreen() {
  const router = useRouter();
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [filter, setFilter] = useState<CaseFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    try {
      setError(null);
      if (!(await isAdminUser())) { router.replace('/login'); return; }
      const { data, error: queryError } = await supabase.from('orders').select('id, customer_name, vendor_id, total, status, payment_method, payment_status, cancellation_reason, created_at, vendor:vendors(business_name)').or('payment_status.eq.awaiting_verification,payment_status.eq.rejected,refund_status.eq.settlement_pending').order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setCases((data ?? []) as SupportCase[]);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load support cases.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useFocusEffect(useCallback(() => { loadCases(); }, [loadCases]));

  const visibleCases = useMemo(() => cases.filter((item) => filter === 'all' || (filter === 'payments' ? ['awaiting_verification', 'rejected'].includes(item.payment_status ?? '') : item.status === 'cancelled')), [cases, filter]);
  const labelFor = (item: SupportCase) => item.status === 'cancelled' ? 'Refund review' : item.payment_status === 'rejected' ? 'Payment rejected' : 'Payment verification';
  const colorFor = (item: SupportCase) => item.status === 'cancelled' ? '#B91C1C' : '#9A3412';

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}><View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/admin/dashboard')}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>ADMIN OPERATIONS</Text><Text style={styles.title}>Support inbox</Text><Text style={styles.subtitle}>Payment and refund cases needing attention.</Text></View><MaterialCommunityIcons name="message-alert-outline" size={28} color="#FFF7ED" /></View><View style={styles.notice}><Feather name="info" size={17} color="#9A3412" /><Text style={styles.noticeText}>These cases are generated from order activity. Customer support messages can be added here once a ticket table is enabled.</Text></View><View style={styles.filters}>{(['all', 'payments', 'refunds'] as CaseFilter[]).map((item) => <TouchableOpacity key={item} style={[styles.filter, filter === item && styles.filterActive]} onPress={() => setFilter(item)}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === 'all' ? 'All cases' : item === 'payments' ? 'Payments' : 'Refunds'}</Text></TouchableOpacity>)}</View><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCases(); }} tintColor="#C2410C" />}>
    {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={loadCases}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : null}
    {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
    {!loading && !error && visibleCases.length === 0 ? <View style={styles.empty}><Feather name="check-circle" size={42} color="#15803D" /><Text style={styles.emptyTitle}>No cases need attention</Text><Text style={styles.emptyText}>Payment exceptions and online refunds will appear here.</Text></View> : null}
    {visibleCases.map((item) => <View key={item.id} style={styles.card}><View style={styles.cardHeader}><View style={[styles.caseBadge, { backgroundColor: item.status === 'cancelled' ? '#FEF2F2' : '#FFF7ED' }]}><Text style={[styles.caseBadgeText, { color: colorFor(item) }]}>{labelFor(item)}</Text></View><Text style={styles.amount}>PHP {Number(item.total ?? 0).toFixed(2)}</Text></View><Text style={styles.customer}>{item.customer_name || 'Customer'} <Text style={styles.muted}>· {item.vendor?.business_name || 'Unknown vendor'}</Text></Text><Text style={styles.orderId}>Order {item.id.slice(0, 8).toUpperCase()}</Text>{item.cancellation_reason ? <Text style={styles.reason}>{item.cancellation_reason}</Text> : null}<View style={styles.metaRow}><Feather name="clock" size={13} color="#A8A29E" /><Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text><Text style={styles.meta}>{item.payment_method || 'Payment not specified'}</Text></View><TouchableOpacity style={styles.reviewButton} onPress={() => router.push({ pathname: '/admin/vendor-details', params: { id: item.vendor_id } })}><Text style={styles.reviewText}>Open vendor record</Text><Feather name="arrow-up-right" size={15} color="#9A3412" /></TouchableOpacity></View>)}
  </ScrollView></SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#7C2D12' }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 }, notice: { flexDirection: 'row', gap: 8, margin: 15, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFEDD5' }, noticeText: { flex: 1, color: '#7C2D12', fontSize: 11, lineHeight: 16, fontWeight: '600' }, filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 15, paddingBottom: 10 }, filter: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FED7AA' }, filterActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' }, filterText: { color: '#9A3412', fontSize: 11, fontWeight: '900' }, filterTextActive: { color: '#FFFFFF' }, content: { padding: 15, paddingTop: 5, paddingBottom: 35 }, loader: { marginVertical: 30 }, errorBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12 }, errorText: { color: '#B91C1C', fontSize: 12 }, retry: { color: '#991B1B', fontWeight: '900', marginTop: 8 }, empty: { alignItems: 'center', paddingVertical: 70 }, emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 12 }, emptyText: { color: '#78716C', fontSize: 12, textAlign: 'center', marginTop: 5 }, card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 17, padding: 15, marginBottom: 12 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, caseBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 }, caseBadgeText: { fontSize: 9, fontWeight: '900' }, amount: { color: '#B91C1C', fontSize: 15, fontWeight: '900' }, customer: { color: '#292524', fontSize: 14, fontWeight: '900', marginTop: 12 }, muted: { color: '#78716C', fontWeight: '600' }, orderId: { color: '#C2410C', fontSize: 10, fontWeight: '900', marginTop: 4 }, reason: { color: '#57534E', fontSize: 11, lineHeight: 17, marginTop: 10 }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }, meta: { color: '#A8A29E', fontSize: 10 }, reviewButton: { borderTopWidth: 1, borderTopColor: '#F7F1EB', marginTop: 13, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, reviewText: { color: '#9A3412', fontSize: 11, fontWeight: '900' } });
