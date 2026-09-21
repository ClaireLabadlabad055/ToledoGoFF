import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../Services/supabase';

const establishRecoverySession = async (url: string | null) => {
  if (!url) return false;
  const hash = url.split('#')[1];
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return !error;
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const prepareRecovery = async () => {
      const initialUrl = await Linking.getInitialURL();
      const hasRecoverySession = await establishRecoverySession(initialUrl);
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) setReady(hasRecoverySession || Boolean(session));
    };
    prepareRecovery();
    const subscription = supabase.auth.onAuthStateChange((event) => {
      if (mounted && event === 'PASSWORD_RECOVERY') setReady(true);
    });
    const urlSubscription = Linking.addEventListener('url', async ({ url }) => {
      const hasRecoverySession = await establishRecoverySession(url);
      if (mounted && hasRecoverySession) setReady(true);
    });
    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
      urlSubscription.remove();
    };
  }, []);

  const savePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Passwords do not match', 'Enter the same new password twice.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      Alert.alert('Could not update password', error.message);
      return;
    }
    Alert.alert('Password updated', 'Your password has been changed successfully.', [{ text: 'Sign in', onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } }]);
  };

  return <View style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.content}><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/login')} accessibilityLabel="Back to login"><Feather name="arrow-left" size={19} color="#292524" /></TouchableOpacity><View style={styles.icon}><Feather name="lock" size={25} color="#FFFFFF" /></View><Text style={styles.eyebrow}>TOLEDOGO ACCOUNT</Text><Text style={styles.title}>Set a new password</Text><Text style={styles.subtitle}>{ready ? 'Choose a strong password for your account.' : 'Open this screen from the password confirmation email.'}</Text>{ready ? <><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor="#A8A29E" secureTextEntry autoCapitalize="none" /><TextInput style={styles.input} value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor="#A8A29E" secureTextEntry autoCapitalize="none" /><TouchableOpacity style={styles.button} onPress={savePassword} disabled={saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="check-circle" size={17} color="#FFFFFF" /><Text style={styles.buttonText}>Update password</Text></>}</TouchableOpacity></> : <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}><Text style={styles.buttonText}>Return to sign in</Text></TouchableOpacity>}</View></KeyboardAvoidingView></SafeAreaView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFF9F2' }, safeArea: { flex: 1 }, content: { flex: 1, padding: 22, justifyContent: 'center' }, backButton: { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center', marginBottom: 44 }, icon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, eyebrow: { color: '#C2410C', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#292524', fontSize: 29, fontWeight: '900', marginTop: 6 }, subtitle: { color: '#78716C', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 24 }, input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E7D9CC', backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: '#292524', fontSize: 13, marginBottom: 11 }, button: { minHeight: 50, borderRadius: 14, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 }, buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' } });
