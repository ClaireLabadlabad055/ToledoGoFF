import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
interface OrderItem { name: string; qty: number; price: number; }
interface Order { id: string; qr_code_string?: string | null; customer_name: string; customer_phone?: string | null; items: OrderItem[]; total: number; status: OrderStatus; fulfillment_mode: 'instore' | 'meetup'; pickup_details?: string | null; payment_method?: string | null; payment_reference?: string | null; payment_status?: 'not_required' | 'awaiting_verification' | 'verified' | 'rejected'; payment_amount?: number | null; payment_verification_expires_at?: string | null; payment_verified_at?: string | null; delivery_address?: string | null; delivery_notes?: string | null; special_instructions?: string | null; created_at: string; }

const tabs: { key: OrderStatus; label: string; icon: 'inbox-arrow-down' | 'pot-steam-outline' | 'shopping-outline' | 'history' }[] = [
  { key: 'pending', label: 'Incoming', icon: 'inbox-arrow-down' },
  { key: 'preparing', label: 'Preparing', icon: 'pot-steam-outline' },
  { key: 'ready', label: 'Ready', icon: 'shopping-outline' },
  { key: 'completed', label: 'History', icon: 'history' },
];

const statusButton: Record<OrderStatus, { label: string; next?: OrderStatus }> = {
  pending: { label: 'Start preparing', next: 'preparing' },
  preparing: { label: 'Mark ready', next: 'ready' },
  ready: { label: 'Complete order', next: 'completed' },
  completed: { label: 'Completed' },
  cancelled: { label: 'Cancelled' },
};

