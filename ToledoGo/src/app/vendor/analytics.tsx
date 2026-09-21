import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

interface Order { id: string; total: number; status: string; created_at: string; refund_amount?: number; payment_method?: string; }
interface SettlementAdjustment { amount: number; status: string; }
interface DaySummary { label: string; amount: number; orders: number; }

const startOfDay = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; };
const startOfWeek = (date: Date) => { const value = startOfDay(date); const day = value.getDay(); value.setDate(value.getDate() - (day === 0 ? 6 : day - 1)); return value; };
const isCompleted = (order: Order) => order.status === 'completed';
const isCountable = (order: Order) => order.status !== 'cancelled';

export default function VendorAnalyticsScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [businessName, setBusinessName] = useState('Your kitchen');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settlementAdjustments, setSettlementAdjustments] = useState<SettlementAdjustment[]>([]);

  const loadAnalytics = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [{ data: vendor }, { data, error: orderError }, { data: adjustments, error: adjustmentError }] = await Promise.all([
        supabase.from('vendors').select('business_name').eq('id', userData.user.id).maybeSingle(),
        supabase.from('orders').select('id, total, status, created_at, refund_amount, payment_method').eq('vendor_id', userData.user.id).gte('created_at', monthStart.toISOString()).order('created_at', { ascending: true }),
        supabase.from('vendor_settlement_adjustments').select('amount, status').eq('vendor_id', userData.user.id).eq('status', 'pending'),
      ]);
      if (orderError) throw orderError;
      if (adjustmentError) throw adjustmentError;
      setBusinessName(vendor?.business_name ?? 'Your kitchen');
      setOrders((data ?? []) as Order[]);
      setSettlementAdjustments((adjustments ?? []) as SettlementAdjustment[]);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load analytics. Run orders.sql in Supabase first.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const now = new Date();
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const todayOrders = orders.filter((order) => new Date(order.created_at) >= today && isCountable(order));
  const todayRevenue = orders.filter((order) => new Date(order.created_at) >= today && isCompleted(order)).reduce((sum, order) => sum + Number(order.total), 0);
  const weeklyOrders = orders.filter((order) => new Date(order.created_at) >= week && isCountable(order));
  const weeklyRevenue = orders.filter((order) => new Date(order.created_at) >= week && isCompleted(order)).reduce((sum, order) => sum + Number(order.total), 0);
  const monthlyOrders = orders.filter(isCountable);
  const monthlyRevenue = orders.filter(isCompleted).reduce((sum, order) => sum + Number(order.total), 0);
  const pendingSettlementDeduction = settlementAdjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0);
  const monthlyNetRevenue = monthlyRevenue - pendingSettlementDeduction;

  const days = useMemo<DaySummary[]>(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(week); date.setDate(week.getDate() + index);
    const nextDate = new Date(date); nextDate.setDate(date.getDate() + 1);
    const dayOrders = orders.filter((order) => { const created = new Date(order.created_at); return created >= date && created < nextDate && isCompleted(order); });
    return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), amount: dayOrders.reduce((sum, order) => sum + Number(order.total), 0), orders: dayOrders.length };
  }), [orders, week]);
  const maxAmount = Math.max(...days.map((day) => day.amount), 1);

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}>
    <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => {
      if (router.canGoBack()) router.back();
      else router.replace('/vendor/dashboard');
    }}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>VENDOR INSIGHTS</Text><Text style={styles.title}>Sales summary</Text><Text style={styles.subtitle}>{businessName} · Track your progress</Text></View><MaterialCommunityIcons name="chart-line" size={27} color="#FED7AA" /></LinearGradient>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(); }} tintColor="#C2410C" />}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}{loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
      <Text style={styles.periodLabel}>TODAY</Text><View style={styles.primaryCard}><View><Text style={styles.primaryLabel}>Completed revenue</Text><Text style={styles.primaryAmount}>PHP {todayRevenue.toFixed(2)}</Text><Text style={styles.primaryHint}>From {todayOrders.length} {todayOrders.length === 1 ? 'order' : 'orders'} today</Text></View><View style={styles.primaryIcon}><MaterialCommunityIcons name="cash-multiple" size={27} color="#FFF7ED" /></View></View>
      <View style={styles.metricRow}><View style={styles.metricCard}><Feather name="shopping-bag" size={20} color="#C2410C" /><Text style={styles.metricValue}>{todayOrders.length}</Text><Text style={styles.metricLabel}>Today’s orders</Text></View><View style={styles.metricCard}><Feather name="trending-up" size={20} color="#15803D" /><Text style={styles.metricValue}>PHP {weeklyRevenue.toFixed(0)}</Text><Text style={styles.metricLabel}>This week</Text></View></View>
      <View style={styles.summaryCard}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>Weekly overview</Text><Text style={styles.cardSubtitle}>{weeklyOrders.length} orders · PHP {weeklyRevenue.toFixed(2)} completed</Text></View><MaterialCommunityIcons name="calendar-week" size={22} color="#C2410C" /></View><View style={styles.chart}>{days.map((day) => <View key={day.label} style={styles.barColumn}><Text style={styles.barValue}>{day.amount > 0 ? Math.round(day.amount) : ''}</Text><View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max((day.amount / maxAmount) * 100, day.amount ? 8 : 2)}%` }]} /></View><Text style={styles.dayLabel}>{day.label}</Text></View>)}</View></View>
      <View style={styles.summaryCard}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>Monthly overview</Text><Text style={styles.cardSubtitle}>Current month performance</Text></View><MaterialCommunityIcons name="calendar-month" size={22} color="#C2410C" /></View><View style={styles.monthRow}><View><Text style={styles.monthValue}>PHP {monthlyRevenue.toFixed(2)}</Text><Text style={styles.monthLabel}>Completed revenue</Text></View><View style={styles.monthDivider} /><View><Text style={styles.monthValue}>PHP {monthlyNetRevenue.toFixed(2)}</Text><Text style={styles.monthLabel}>Net after refunds</Text></View></View>{pendingSettlementDeduction > 0 ? <Text style={styles.note}>Pending online refund deductions: PHP {pendingSettlementDeduction.toFixed(2)}</Text> : null}</View>
      <Text style={styles.note}>Revenue counts completed orders only. Orders remain in your history for reference.</Text>
    </ScrollView>
  </SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 }, content: { padding: 16, paddingBottom: 35 }, periodLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 4, marginBottom: 8 }, primaryCard: { backgroundColor: '#7C2D12', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryLabel: { color: '#FED7AA', fontSize: 12, fontWeight: '800' }, primaryAmount: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 4 }, primaryHint: { color: '#FED7AA', fontSize: 11, marginTop: 4 }, primaryIcon: { width: 55, height: 55, borderRadius: 17, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center' }, metricRow: { flexDirection: 'row', gap: 11, marginTop: 12 }, metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 16, padding: 14 }, metricValue: { color: '#1E293B', fontSize: 18, fontWeight: '900', marginTop: 8 }, metricLabel: { color: '#64748B', fontSize: 11, marginTop: 3 }, summaryCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', borderRadius: 18, padding: 15, marginTop: 16 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardTitle: { color: '#1E293B', fontSize: 16, fontWeight: '900' }, cardSubtitle: { color: '#64748B', fontSize: 11, marginTop: 3 }, chart: { height: 165, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 20 }, barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }, barValue: { color: '#C2410C', fontSize: 8, height: 13 }, barTrack: { width: 17, height: 105, backgroundColor: '#FFF1E6', borderRadius: 9, justifyContent: 'flex-end', overflow: 'hidden' }, bar: { width: '100%', backgroundColor: '#C2410C', borderRadius: 9, minHeight: 2 }, dayLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', marginTop: 7 }, monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 22 }, monthValue: { color: '#C2410C', fontSize: 20, fontWeight: '900', textAlign: 'center' }, monthLabel: { color: '#64748B', fontSize: 10, textAlign: 'center', marginTop: 4 }, monthDivider: { width: 1, height: 42, backgroundColor: '#F3E8DC' }, errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 12 }, loader: { marginVertical: 30 }, note: { color: '#94A3B8', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 18, paddingHorizontal: 12 } });
