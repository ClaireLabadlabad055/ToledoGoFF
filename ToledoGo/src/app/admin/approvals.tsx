import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../Services/supabase';// Make sure this path points to your supabase client file
import { isAdminUser } from '../../Services/adminAuth';

interface PendingApplication {
  id: string;
  source: 'vendors' | 'customers';
  name: string;
  email?: string;
  details?: string;
  created_at: string;
  verification_status?: 'pending' | 'under_review' | 'approved' | 'rejected';
  admin_notes?: string | null;
  owner_id_url?: string | null;
  permit_url?: string | null;
  store_photo_url?: string | null;
  phone?: string;
  store_type?: string;
  physical_address?: string | null;
  cuisine_specialty?: string;
  fulfillment_mode?: string;
  meetup_details?: string | null;
}

export default function AdminApprovalsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<PendingApplication[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<PendingApplication | null>(null);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      fetchPendingApprovals();
    }, [])
  );

  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      setDatabaseError(null);

      if (!(await isAdminUser())) {
        router.replace('/login');
        return;
      }

      const [{ data: vendors, error: vendorsError }, { data: customers, error: customersError }] = await Promise.all([
        supabase.from('vendors').select('*').in('verification_status', ['pending', 'under_review', 'rejected']),
        supabase.from('customers').select('*').eq('is_verified', false),
      ]);

      if (vendorsError) {
        console.error('Error fetching vendor approvals:', vendorsError.message);
        setDatabaseError(`Vendors: ${vendorsError.message}`);
      }
      if (customersError) {
        console.error('Error fetching customer approvals:', customersError.message);
        setDatabaseError(current => current ? `${current}\nCustomers: ${customersError.message}` : `Customers: ${customersError.message}`);
      }

      const applications: PendingApplication[] = [
        ...(vendors ?? []).map((vendor) => ({
          id: vendor.id,
          source: 'vendors' as const,
          name: vendor.business_name,
          email: vendor.email,
          details: `By ${vendor.owner_name} • ${vendor.physical_address || 'Home-based / Pickup'}`,
          created_at: vendor.created_at,
          verification_status: vendor.verification_status ?? (vendor.is_verified ? 'approved' : 'pending'),
          admin_notes: vendor.admin_notes,
          owner_id_url: vendor.owner_id_url,
          permit_url: vendor.permit_url,
          store_photo_url: vendor.store_photo_url,
          phone: vendor.phone,
          store_type: vendor.store_type,
          physical_address: vendor.physical_address,
          cuisine_specialty: vendor.cuisine_specialty,
          fulfillment_mode: vendor.fulfillment_mode,
          meetup_details: vendor.meetup_details,
        })),
        ...(customers ?? []).map((customer) => ({
          id: customer.id,
          source: 'customers' as const,
          name: customer.full_name,
          email: customer.email,
          details: 'Customer account',
          created_at: customer.created_at,
        })),
      ].sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());

      setPendingList(applications);
    } catch (error: any) {
      console.error('Error fetching pending approvals:', error.message);
      setDatabaseError(error.message ?? 'Unable to query Supabase.');
      Alert.alert('Error', 'Could not load pending approvals.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPendingApprovals();
  };

  const handleStatusChange = async (application: PendingApplication, status: PendingApplication['verification_status']) => {
    try {
      const update = application.source === 'vendors'
        ? { verification_status: status, is_verified: status === 'approved' }
        : { is_verified: status === 'approved' };
      const { error } = await supabase
        .from(application.source)
        .update(update)
        .eq('id', application.id);

      if (error) throw error;

      let notificationError: string | null = null;
      if (application.email && (status === 'approved' || status === 'rejected')) {
        const { error: emailError } = await supabase.functions.invoke('send-status-email', {
          body: {
            email: application.email,
            name: application.name,
            source: application.source,
            status,
          },
        });
        notificationError = emailError?.message ?? null;
      }

      if (status === 'approved') {
        setPendingList(prev => prev.filter(item => !(item.id === application.id && item.source === application.source)));
      } else {
        setPendingList(prev => prev.map(item => item.id === application.id && item.source === application.source ? { ...item, verification_status: status } : item));
      }
      const statusLabel = status?.replace('_', ' ');
      Alert.alert(
        notificationError ? 'Updated, email not sent' : 'Updated',
        notificationError
          ? `${application.name} is now ${statusLabel}, but the notification email could not be sent.`
          : `${application.name} is now ${statusLabel}. A notification email was sent.`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleNotesChange = async (application: PendingApplication, adminNotes: string) => {
    if (application.source !== 'vendors') return;

    const { error } = await supabase
      .from(application.source)
      .update({ admin_notes: adminNotes })
      .eq('id', application.id);

    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  const openVerificationFile = async (path: string) => {
    const storagePath = getStoragePath(path);
    const { data, error } = await supabase.storage
      .from('vendor-verification')
      .createSignedUrl(storagePath, 300);

    if (error) {
      Alert.alert('File error', `${error.message}\nPath: ${storagePath}`);
      return;
    }

    await Linking.openURL(data.signedUrl);
  };

  const getStoragePath = (value: string) => {
    if (!value.startsWith('http')) return value;

    try {
      const url = new URL(value);
      const objectMarker = '/storage/v1/object/';
      const markerIndex = url.pathname.indexOf(objectMarker);
      if (markerIndex === -1) return value;

      const objectParts = url.pathname.slice(markerIndex + objectMarker.length).split('/');
      const accessType = objectParts.shift();
      if (accessType !== 'sign' && accessType !== 'public' && accessType !== 'authenticated') return value;
      if (objectParts[0] === 'vendor-verification') objectParts.shift();
      return decodeURIComponent(objectParts.join('/'));
    } catch {
      return value;
    }
  };

  const openVendorReview = async (application: PendingApplication) => {
    setSelectedVendor(application);
    setAdminNote(application.admin_notes ?? '');
    setDocumentUrls({});
    setDocumentErrors({});
    setModalVisible(true);

    const paths = [application.owner_id_url, application.permit_url, application.store_photo_url].filter(Boolean) as string[];
    setDocumentsLoading(true);
    const signedEntries = await Promise.all(paths.map(async (path) => {
      const storagePath = getStoragePath(path);
      const { data, error } = await supabase.storage
        .from('vendor-verification')
        .createSignedUrl(storagePath, 300);

      if (error) {
        setDocumentErrors(current => ({ ...current, [path]: `${error.message} (${storagePath})` }));
      }

      return data?.signedUrl ? [path, data.signedUrl] as const : null;
    }));
    setDocumentUrls(Object.fromEntries(signedEntries.filter(Boolean) as [string, string][]));
    setDocumentsLoading(false);
  };

  const documentItems = selectedVendor ? [
    { label: 'Owner ID', path: selectedVendor.owner_id_url, required: true },
    { label: 'Permit', path: selectedVendor.permit_url, required: selectedVendor.store_type === 'physical' },
    { label: 'Store Photo', path: selectedVendor.store_photo_url, required: selectedVendor.store_type === 'physical' },
  ] : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFBF7" />
      <SafeAreaView style={styles.safeArea}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/admin/dashboard')} activeOpacity={0.8}>
            <Feather name="arrow-left" size={18} color="#292524" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Approvals Queue</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
        >
          <View style={styles.bannerBox}>
            <MaterialCommunityIcons name="shield-check-outline" size={24} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.bannerTitle}>Pending Verification ({pendingList.length})</Text>
              <Text style={styles.bannerSubtitle}>Review incoming Toledo City vendors before publishing to the platform.</Text>
            </View>
          </View>

          {databaseError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Database query problem</Text>
              <Text style={styles.errorText}>{databaseError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#D97706" />
              <Text style={[styles.emptyText, { marginTop: 10 }]}>Loading applications...</Text>
            </View>
          ) : pendingList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="check-decagram" size={48} color="#D97706" />
              <Text style={styles.emptyText}>All caught up! No pending approvals.</Text>
            </View>
          ) : (
            pendingList.map((item) => (
              <TouchableOpacity key={`${item.source}-${item.id}`} style={styles.approvalCard} onPress={() => item.source === 'vendors' && openVendorReview(item)} activeOpacity={0.9}>
                <View style={styles.cardTopRow}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {item.source === 'vendors' ? 'VENDOR' : 'CUSTOMER'}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>

                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemOwner}>{item.details}</Text>
                {item.email ? <Text style={styles.specialtyText}>{item.email}</Text> : null}
                {item.source === 'vendors' ? (
                  <View style={styles.documentsRow}>
                    {item.owner_id_url ? <TouchableOpacity onPress={() => openVerificationFile(item.owner_id_url!)}><Text style={styles.documentLink}>Owner ID</Text></TouchableOpacity> : null}
                    {item.permit_url ? <TouchableOpacity onPress={() => openVerificationFile(item.permit_url!)}><Text style={styles.documentLink}>Permit</Text></TouchableOpacity> : null}
                    {item.store_photo_url ? <TouchableOpacity onPress={() => openVerificationFile(item.store_photo_url!)}><Text style={styles.documentLink}>Store Photo</Text></TouchableOpacity> : null}
                  </View>
                ) : null}
                <Text style={styles.statusText}>Status: {(item.verification_status ?? 'pending').replace('_', ' ')}</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Private admin notes"
                  placeholderTextColor="#A8A29E"
                  defaultValue={item.admin_notes ?? ''}
                  onEndEditing={(event) => handleNotesChange(item, event.nativeEvent.text)}
                  multiline
                />

                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleStatusChange(item, 'approved')} activeOpacity={0.8}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleStatusChange(item, 'rejected')} activeOpacity={0.8}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {selectedVendor ? (
          <Modal visible={modalVisible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Security & Compliance Audit</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Feather name="x" size={22} color="#292524" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.auditBusinessName}>{selectedVendor.name}</Text>
                  <Text style={styles.auditSub}>Owner: {selectedVendor.details}</Text>
                  <View style={styles.infoGrid}>
                    <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Phone:</Text> {selectedVendor.phone || 'Not provided'}</Text>
                    <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Store type:</Text> {selectedVendor.store_type || 'Not provided'}</Text>
                    <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Address:</Text> {selectedVendor.physical_address || 'Home-based'}</Text>
                    <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Specialty:</Text> {selectedVendor.cuisine_specialty || 'Not provided'}</Text>
                    <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Fulfillment:</Text> {selectedVendor.fulfillment_mode || 'Not provided'}</Text>
                    {selectedVendor.meetup_details ? <Text style={styles.auditDetail}><Text style={styles.auditLabel}>Meet-up details:</Text> {selectedVendor.meetup_details}</Text> : null}
                  </View>
                  <Text style={styles.sectionHeading}>Submitted Documents</Text>
                  <View style={styles.documentPreviewRow}>
                    {documentItems.map((document) => (
                      <View key={document.label} style={styles.documentPreview}>
                        <Text style={styles.documentLabel}>{document.label}</Text>
                        {document.path && documentUrls[document.path] ? <Image
                          source={{ uri: documentUrls[document.path] }}
                          style={styles.documentImage}
                          resizeMode="cover"
                          onError={() => setDocumentErrors(current => ({ ...current, [document.path as string]: 'Photo could not be displayed. Check the Storage file and policy.' }))}
                        /> : document.path && documentErrors[document.path] ? <Text style={styles.documentError}>{documentErrors[document.path]}</Text> : <Text style={document.required ? styles.missingDocument : styles.optionalDocument}>{documentsLoading ? 'Loading...' : document.required ? 'Not uploaded' : 'Not required'}</Text>}
                      </View>
                    ))}
                  </View>
                  <Text style={styles.sectionHeading}>Private Admin Notes</Text>
                  <TextInput
                    style={styles.modalNotesInput}
                    placeholder="Why is this application rejected or needs changes?"
                    placeholderTextColor="#A8A29E"
                    value={adminNote}
                    onChangeText={setAdminNote}
                    multiline
                  />
                  <View style={styles.modalActionRow}>
                    <TouchableOpacity style={styles.modalRejectBtn} onPress={() => {
                      handleNotesChange(selectedVendor, adminNote);
                      handleStatusChange(selectedVendor, 'rejected');
                      setModalVisible(false);
                    }}>
                      <Text style={styles.modalRejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalApproveBtn} onPress={() => {
                      handleNotesChange(selectedVendor, adminNote);
                      handleStatusChange(selectedVendor, 'approved');
                      setModalVisible(false);
                    }}>
                      <Text style={styles.modalApproveText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF7' },
  safeArea: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFEB'
  },
  headerTitle: { color: '#292524', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  iconBtn: { 
    backgroundColor: '#FFFFFF', 
    padding: 10, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: '#E7E5E4',
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  bannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF3E7',
    padding: 16,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F5EFEB',
  },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: '#292524' },
  bannerSubtitle: { fontSize: 11, color: '#78716C', marginTop: 2, fontWeight: '500' },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: { fontSize: 13, fontWeight: '800', color: '#991B1B', marginBottom: 4 },
  errorText: { fontSize: 12, color: '#B91C1C', lineHeight: 17 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#991B1B', borderRadius: 8 },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  documentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  documentLink: { color: '#B45309', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  statusText: { color: '#78716C', fontSize: 12, fontWeight: '800', textTransform: 'capitalize', marginBottom: 8 },
  notesInput: { minHeight: 42, borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#292524', fontSize: 12, marginBottom: 10 },
  approvalCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F5EFEB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { backgroundColor: '#FDF3E7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800', color: '#D97706', textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: '#A8A29E', fontWeight: '600' },
  itemName: { fontSize: 16, fontWeight: '800', color: '#292524', letterSpacing: -0.2, marginBottom: 2 },
  itemOwner: { fontSize: 12, color: '#78716C', fontWeight: '600', marginBottom: 6 },
  specialtyText: { fontSize: 11, color: '#D97706', fontWeight: '700', marginBottom: 14 },
  actionButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  rejectBtnText: { color: '#78716C', fontWeight: '800', fontSize: 13 },
  approveBtn: {
    flex: 1,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#292524' },
  auditBusinessName: { fontSize: 18, fontWeight: '900', color: '#292524' },
  auditSub: { fontSize: 13, color: '#78716C', marginTop: 3, marginBottom: 16 },
  infoGrid: { backgroundColor: '#FDFBF7', borderRadius: 12, padding: 12, marginBottom: 18, gap: 6 },
  auditDetail: { fontSize: 12, color: '#44403C', lineHeight: 17 },
  auditLabel: { fontWeight: '800', color: '#292524' },
  sectionHeading: { fontSize: 14, fontWeight: '800', color: '#292524', marginBottom: 8 },
  documentPreviewRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  documentPreview: { flex: 1, minHeight: 112, backgroundColor: '#FDFBF7', borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 12, padding: 8, alignItems: 'center' },
  documentLabel: { fontSize: 10, fontWeight: '800', color: '#78716C', textAlign: 'center', marginBottom: 6 },
  documentImage: { width: '100%', height: 78, borderRadius: 7 },
  missingDocument: { color: '#DC2626', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 30 },
  optionalDocument: { color: '#78716C', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 30 },
  documentError: { color: '#DC2626', fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  modalNotesInput: { minHeight: 78, borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 12, padding: 12, fontSize: 13, color: '#292524', textAlignVertical: 'top', backgroundColor: '#FDFBF7' },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 20 },
  modalRejectBtn: { flex: 1, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalRejectText: { color: '#DC2626', fontWeight: '800', fontSize: 13 },
  modalApproveBtn: { flex: 1, backgroundColor: '#D97706', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalApproveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#78716C', marginTop: 12 },
});