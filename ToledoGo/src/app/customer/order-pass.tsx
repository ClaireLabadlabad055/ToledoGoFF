import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../../Services/supabase';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

interface OrderPass {
  id: string;
  vendor_id: string;
  qr_code_string: string;
  status: OrderStatus;
  customer_name: string;
  total: number;
  payment_method?: string | null;
  items: { name: string; qty: number; price: number }[];
  fulfillment_mode: 'instore' | 'meetup';
  pickup_details?: string | null;
  refund_amount?: number;
  refund_status?: string;
  created_at: string;
  vendor?: { business_name?: string | null } | null;
}

const statusLabel: Record<OrderStatus, string> = {
  pending: 'Waiting for kitchen approval',
  preparing: 'Kitchen is preparing your order',
  ready: 'Ready for pickup or meet-up',
  completed: 'Order completed',
  cancelled: 'Order cancelled',
};

export default function CustomerOrderPassScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportCategory, setReportCategory] = useState('Food quality / safety');
  const [reportCategoryKey, setReportCategoryKey] = useState('food_quality');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const loadOrder = useCallback(async () => {
    const id = Array.isArray(orderId) ? orderId[0] : orderId;
    if (!id) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data, error: orderError } = await supabase
        .from('orders')
        .select('id, vendor_id, qr_code_string, status, customer_name, total, items, fulfillment_mode, pickup_details, payment_method, refund_amount, refund_status, created_at, vendor:vendors(business_name)')
        .eq('id', id)
        .eq('customer_id', userData.user.id)
        .single();

      if (orderError) throw orderError;
      setOrder({ ...data, items: Array.isArray(data.items) ? data.items : [] } as OrderPass);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your order pass.');
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    let isMounted = true;
    const safeLoad = async () => {
      await loadOrder();
      if (!isMounted) return;
    };
    safeLoad();

    return () => {
      isMounted = false;
    };
  }, [loadOrder, orderId]);

  const cancelOrder = () => {
    if (!order || order.status !== 'pending') return;

    const isExternalPayment = order.payment_method === 'GCash' || order.payment_method === 'Maya';
    Alert.alert('Cancel order?', isExternalPayment
      ? 'You can cancel while the order is still pending. An admin will refund your payment to your e-wallet and deduct the amount from the vendor settlement.'
      : 'You can cancel while the order is still pending. Your full payment will be credited to your ToledoGo wallet.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { data: updatedOrder, error: cancelError } = await supabase
            .from('orders')
            .update({ status: 'cancelled', cancellation_reason: 'Customer cancelled before preparation', updated_at: new Date().toISOString() })
            .eq('id', order.id)
            .eq('status', 'pending')
            .select('id, status')
            .maybeSingle();

          if (cancelError || !updatedOrder) {
            Alert.alert('Unable to cancel', cancelError?.message ?? 'The kitchen may have approved this order already.');
            await loadOrder();
          } else {
            setOrder((current) => current ? { ...current, status: 'cancelled' } : current);
            Alert.alert('Order cancelled', isExternalPayment
              ? 'Your refund request is now with admin for e-wallet processing.'
              : 'Your full payment has been credited to your ToledoGo wallet.');
          }
          setCancelling(false);
        },
      },
    ]);
  };

  const submitVendorReport = async () => {
    if (!order) return;

    const cleanDetails = reportDetails.trim();
    if (!cleanDetails) {
      Alert.alert('Add more details', 'Please explain what happened so the admin can understand the full situation.');
      return;
    }

    setSubmittingReport(true);
    const severity = reportCategoryKey === 'food_quality' || reportCategoryKey === 'behavior' ? 'high' : 'medium';

    try {
      const { error } = await supabase.rpc('submit_vendor_report', {
        report_vendor_id: order.vendor_id,
        report_reason: reportCategory,
        report_details: `${cleanDetails}\n\nOrder ID: ${order.id}\nCustomer: ${order.customer_name ?? 'Customer'}`,
        report_category: reportCategoryKey,
        report_severity: severity,
      });

      if (error) {
        Alert.alert('Could not submit report', error.message);
        return;
      }

      setReportModalVisible(false);
      setReportDetails('');
      setReportCategory('Food quality / safety');
      setReportCategoryKey('food_quality');
      Alert.alert('Report submitted', 'Your report has been sent to the admin moderation queue with your details included.');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/customer/orders')} accessibilityLabel="Back to orders">
              <Feather name="arrow-left" size={20} color="#C2410C" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>TOLEDOGO ORDER PASS</Text>
              <Text style={styles.title}>Thank you for ordering</Text>
              <Text style={styles.subtitle}>Keep this pass ready for your pickup or meet-up.</Text>
            </View>
            <MaterialCommunityIcons name="check-decagram-outline" size={32} color="#FFF7ED" />
          </LinearGradient>

          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {order ? <>
            <View style={styles.messageCard}>
              <View style={styles.messageIcon}><Feather name="message-circle" size={21} color="#C2410C" /></View>
              <View style={styles.messageCopy}>
                <Text style={styles.messageTitle}>{order.vendor?.business_name || 'The kitchen'} received your order.</Text>
                <Text style={styles.messageText}>Show this digital pass when you arrive. The vendor will scan the code to confirm the correct order.</Text>
              </View>
            </View>

            <View style={styles.passCard}>
              <Text style={styles.passLabel}>YOUR PICKUP PASS</Text>
              <Text style={styles.vendorName}>{order.vendor?.business_name || 'Local kitchen'}</Text>
              <View style={styles.qrWrap}><QRCode value={order.qr_code_string} size={190} backgroundColor="#FFFFFF" color="#292524" /></View>
              <Text style={styles.codeText}>{order.qr_code_string.slice(0, 12).toUpperCase()}</Text>
              <View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: order.status === 'cancelled' ? '#B91C1C' : order.status === 'pending' ? '#C2410C' : '#15803D' }]} /><Text style={styles.statusText}>{statusLabel[order.status]}</Text></View>
            </View>

            <View style={styles.instructionsCard}>
              <Text style={styles.sectionTitle}>How to use your pass</Text>
              <View style={styles.instruction}><View style={styles.step}><Text style={styles.stepText}>1</Text></View><Text style={styles.instructionText}>Wait for the kitchen to approve and prepare your order.</Text></View>
              <View style={styles.instruction}><View style={styles.step}><Text style={styles.stepText}>2</Text></View><Text style={styles.instructionText}>Bring this QR code to the listed pickup or meet-up location.</Text></View>
              <View style={styles.instruction}><View style={styles.step}><Text style={styles.stepText}>3</Text></View><Text style={styles.instructionText}>Let the vendor scan your pass before handing over the order.</Text></View>
            </View>

            {order.status === 'pending' ? <TouchableOpacity style={styles.cancelButton} onPress={cancelOrder} disabled={cancelling}>{cancelling ? <ActivityIndicator color="#B91C1C" /> : <><Feather name="x-circle" size={17} color="#B91C1C" /><Text style={styles.cancelText}>Cancel pending order</Text></>}</TouchableOpacity> : <Text style={styles.lockedText}>Cancellation is unavailable after kitchen approval.</Text>}
            {order.status === 'cancelled' && order.refund_status === 'settlement_pending' ? <View style={styles.refundNotice}><Feather name="clock" size={15} color="#92400E" /><Text style={styles.refundNoticeText}>Your online payment refund of PHP {Number(order.refund_amount ?? 0).toFixed(2)} is pending admin settlement with the vendor.</Text></View> : null}
            <TouchableOpacity style={styles.reportButton} onPress={() => setReportModalVisible(true)}><Feather name="flag" size={15} color="#7C2D12" /><Text style={styles.reportButtonText}>Report vendor</Text></TouchableOpacity>
            <TouchableOpacity style={styles.ordersButton} onPress={() => router.replace('/customer/orders')}><Feather name="clipboard" size={16} color="#FFFFFF" /><Text style={styles.ordersButtonText}>View all orders</Text></TouchableOpacity>
          </> : null}
        </ScrollView>

        <Modal visible={reportModalVisible} transparent animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Report this vendor</Text>
              <Text style={styles.modalHint}>Choose the issue and explain what happened.</Text>

              <View style={styles.categoryList}>
                {[
                  { label: 'Food quality / safety', key: 'food_quality' },
                  { label: 'Non-fulfillment', key: 'non_fulfillment' },
                  { label: 'Unprofessional behavior', key: 'behavior' },
                  { label: 'Other concern', key: 'other' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.categoryOption, reportCategoryKey === option.key && styles.categoryOptionSelected]}
                    onPress={() => {
                      setReportCategoryKey(option.key);
                      setReportCategory(option.label);
                    }}
                  >
                    <Text style={[styles.categoryOptionText, reportCategoryKey === option.key && styles.categoryOptionTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.textInput}
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder="Describe what happened, including timing, item details, and the situation from your side..."
                placeholderTextColor="#A8A29E"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelModalButton} onPress={() => setReportModalVisible(false)}>
                  <Text style={styles.cancelModalText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitModalButton} onPress={submitVendorReport} disabled={submittingReport}>
                  {submittingReport ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitModalText}>Submit report</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 3 },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  loader: { marginVertical: 35 },
  errorText: { margin: 16, color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12 },
  messageCard: { margin: 16, padding: 14, backgroundColor: '#FFF1E6', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 16, flexDirection: 'row', gap: 11 },
  messageIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  messageCopy: { flex: 1 },
  messageTitle: { color: '#7C2D12', fontSize: 14, fontWeight: '900' },
  messageText: { color: '#9A3412', fontSize: 11, lineHeight: 17, marginTop: 4 },
  passCard: { marginHorizontal: 16, padding: 20, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#F3E8DC', alignItems: 'center' },
  passLabel: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  vendorName: { color: '#292524', fontSize: 20, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  qrWrap: { padding: 14, marginTop: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', borderRadius: 14 },
  codeText: { color: '#7C2D12', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 11 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: '#57534E', fontSize: 12, fontWeight: '800' },
  instructionsCard: { margin: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#F3E8DC' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(41, 37, 36, 0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF7ED', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 26 },
  modalTitle: { color: '#7C2D12', fontSize: 20, fontWeight: '900' },
  modalHint: { color: '#9A5B31', fontSize: 12, marginTop: 4, marginBottom: 14 },
  categoryList: { gap: 8, marginBottom: 14 },
  categoryOption: { borderWidth: 1, borderColor: '#FCD7AE', borderRadius: 12, backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 12 },
  categoryOptionSelected: { backgroundColor: '#FFEDD5', borderColor: '#C2410C' },
  categoryOptionText: { color: '#7C2D12', fontSize: 12, fontWeight: '700' },
  categoryOptionTextSelected: { color: '#7C2D12', fontWeight: '900' },
  textInput: { minHeight: 120, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3D8C1', borderRadius: 12, padding: 12, color: '#292524', fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 10 },
  cancelModalButton: { flex: 1, backgroundColor: '#F5F5F4', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelModalText: { color: '#44403C', fontWeight: '800' },
  submitModalButton: { flex: 1.4, backgroundColor: '#C2410C', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  submitModalText: { color: '#FFFFFF', fontWeight: '900' },
  sectionTitle: { color: '#292524', fontSize: 16, fontWeight: '900', marginBottom: 13 },
  instruction: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  step: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#C2410C', fontSize: 12, fontWeight: '900' },
  instructionText: { flex: 1, color: '#78716C', fontSize: 11, lineHeight: 17 },
  cancelButton: { marginHorizontal: 16, minHeight: 48, borderRadius: 13, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  cancelText: { color: '#B91C1C', fontSize: 13, fontWeight: '900' },
  lockedText: { color: '#A8A29E', fontSize: 11, textAlign: 'center', marginHorizontal: 20, marginTop: 5 },
  refundNotice: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  refundNoticeText: { flex: 1, color: '#92400E', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  reportButton: { marginHorizontal: 16, marginTop: 12, minHeight: 48, borderRadius: 13, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  reportButtonText: { color: '#7C2D12', fontSize: 13, fontWeight: '900' },
  ordersButton: { margin: 16, minHeight: 49, borderRadius: 13, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  ordersButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
