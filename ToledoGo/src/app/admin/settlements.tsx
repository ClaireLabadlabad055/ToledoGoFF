import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';
import { isAdminUser } from '../../Services/adminAuth';

interface Settlement {
  id: string;
  vendor_id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: 'pending' | 'settled' | 'voided';
  created_at: string;
  vendor?: { business_name?: string | null } | null;
}

export default function AdminSettlementsScreen() {
  const router = useRouter();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettlements = useCallback(async () => {
    try {
      setError(null);
      if (!(await isAdminUser())) { router.replace('/login'); return; }
      const { data, error: queryError } = await supabase
        .from('vendor_settlement_adjustments')
        .select('id, vendor_id, order_id, amount, reason, status, created_at, vendor:vendors(business_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setSettlements((data ?? []) as Settlement[]);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load refund settlements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { loadSettlements(); }, [loadSettlements]));

  const settleAdjustment = (settlement: Settlement) => {
    Alert.alert('Record e-wallet refund?', `Confirm that PHP ${Number(settlement.amount).toFixed(2)} was sent to the customer and will be deducted from the vendor payout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refund sent + settle', onPress: async () => {
        const { error: updateError } = await supabase.rpc('complete_vendor_refund', { adjustment_id: settlement.id });
        if (updateError) { Alert.alert('Could not complete refund', updateError.message); return; }
        setSettlements((current) => current.filter((item) => item.id !== settlement.id));
        Alert.alert('Refund recorded', 'The customer refund is recorded and the vendor deduction is marked as settled.');
      } },
    ]);
  };

  const totalPending = settlements.reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/admin/dashboard')} accessibilityLabel="Back to admin dashboard"><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>ADMIN OPERATIONS</Text><Text style={styles.title}>Refund settlements</Text><Text style={styles.subtitle}>Track vendor offsets for direct QRPH refunds.</Text></View>
          <Feather name="repeat" size={28} color="#FFF7ED" />
        </LinearGradient>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSettlements(); }} tintColor="#C2410C" />}>
          <View style={styles.summary}><Text style={styles.summaryLabel}>PENDING REFUNDS + VENDOR DEDUCTIONS</Text><Text style={styles.summaryAmount}>PHP {totalPending.toFixed(2)}</Text><Text style={styles.summaryHint}>{settlements.length} customer {settlements.length === 1 ? 'refund' : 'refunds'} awaiting payment and vendor offset</Text></View>
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && settlements.length === 0 ? <View style={styles.empty}><Feather name="check-circle" size={34} color="#15803D" /><Text style={styles.emptyTitle}>All settlements are clear</Text><Text style={styles.emptyText}>New verified online-payment cancellations will appear here.</Text></View> : null}
          {settlements.map((settlement) => <View key={settlement.id} style={styles.card}><View style={styles.cardHeader}><View><Text style={styles.vendorName}>{settlement.vendor?.business_name || `Vendor ${settlement.vendor_id.slice(0, 6)}`}</Text><Text style={styles.orderId}>Order {settlement.order_id.slice(0, 8).toUpperCase()}</Text></View><Text style={styles.amount}>PHP {Number(settlement.amount).toFixed(2)}</Text></View><Text style={styles.refundInstruction}>Send the refund to the customer&apos;s original e-wallet, then record the vendor deduction.</Text><Text style={styles.reason}>{settlement.reason}</Text><Text style={styles.date}>{new Date(settlement.created_at).toLocaleString()}</Text><TouchableOpacity style={styles.settleButton} onPress={() => settleAdjustment(settlement)}><Feather name="check" size={15} color="#FFFFFF" /><Text style={styles.settleText}>Refund sent + settle deduction</Text></TouchableOpacity></View>)}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 }, content: { padding: 16, paddingBottom: 35 }, summary: { padding: 20, borderRadius: 20, backgroundColor: '#7C2D12' }, summaryLabel: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, summaryAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 5 }, summaryHint: { color: '#FED7AA', fontSize: 11, marginTop: 3 }, loader: { marginVertical: 30 }, error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginTop: 15 }, empty: { alignItems: 'center', padding: 45 }, emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 10 }, emptyText: { color: '#78716C', fontSize: 12, textAlign: 'center', marginTop: 5, lineHeight: 18 }, card: { marginTop: 14, padding: 15, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC' }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, vendorName: { color: '#292524', fontSize: 15, fontWeight: '900' }, orderId: { color: '#C2410C', fontSize: 10, fontWeight: '900', marginTop: 4 }, amount: { color: '#B91C1C', fontSize: 16, fontWeight: '900' }, refundInstruction: { color: '#9A3412', backgroundColor: '#FFF7ED', borderRadius: 9, padding: 10, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 12 }, reason: { color: '#57534E', fontSize: 11, lineHeight: 17, marginTop: 12 }, date: { color: '#A8A29E', fontSize: 10, marginTop: 6 }, settleButton: { marginTop: 13, minHeight: 43, borderRadius: 11, backgroundColor: '#15803D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, settleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