export default function VendorOrdersScreen() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      setVendorId(userData.user.id);
      const { data, error: ordersError } = await supabase.from('orders').select('*').eq('vendor_id', userData.user.id).order('created_at', { ascending: false });
      if (ordersError) throw ordersError;
      setOrders((data ?? []) as Order[]);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load orders. Run orders.sql in Supabase first.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const safeLoad = async () => {
      await loadOrders();
      if (!isMounted) return;
    };
    safeLoad();
    const channel = supabase.channel('vendor-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders()).subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [loadOrders]);

  const updateStatus = async (order: Order) => {
    const next = statusButton[order.status].next;
    if (!next || !vendorId) return;
    const advance = async () => {
      if (next === 'preparing' && (order.payment_method === 'GCash' || order.payment_method === 'Maya') && order.payment_status !== 'verified') {
        const expiresAt = order.payment_verification_expires_at ? new Date(order.payment_verification_expires_at) : null;
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
          Alert.alert('Payment verification expired', 'Ask the customer to place a new order or submit a new payment reference.');
          return;
        }
        Alert.alert('Verify online payment', `Confirm ${order.payment_method} manually for PHP ${Number(order.payment_amount ?? order.total).toFixed(2)}. Reference: ${order.payment_reference || 'not provided'}${expiresAt ? `\nExpires: ${expiresAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Payment received', onPress: async () => { await verifyPayment(order, 'verified'); await updateStatus({ ...order, payment_status: 'verified' }); } },
        ]);
        return;
      }
      const { error: updateError } = await supabase.from('orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id).eq('vendor_id', vendorId);
      if (updateError) { Alert.alert('Could not update order', updateError.message); return; }
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: next } : item));
    };
    if (order.status === 'pending' || order.status === 'preparing') {
      Alert.alert('Update order', order.status === 'pending' ? 'Start preparing this order, or cancel it and issue a full refund?' : 'Mark this order ready, or cancel it and issue a full refund?', [
        { text: 'Keep order', style: 'cancel' },
        { text: statusButton[order.status].label, onPress: advance },
        { text: 'Cancel + refund', style: 'destructive', onPress: () => cancelOrder(order) },
      ]);
      return;
    }
    await advance();
  };

  const verifyPayment = async (order: Order, paymentStatus: 'verified' | 'rejected') => {
    if (!vendorId) return;
    const { error } = await supabase.from('orders').update({ payment_status: paymentStatus, updated_at: new Date().toISOString() }).eq('id', order.id).eq('vendor_id', vendorId).eq('payment_status', 'awaiting_verification');
    if (error) { Alert.alert('Could not update payment', error.message); return; }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, payment_status: paymentStatus } : item));
  };

  const cancelOrder = async (order: Order) => {
    if (!vendorId || !['pending', 'preparing'].includes(order.status)) return;
    Alert.alert('Cancel and refund?', 'The customer will receive a full ToledoGo wallet refund. Use this for out-of-stock or emergency cancellations.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel and refund', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: 'Vendor emergency or out of stock', updated_at: new Date().toISOString() }).eq('id', order.id).eq('vendor_id', vendorId).in('status', ['pending', 'preparing']);
        if (error) { Alert.alert('Could not cancel order', error.message); return; }
        setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: 'cancelled' } : item));
        Alert.alert('Order cancelled', 'The customer received a full ToledoGo wallet refund.');
      } },
    ]);
  };

  const visibleOrders = useMemo(() => orders.filter((order) => order.status === activeTab), [activeTab, orders]);
  const countFor = (status: OrderStatus) => orders.filter((order) => order.status === status).length;

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access to scan customer pickup receipts.');
        return;
      }
    }
    setScanLocked(false);
    setScannerVisible(true);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLocked || !vendorId) return;
    setScanLocked(true);

    const { data: order, error: lookupError } = await supabase
      .from('orders')
      .select('id, customer_name, status')
      .eq('vendor_id', vendorId)
      .eq('qr_code_string', data.trim())
      .maybeSingle();

    setScannerVisible(false);
    if (lookupError || !order) {
      setScanLocked(false);
      Alert.alert('Receipt not recognized', 'This QR code is not linked to one of your orders.');
      return;
    }

    if (order.status !== 'ready') {
      setScanLocked(false);
      Alert.alert('Order not ready', `${order.customer_name || 'This customer'}\'s order is currently ${order.status}.`);
      return;
    }

    const { error: completeError } = await supabase
      .from('orders')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('vendor_id', vendorId)
      .eq('status', 'ready');

    setScanLocked(false);
    if (completeError) {
      Alert.alert('Could not confirm pickup', completeError.message);
      return;
    }

    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: 'completed' } : item));
    Alert.alert('Pickup confirmed', `${order.customer_name || 'Customer'}\'s order is now complete.`);
  };

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}>
    <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => {
      if (router.canGoBack()) router.back();
      else router.replace('/vendor/dashboard');
    }}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>VENDOR OPERATIONS</Text><Text style={styles.title}>Orders</Text><Text style={styles.subtitle}>Process customer pickups and meet-ups</Text></View><TouchableOpacity style={styles.headerIcon} onPress={openScanner} accessibilityLabel="Scan pickup QR code"><Feather name="maximize" size={19} color="#FFF7ED" /></TouchableOpacity></LinearGradient>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map((tab) => <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]} onPress={() => setActiveTab(tab.key)}><MaterialCommunityIcons name={tab.icon} size={18} color={activeTab === tab.key ? '#FFFFFF' : '#C2410C'} /><Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text><View style={[styles.count, activeTab === tab.key && styles.countActive]}><Text style={[styles.countText, activeTab === tab.key && styles.countTextActive]}>{countFor(tab.key)}</Text></View></TouchableOpacity>)}</ScrollView>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor="#C2410C" />}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}{loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
      {!loading && visibleOrders.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="clipboard-text-outline" size={42} color="#C2410C" /><Text style={styles.emptyTitle}>No {tabs.find((tab) => tab.key === activeTab)?.label.toLowerCase()} orders</Text><Text style={styles.emptyText}>New customer orders will appear here automatically.</Text></View> : null}
      {visibleOrders.map((order) => <View key={order.id} style={styles.orderCard}><View style={styles.orderHeader}><View><Text style={styles.orderId}>ORD-{order.id.slice(0, 6).toUpperCase()}</Text><Text style={styles.customerName}>{order.customer_name || 'Customer'}</Text>{order.customer_phone ? <Text style={styles.customerPhone}>{order.customer_phone}</Text> : null}</View><View style={styles.statusPill}><Text style={styles.statusPillText}>{order.status}</Text></View></View><View style={styles.metaRow}><Feather name="clock" size={13} color="#A8A29E" /><Text style={styles.metaText}>{new Date(order.created_at).toLocaleString()}</Text></View><View style={styles.metaRow}><Feather name={order.fulfillment_mode === 'meetup' ? 'map-pin' : 'shopping-bag'} size={13} color="#A8A29E" /><Text style={styles.metaText}>{order.fulfillment_mode === 'meetup' ? 'Location meet-up' : 'In-store pickup'}{order.pickup_details ? ` · ${order.pickup_details}` : ''}</Text></View>{order.delivery_address ? <View style={styles.metaRow}><Feather name="navigation" size={13} color="#A8A29E" /><Text style={styles.metaText}>{order.delivery_address}</Text></View> : null}{order.payment_method ? <View style={styles.metaRow}><Feather name="credit-card" size={13} color="#A8A29E" /><Text style={styles.metaText}>{order.payment_method}</Text></View> : null}<View style={styles.itemsBox}>{(order.items ?? []).map((item, index) => <View key={`${order.id}-${index}`} style={styles.itemRow}><Text style={styles.itemName}>{item.qty}x {item.name}</Text><Text style={styles.itemPrice}>PHP {Number(item.price * item.qty).toFixed(2)}</Text></View>)}</View>{order.special_instructions ? <View style={styles.noteBox}><Feather name="message-square" size={13} color="#9F1239" /><Text style={styles.noteText}>{order.special_instructions}</Text></View> : null}{order.delivery_notes ? <View style={styles.noteBox}><Feather name="info" size={13} color="#9F1239" /><Text style={styles.noteText}>{order.delivery_notes}</Text></View> : null}<View style={styles.orderFooter}><Text style={styles.total}>PHP {Number(order.total).toFixed(2)}</Text>{statusButton[order.status].next ? <TouchableOpacity style={styles.nextButton} onPress={() => updateStatus(order)}><Text style={styles.nextButtonText}>{statusButton[order.status].label}</Text><Feather name="check-circle" size={14} color="#FFFFFF" /></TouchableOpacity> : <Text style={styles.completedText}>{statusButton[order.status].label}</Text>}</View></View>)}
    </ScrollView>
    {scannerVisible ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(41,37,36,0.58)', justifyContent: 'flex-end' }}><View style={{ backgroundColor: '#FFF9F2', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}><View><Text style={{ color: '#292524', fontSize: 21, fontWeight: '900' }}>Scan pickup receipt</Text><Text style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>Point the camera at the customer QR code.</Text></View><TouchableOpacity onPress={() => { setScannerVisible(false); setScanLocked(false); }}><Feather name="x" size={22} color="#292524" /></TouchableOpacity></View><View style={{ height: 300, overflow: 'hidden', borderRadius: 16, backgroundColor: '#292524' }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned} /><View style={{ position: 'absolute', top: 55, left: 35, right: 35, bottom: 55, borderWidth: 2, borderColor: '#FDBA74', borderRadius: 18 }} /></View><Text style={{ color: '#78716C', fontSize: 11, textAlign: 'center', marginTop: 12 }}>Only orders belonging to your kitchen can be confirmed.</Text></View></View> : null}
  </SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 }, headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, tabs: { paddingHorizontal: 16, paddingVertical: 13, gap: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3E8DC' }, tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }, tabActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' }, tabLabel: { color: '#7C2D12', fontSize: 11, fontWeight: '900' }, tabLabelActive: { color: '#FFFFFF' }, count: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, countActive: { backgroundColor: 'rgba(255,255,255,0.2)' }, countText: { color: '#C2410C', fontSize: 9, fontWeight: '900' }, countTextActive: { color: '#FFFFFF' }, content: { padding: 16, paddingBottom: 35 }, loader: { marginVertical: 30 }, errorText: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 12 }, empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 25 }, emptyTitle: { color: '#1E293B', fontSize: 17, fontWeight: '900', marginTop: 12 }, emptyText: { color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 }, orderCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 20, padding: 15, marginBottom: 13, elevation: 2, shadowColor: '#C2410C', shadowOpacity: 0.06, shadowRadius: 10 }, orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, orderId: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, customerName: { color: '#1E293B', fontSize: 16, fontWeight: '900', marginTop: 4 }, customerPhone: { color: '#6B7280', fontSize: 11, fontWeight: '700', marginTop: 3 }, statusPill: { backgroundColor: '#FFEDD5', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 }, statusPillText: { color: '#C2410C', fontSize: 10, fontWeight: '900', textTransform: 'capitalize' }, metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, metaText: { color: '#64748B', fontSize: 11, marginLeft: 7, flexShrink: 1 }, itemsBox: { backgroundColor: '#FFF9F2', borderRadius: 12, padding: 11, marginTop: 12 }, itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }, itemName: { color: '#1E293B', fontSize: 12, fontWeight: '800' }, itemPrice: { color: '#78716C', fontSize: 11, fontWeight: '700' }, noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#FFF1F2', borderRadius: 10, padding: 9, marginTop: 10 }, noteText: { color: '#9F1239', fontSize: 11, flex: 1, lineHeight: 16 }, orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }, total: { color: '#C2410C', fontSize: 17, fontWeight: '900' }, nextButton: { backgroundColor: '#15803D', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }, nextButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, completedText: { color: '#15803D', fontSize: 12, fontWeight: '900' } });
