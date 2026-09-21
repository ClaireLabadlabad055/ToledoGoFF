import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../Services/supabase';

interface MenuItem { id: string; name: string; description: string | null; price: number; is_available: boolean; stock_quantity: number; menu_image_url?: string | null; category?: string | null; options?: string[] | null; }
const categories = ['All items', 'Home-cooked', 'Baked goods', 'Seafood', 'Snacks'];
const gradients = [['#7C2D12', '#C2410C'], ['#9F1239', '#E11D48'], ['#92400E', '#D97706']];
export default function VendorMenusScreen() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null); const [businessName, setBusinessName] = useState('Your menu'); const [menus, setMenus] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState('All items'); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState(''); const [stockQuantity, setStockQuantity] = useState('1'); const [itemCategory, setItemCategory] = useState('Home-cooked'); const [optionsText, setOptionsText] = useState(''); const [imageUri, setImageUri] = useState<string | null>(null); const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); const [modalVisible, setModalVisible] = useState(false); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [imageUploading, setImageUploading] = useState(false);

  const loadMenus = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { router.replace('/login'); return; }
    const [{ data: vendor }, { data, error }] = await Promise.all([
      supabase.from('vendors').select('id, business_name').eq('id', userData.user.id).maybeSingle(),
      supabase.from('menus').select('id, name, description, price, is_available, stock_quantity, menu_image_url, category, options').eq('vendor_id', userData.user.id).order('created_at', { ascending: false }),
    ]);
    if (error) Alert.alert('Could not load menu', error.message);
    setVendorId(vendor?.id ?? null); setBusinessName(vendor?.business_name ?? 'Your menu'); setMenus((data ?? []) as MenuItem[]); setLoading(false);
  };

  useEffect(() => {
    loadMenus();
    const channel = supabase.channel('vendor-menu-inventory').on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, loadMenus).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const resetForm = () => { setName(''); setDescription(''); setPrice(''); setStockQuantity('1'); setItemCategory('Home-cooked'); setOptionsText(''); setImageUri(null); setImageBase64(null); setEditingId(null); };
  const openNew = () => { resetForm(); setModalVisible(true); };
  const openEdit = (item: MenuItem) => { setEditingId(item.id); setName(item.name); setDescription(item.description ?? ''); setPrice(String(item.price)); setStockQuantity(String(item.stock_quantity)); setItemCategory(item.category ?? 'Home-cooked'); setOptionsText((item.options ?? []).join(', ')); setImageUri(item.menu_image_url ?? null); setImageBase64(null); setModalVisible(true); };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    if (!result.canceled && result.assets?.[0]) { setImageUri(result.assets[0].uri); setImageBase64(result.assets[0].base64 ?? null); }
  };

  const uploadPhoto = async () => {
    if (!vendorId || !imageBase64) return imageUri;
    setImageUploading(true);
    const path = `${vendorId}/menu-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('menu-images').upload(path, decode(imageBase64), { contentType: 'image/jpeg', upsert: false });
    setImageUploading(false);
    if (error) throw error;
    return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  };

  const saveItem = async () => {
    const parsedPrice = Number(price);
    const parsedStock = Number(stockQuantity);
    if (!vendorId || !name.trim() || !price.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) { Alert.alert('Complete the item', 'Add a name, valid price, and whole-number stock quantity.'); return; }
    setSaving(true);
    try {
      const photoUrl = await uploadPhoto();
      const payload = { name: name.trim(), description: description.trim() || null, price: parsedPrice, stock_quantity: parsedStock, category: itemCategory, options: optionsText.split(',').map((option) => option.trim()).filter(Boolean), ...(photoUrl ? { menu_image_url: photoUrl } : {}) };
      if (editingId) {
        const { data, error } = await supabase.from('menus').update({ ...payload, is_available: parsedStock > 0 }).eq('id', editingId).eq('vendor_id', vendorId).select('id, name, description, price, is_available, stock_quantity, menu_image_url, category, options').single();
        if (error) throw error;
        if (data) setMenus((current) => current.map((item) => item.id === editingId ? data as MenuItem : item));
      } else {
        const { data, error } = await supabase.from('menus').insert({ vendor_id: vendorId, ...payload, is_available: parsedStock > 0 }).select('id, name, description, price, is_available, stock_quantity, menu_image_url, category, options').single();
        if (error) throw error;
        if (data) setMenus((current) => [data as MenuItem, ...current]);
      }
      setModalVisible(false); resetForm(); Alert.alert(editingId ? 'Item updated' : 'Published', 'Your customer menu is now up to date.');
    } catch (error: any) { Alert.alert('Could not save item', error.message); }
    finally { setSaving(false); }
  };

  const toggleAvailability = async (item: MenuItem) => {
    const nextAvailability = !item.is_available && item.stock_quantity > 0;
    const { error } = await supabase.from('menus').update({ is_available: nextAvailability }).eq('id', item.id).eq('vendor_id', vendorId);
    if (error) { Alert.alert('Could not update item', error.message); return; }
    setMenus((current) => current.map((menu) => menu.id === item.id ? { ...menu, is_available: nextAvailability } : menu));
  };

  const adjustStock = async (item: MenuItem, amount: number) => {
    const nextStock = Math.max(0, item.stock_quantity + amount);
    const { error } = await supabase.from('menus').update({ stock_quantity: nextStock, is_available: nextStock > 0 }).eq('id', item.id).eq('vendor_id', vendorId);
    if (error) { Alert.alert('Could not update stock', error.message); return; }
    setMenus((current) => current.map((menu) => menu.id === item.id ? { ...menu, stock_quantity: nextStock, is_available: nextStock > 0 } : menu));
  };

  const visibleMenus = category === 'All items' ? menus : menus.filter((item) => item.category === category);
  const renderImage = (item: MenuItem, index: number) => item.menu_image_url ? <Image source={{ uri: item.menu_image_url }} style={styles.productImage} resizeMode="cover" /> : <LinearGradient colors={gradients[index % gradients.length] as [string, string]} style={styles.productImage}><MaterialCommunityIcons name="food-outline" size={42} color="#FFF7ED" /></LinearGradient>;

  return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#7C2D12" /><LinearGradient colors={['#C2410C', '#9A3412', '#7C2D12']} style={styles.header}><TouchableOpacity onPress={() => {
      if (router.canGoBack()) router.back();
      else router.replace('/vendor/dashboard');
    }} style={styles.backButton}><Feather name="arrow-left" size={20} color="#C2410C" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>VENDOR MENU</Text><Text style={styles.title}>Menu items</Text><Text style={styles.subtitle}>{businessName} · Daily dishes and availability</Text></View><TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/vendor/profile')}><Feather name="settings" size={17} color="#C2410C" /></TouchableOpacity></LinearGradient>
    <TouchableOpacity style={styles.addButton} onPress={openNew} activeOpacity={0.9}><Feather name="plus" size={18} color="#FFFFFF" /><Text style={styles.addButtonText}>Add new menu item</Text></TouchableOpacity>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>{categories.map((item) => <TouchableOpacity key={item} style={[styles.categoryChip, category === item && styles.categoryChipActive]} onPress={() => setCategory(item)}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your menu</Text><Text style={styles.sectionSubtitle}>{visibleMenus.length} {visibleMenus.length === 1 ? 'item' : 'items'} · photos and prices sync to Explore</Text></View><View style={styles.sectionAccent}><Feather name="layers" size={17} color="#C2410C" /></View></View>
      {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}{!loading && visibleMenus.length === 0 ? <View style={styles.emptyState}><Feather name="box" size={40} color="#C2410C" /><Text style={styles.emptyTitle}>No menu items yet</Text><Text style={styles.emptySubtitle}>Add your first daily dish to start syncing with customers.</Text></View> : null}
      <View style={styles.grid}>{visibleMenus.map((item, index) => <View key={item.id} style={styles.productCard}><TouchableOpacity style={styles.imageWrap} onPress={() => openEdit(item)} activeOpacity={0.85}>{renderImage(item, index)}<View style={[styles.statusTag, item.is_available ? styles.liveTag : styles.soldTag]}><Text style={[styles.statusText, item.is_available ? styles.liveText : styles.soldText]}>{item.is_available ? 'AVAILABLE' : 'SOLD OUT'}</Text></View></TouchableOpacity><View style={styles.productBody}><Text style={styles.categoryLabel}>{item.category ?? 'Home-cooked'}</Text><Text style={styles.productName} numberOfLines={1}>{item.name}</Text><Text style={styles.productDescription} numberOfLines={2}>{item.description || 'Toledo\'s finest.'}</Text><Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700', marginTop: 4 }}>{item.stock_quantity} {item.stock_quantity === 1 ? 'serving' : 'servings'} left</Text><View style={styles.productFooter}><Text style={styles.productPrice}>PHP {Number(item.price).toFixed(2)}</Text><View style={styles.cardActions}><TouchableOpacity style={styles.editButton} onPress={() => adjustStock(item, -1)} disabled={item.stock_quantity === 0}><Feather name="minus" size={14} color="#C2410C" /></TouchableOpacity><TouchableOpacity style={styles.editButton} onPress={() => adjustStock(item, 1)}><Feather name="plus" size={14} color="#C2410C" /></TouchableOpacity><TouchableOpacity style={[styles.editButton, !item.is_available && styles.soldButton]} onPress={() => toggleAvailability(item)}><Feather name={item.is_available ? 'check-circle' : 'rotate-ccw'} size={14} color={item.is_available ? '#15803D' : '#B91C1C'} /></TouchableOpacity></View></View></View></View>)}</View>
    </ScrollView>
    <Modal visible={modalVisible} animationType="slide" transparent><View style={styles.modalOverlay}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{editingId ? 'Edit menu item' : 'New menu item'}</Text><TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}><Feather name="x" size={21} color="#292524" /></TouchableOpacity></View><ScrollView showsVerticalScrollIndicator={false}><TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.pickedImage} resizeMode="cover" /> : <><MaterialCommunityIcons name="image-plus" size={30} color="#C2410C" /><Text style={styles.photoText}>Add food photo</Text></>}</TouchableOpacity><Text style={styles.fieldLabel}>Item name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Special Humba Bowl" placeholderTextColor="#A8A29E" /><Text style={styles.fieldLabel}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalCategories}>{categories.slice(1).map((item) => <TouchableOpacity key={item} style={[styles.modalChip, itemCategory === item && styles.modalChipActive]} onPress={() => setItemCategory(item)}><Text style={[styles.modalChipText, itemCategory === item && styles.modalChipTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView><Text style={styles.fieldLabel}>Description</Text><TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="What's included?" placeholderTextColor="#A8A29E" multiline /><Text style={styles.fieldLabel}>Price</Text><View style={styles.priceRow}><Text style={styles.currency}>PHP</Text><TextInput style={styles.priceInput} value={price} onChangeText={setPrice} placeholder="150.00" placeholderTextColor="#A8A29E" keyboardType="decimal-pad" /></View><Text style={styles.fieldLabel}>Options (comma separated)</Text><TextInput style={styles.input} value={optionsText} onChangeText={setOptionsText} placeholder="Extra rice, Spicy, Family size" placeholderTextColor="#A8A29E" /><TouchableOpacity style={styles.saveButton} onPress={saveItem} disabled={saving || imageUploading}>{saving || imageUploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{editingId ? 'Save changes' : 'Publish menu item'}</Text>}</TouchableOpacity><TouchableOpacity style={styles.cancelButton} onPress={() => { setModalVisible(false); resetForm(); }}><Text style={styles.cancelText}>Discard</Text></TouchableOpacity></ScrollView></View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' }, header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { backgroundColor: '#FFEDD5', padding: 8, borderRadius: 14 }, settingsButton: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, eyebrow: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 }, subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700', marginTop: 3 }, addButton: { marginHorizontal: 20, marginTop: 16, marginBottom: 5, padding: 16, borderRadius: 19, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, content: { paddingHorizontal: 20, paddingBottom: 40 }, categoryList: { gap: 8, paddingVertical: 15 }, categoryChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 13, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }, categoryChipActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' }, categoryText: { color: '#64748B', fontSize: 11, fontWeight: '800' }, categoryTextActive: { color: '#FFFFFF' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 14 }, sectionTitle: { color: '#1E293B', fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 3 }, sectionAccent: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }, loader: { marginVertical: 25 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 }, productCard: { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden', elevation: 3 }, imageWrap: { height: 122, position: 'relative' }, productImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }, statusTag: { position: 'absolute', bottom: 9, left: 9, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }, liveTag: { backgroundColor: '#DCFCE7' }, soldTag: { backgroundColor: '#FEE2E2' }, statusText: { fontSize: 8, fontWeight: '900' }, liveText: { color: '#15803D' }, soldText: { color: '#B91C1C' }, productBody: { padding: 12 }, categoryLabel: { color: '#C2410C', fontSize: 9, fontWeight: '900' }, productName: { color: '#1E293B', fontSize: 14, fontWeight: '900', marginTop: 3 }, productDescription: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3, minHeight: 30 }, productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }, productPrice: { color: '#C2410C', fontSize: 12, fontWeight: '900', flexShrink: 1 }, cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, editButton: { backgroundColor: '#FFEDD5', width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, soldButton: { backgroundColor: '#FEE2E2' }, emptyState: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 25 }, emptyTitle: { color: '#1E293B', fontSize: 16, fontWeight: '900', marginTop: 12 }, emptySubtitle: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 5, lineHeight: 18 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }, modalCard: { maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, modalTitle: { color: '#1E293B', fontSize: 20, fontWeight: '900' }, photoPicker: { height: 145, borderRadius: 18, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, pickedImage: { width: '100%', height: '100%' }, photoText: { color: '#C2410C', fontSize: 11, fontWeight: '800' }, fieldLabel: { color: '#1E293B', fontSize: 12, fontWeight: '900', marginTop: 12, marginBottom: 6 }, modalCategories: { gap: 7 }, modalChip: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, modalChipActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' }, modalChipText: { color: '#64748B', fontSize: 11, fontWeight: '800' }, modalChipTextActive: { color: '#FFFFFF' }, input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13, minHeight: 45, padding: 12, color: '#1E293B', fontSize: 13 }, textArea: { minHeight: 75, textAlignVertical: 'top' }, priceRow: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13, height: 45, flexDirection: 'row', alignItems: 'center' }, currency: { color: '#C2410C', fontSize: 11, fontWeight: '900', paddingHorizontal: 12 }, priceInput: { flex: 1, color: '#1E293B', paddingHorizontal: 12 }, saveButton: { backgroundColor: '#C2410C', minHeight: 47, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, cancelButton: { alignItems: 'center', padding: 13 }, cancelText: { color: '#64748B', fontSize: 13, fontWeight: '800' },
});
