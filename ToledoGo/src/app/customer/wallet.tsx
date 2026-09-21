import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

export default function CustomerWalletScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const [{ data: balanceData, error: balanceError }, { data: transactionData, error: transactionError }] = await Promise.all([
        supabase.rpc('get_customer_coin_balance'),
        supabase.from('coin_transactions').select('id, amount, reason, created_at').eq('customer_id', userData.user.id).order('created_at', { ascending: false }).limit(30),
      ]);
      if (balanceError) throw balanceError;
      if (transactionError) throw transactionError;
      setBalance(Number(balanceData ?? 0));
      setTransactions((transactionData ?? []) as CoinTransaction[]);
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load your wallet.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/customer/dashboard');
          }} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color="#C2410C" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>TOLEDOGO LOYALTY</Text>
            <Text style={styles.title}>ToledoCoins wallet</Text>
            <Text style={styles.subtitle}>Earn coins, save on local food.</Text>
          </View>
          <Feather name="award" size={32} color="#FFF7ED" />
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadWallet(); }} tintColor="#C2410C" />}
        >
          <View style={styles.balanceCard}>
            <View style={styles.coinIcon}><Feather name="award" size={24} color="#B45309" /></View>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <Text style={styles.balance}>{balance.toFixed(2)} <Text style={styles.coinUnit}>coins</Text></Text>
            <Text style={styles.value}>Worth PHP {balance.toFixed(2)} in discounts</Text>
            <Text style={styles.capNote}>Up to 30% of an order subtotal can be redeemed.</Text>
          </View>

          <View style={styles.infoCard}>
            <Feather name="gift" size={18} color="#C2410C" />
            <View style={styles.infoCopy}><Text style={styles.infoTitle}>Keep earning</Text><Text style={styles.infoText}>Daily login: +0.5 coins · Review comment: +2 · Food photo: +3</Text></View>
          </View>

          <Text style={styles.sectionTitle}>Recent activity</Text>
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && transactions.length === 0 ? <View style={styles.empty}><Feather name="clock" size={30} color="#C2410C" /><Text style={styles.emptyTitle}>No activity yet</Text><Text style={styles.emptyText}>Your daily bonuses, review rewards, and discounts will appear here.</Text></View> : null}
          {transactions.map((transaction) => {
            const earned = Number(transaction.amount) > 0;
            return <View key={transaction.id} style={styles.transaction}><View style={[styles.transactionIcon, earned ? styles.earnedIcon : styles.spentIcon]}><Feather name={earned ? 'plus' : 'minus'} size={15} color={earned ? '#15803D' : '#B91C1C'} /></View><View style={styles.transactionCopy}><Text style={styles.transactionReason}>{transaction.reason}</Text><Text style={styles.transactionDate}>{new Date(transaction.created_at).toLocaleString()}</Text></View><Text style={[styles.transactionAmount, earned ? styles.earnedText : styles.spentText]}>{earned ? '+' : ''}{Number(transaction.amount).toFixed(2)}</Text></View>;
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  content: { padding: 16, paddingBottom: 35 },
  balanceCard: { padding: 22, borderRadius: 22, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' },
  coinIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  balanceLabel: { color: '#B45309', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 12 },
  balance: { color: '#92400E', fontSize: 38, fontWeight: '900', marginTop: 3 },
  coinUnit: { fontSize: 15, fontWeight: '800' },
  value: { color: '#B45309', fontSize: 12, fontWeight: '800', marginTop: 3 },
  capNote: { color: '#A16207', fontSize: 10, marginTop: 9 },
  infoCard: { marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: '#FFF1E6', flexDirection: 'row', gap: 9 },
  infoCopy: { flex: 1 },
  infoTitle: { color: '#9A3412', fontSize: 12, fontWeight: '900' },
  infoText: { color: '#C2410C', fontSize: 10, lineHeight: 16, marginTop: 3 },
  sectionTitle: { color: '#292524', fontSize: 18, fontWeight: '900', marginTop: 25, marginBottom: 10 },
  loader: { marginVertical: 25 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, fontSize: 12 },
  empty: { padding: 35, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#F3E8DC' },
  emptyTitle: { color: '#292524', fontSize: 16, fontWeight: '900', marginTop: 10 },
  emptyText: { color: '#78716C', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 5 },
  transaction: { padding: 13, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#F3E8DC', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  transactionIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  earnedIcon: { backgroundColor: '#DCFCE7' },
  spentIcon: { backgroundColor: '#FEE2E2' },
  transactionCopy: { flex: 1 },
  transactionReason: { color: '#292524', fontSize: 12, fontWeight: '900' },
  transactionDate: { color: '#A8A29E', fontSize: 9, marginTop: 3 },
  transactionAmount: { fontSize: 14, fontWeight: '900' },
  earnedText: { color: '#15803D' },
  spentText: { color: '#B91C1C' },
});
