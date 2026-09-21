import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

type Conversation = { id: string; customer_id: string; subject?: string | null; order_id?: string | null; last_message_at: string; customerName: string; lastMessage?: string | null };

export default function VendorMessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      const { data: rows, error: conversationError } = await supabase.from('conversations').select('id, customer_id, subject, order_id, last_message_at').eq('vendor_id', userData.user.id).order('last_message_at', { ascending: false });
      if (conversationError) throw conversationError;
      const customerIds = Array.from(new Set((rows ?? []).map((row) => row.customer_id).filter(Boolean)));
      const { data: customers, error: customerError } = customerIds.length ? await supabase.from('customers').select('id, full_name').in('id', customerIds) : { data: [], error: null };
      if (customerError) throw customerError;
      const names = new Map((customers ?? []).map((customer) => [customer.id, customer.full_name]));
      const mapped = await Promise.all((rows ?? []).map(async (row) => {
        const { data: lastMessage } = await supabase.from('messages').select('body').eq('conversation_id', row.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        return { ...row, customerName: names.get(row.customer_id) || 'Customer', lastMessage: lastMessage?.body ?? null } as Conversation;
      }));
      setConversations(mapped);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your messages. Run messaging.sql in Supabase first.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const runLoad = async () => { await loadConversations(); if (!isMounted) return; };
    runLoad();
    const channel = supabase.channel('vendor-conversations').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadConversations).subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [loadConversations]);

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}><View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/vendor/dashboard')} accessibilityLabel="Back"><Feather name="arrow-left" size={19} color="#292524" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>VENDOR OPERATIONS</Text><Text style={styles.title}>Messages</Text><Text style={styles.subtitle}>Customer inquiries, bookings, and bulk orders</Text></View><Feather name="message-circle" size={27} color="#FED7AA" /></View><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadConversations(); }} tintColor="#C2410C" />}>
    {error ? <Text style={styles.error}>{error}</Text> : null}{loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}{!loading && !conversations.length ? <View style={styles.empty}><Feather name="inbox" size={34} color="#C2410C" /><Text style={styles.emptyTitle}>No inquiries yet</Text><Text style={styles.emptyText}>Customers can message you from your public kitchen page.</Text></View> : null}{conversations.map((conversation) => <TouchableOpacity key={conversation.id} style={styles.conversation} onPress={() => router.push({ pathname: '/vendor/messages/[id]', params: { id: conversation.id, customerName: conversation.customerName } })}><View style={styles.avatar}><Text style={styles.avatarText}>{conversation.customerName.charAt(0).toUpperCase()}</Text></View><View style={styles.copy}><View style={styles.titleRow}><Text style={styles.customerName}>{conversation.customerName}</Text><Text style={styles.date}>{new Date(conversation.last_message_at).toLocaleDateString()}</Text></View><Text style={styles.subject}>{conversation.subject || 'General inquiry'}{conversation.order_id ? ' · Order linked' : ''}</Text><Text style={styles.preview} numberOfLines={1}>{conversation.lastMessage || 'No messages yet'}</Text></View><Feather name="chevron-right" size={17} color="#A8A29E" /></TouchableOpacity>)}
  </ScrollView></SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, header: { padding: 18, backgroundColor: '#7C2D12', flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 3 }, content: { padding: 16, paddingBottom: 35 }, conversation: { padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3E8DC', flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#C2410C', fontSize: 15, fontWeight: '900' }, copy: { flex: 1 }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, customerName: { color: '#292524', fontSize: 14, fontWeight: '900' }, date: { color: '#A8A29E', fontSize: 10 }, subject: { color: '#C2410C', fontSize: 10, fontWeight: '900', marginTop: 5 }, preview: { color: '#78716C', fontSize: 11, marginTop: 5 }, empty: { alignItems: 'center', paddingVertical: 75, paddingHorizontal: 25 }, emptyTitle: { color: '#292524', fontSize: 18, fontWeight: '900', marginTop: 12 }, emptyText: { color: '#78716C', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 }, loader: { marginVertical: 35 }, error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 12 } });
