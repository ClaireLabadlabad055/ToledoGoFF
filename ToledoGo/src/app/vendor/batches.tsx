import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type Menu = { id: string; name: string; stock_quantity: number };
type Batch = { id: string; name: string; starts_at: string; cutoff_at: string; pickup_at: string; status: string };
const isoDate = (value: string) => new Date(value).toISOString();

export default function VendorBatchesScreen() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [name, setName] = useState('Weekend batch');
  const [startsAt, setStartsAt] = useState('2026-09-20 08:00');
  const [cutoffAt, setCutoffAt] = useState('2026-09-20 12:00');
  const [pickupAt, setPickupAt] = useState('2026-09-20 16:00');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      setVendorId(userData.user.id);
      const [{ data: batchRows, error: batchError }, { data: menuRows, error: menuError }] = await Promise.all([
        supabase.from('vendor_batches').select('id, name, starts_at, cutoff_at, pickup_at, status').eq('vendor_id', userData.user.id).order('pickup_at'),
        supabase.from('menus').select('id, name, stock_quantity').eq('vendor_id', userData.user.id).eq('is_available', true),
      ]);
      if (batchError) throw batchError;
      if (menuError) throw menuError;
      await supabase.rpc('sync_vendor_batch_statuses');
      setBatches((batchRows ?? []) as Batch[]);
      setMenus((menuRows ?? []) as Menu[]);
    } catch (loadError: any) { setError(loadError.message ?? 'Unable to load batches. Run batch-scheduling.sql first.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => { let mounted = true; const run = async () => { await loadBatches(); if (!mounted) return; }; run(); return () => { mounted = false; }; }, [loadBatches]);

  const createBatch = async () => {
    if (!vendorId || !name.trim() || !menus.length) { Alert.alert('Add menu items first', 'A batch needs at least one available menu item.'); return; }
    const start = new Date(startsAt.replace(' ', 'T'));
    const cutoff = new Date(cutoffAt.replace(' ', 'T'));
    const pickup = new Date(pickupAt.replace(' ', 'T'));
    if ([start, cutoff, pickup].some((date) => Number.isNaN(date.getTime())) || !(start < cutoff && cutoff <= pickup)) { Alert.alert('Check batch times', 'Use YYYY-MM-DD HH:mm and make sure start is before cutoff, followed by pickup.'); return; }
    setSaving(true);
    try {
      const { data: batch, error: batchError } = await supabase.from('vendor_batches').insert({ vendor_id: vendorId, name: name.trim(), starts_at: isoDate(startsAt.replace(' ', 'T')), cutoff_at: isoDate(cutoffAt.replace(' ', 'T')), pickup_at: isoDate(pickupAt.replace(' ', 'T')) }).select('id').single();
      if (batchError) throw batchError;
      const { error: inventoryError } = await supabase.from('batch_menu_inventory').insert(menus.map((menu) => ({ batch_id: batch.id, menu_id: menu.id, quantity_remaining: menu.stock_quantity })));
      if (inventoryError) throw inventoryError;
      Alert.alert('Batch created', 'Customers can see it automatically when the start time arrives.');
      await loadBatches();
    } catch (saveError: any) { Alert.alert('Could not create batch', saveError.message); }
    finally { setSaving(false); }
  };

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}><View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.replace('/vendor/dashboard')}><Feather name="arrow-left" size={19} color="#292524" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>HOME KITCHEN</Text><Text style={styles.title}>Batch schedule</Text><Text style={styles.subtitle}>Plan dates, cutoffs, and pickup windows.</Text></View><Feather name="calendar" size={27} color="#FED7AA" /></View><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBatches(); }} tintColor="#C2410C" />}>
    {error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.form}><Text style={styles.sectionTitle}>Create a batch</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Batch name" placeholderTextColor="#A8A29E" /><TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder="Starts: YYYY-MM-DD HH:mm" placeholderTextColor="#A8A29E" /><TextInput style={styles.input} value={cutoffAt} onChangeText={setCutoffAt} placeholder="Cutoff: YYYY-MM-DD HH:mm" placeholderTextColor="#A8A29E" /><TextInput style={styles.input} value={pickupAt} onChangeText={setPickupAt} placeholder="Pickup: YYYY-MM-DD HH:mm" placeholderTextColor="#A8A29E" /><Text style={styles.hint}>{menus.length} available menu item{menus.length === 1 ? '' : 's'} will be allocated using current stock quantities.</Text><TouchableOpacity style={styles.button} onPress={createBatch} disabled={saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="plus-circle" size={16} color="#FFFFFF" /><Text style={styles.buttonText}>Create scheduled batch</Text></>}</TouchableOpacity></View><Text style={styles.sectionTitle}>Your batches</Text>{loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}{!loading && !batches.length ? <Text style={styles.empty}>No batches yet.</Text> : null}{batches.map((batch) => <View key={batch.id} style={styles.batch}><View style={styles.batchTop}><Text style={styles.batchName}>{batch.name}</Text><Text style={styles.status}>{batch.status}</Text></View><Text style={styles.batchInfo}>Opens {new Date(batch.starts_at).toLocaleString()}</Text><Text style={styles.batchInfo}>Orders close {new Date(batch.cutoff_at).toLocaleString()}</Text><Text style={styles.batchInfo}>Pickup {new Date(batch.pickup_at).toLocaleString()}</Text></View>)}
  </ScrollView></SafeAreaView></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { padding: 18, backgroundColor: '#7C2D12', flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 3 }, content: { padding: 16, paddingBottom: 35 }, form: { padding: 15, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', marginBottom: 20 }, sectionTitle: { color: '#292524', fontSize: 18, fontWeight: '900', marginBottom: 10 }, input: { minHeight: 44, marginBottom: 9, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E7D9CC', backgroundColor: '#FFF9F2', color: '#292524', fontSize: 12 }, hint: { color: '#78716C', fontSize: 11, lineHeight: 17, marginVertical: 5 }, button: { minHeight: 46, marginTop: 8, borderRadius: 12, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, batch: { padding: 14, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', marginBottom: 10 }, batchTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, batchName: { color: '#292524', fontSize: 14, fontWeight: '900' }, status: { color: '#C2410C', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, batchInfo: { color: '#78716C', fontSize: 11, marginTop: 6 }, loader: { marginVertical: 25 }, empty: { color: '#78716C', textAlign: 'center', paddingVertical: 25 }, error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 11, borderRadius: 10, fontSize: 12, marginBottom: 12 } });
