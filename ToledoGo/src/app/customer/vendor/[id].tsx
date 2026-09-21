import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../Services/supabase';
import { getCustomerPreferences, toggleFavoriteKitchen } from '../../../Services/customerPreferences';

interface Vendor {
  id: string;
  business_name: string;
  owner_name?: string | null;
  cuisine_specialty?: string | null;
  physical_address?: string | null;
  store_type?: string | null;
  fulfillment_mode?: string | null;
  meetup_details?: string | null;
  store_photo_url?: string | null;
  profile_photo_url?: string | null;
  payment_qr_url?: string | null;
  gcash_qr_url?: string | null;
  maya_qr_url?: string | null;
  payment_account_name?: string | null;
  phone?: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  menu_image_url?: string | null;
  category?: string | null;
  options?: string[] | null;
  is_available: boolean;
  stock_quantity: number;
}

interface CartLine {
  item: MenuItem;
  quantity: number;
  note: string;
}

interface VendorBatch {
  id: string;
  name: string;
  starts_at: string;
  cutoff_at: string;
  pickup_at: string;
  status: 'scheduled' | 'open';
}

const getFulfillmentLabel = (mode?: string | null) => {
  if (mode === 'both') return 'In-store pickup + meet-up';
  if (mode === 'meetup') return 'Location meet-up';
  return 'In-store pickup';
};

const getFulfillmentIcon = (mode?: string | null) => mode === 'meetup' ? 'map-marker' : mode === 'both' ? 'swap-horizontal' : 'storefront-outline';

const gradients = [
  ['#7C2D12', '#C2410C'],
  ['#9F1239', '#E11D48'],
  ['#92400E', '#D97706'],
] as const;

export default function CustomerVendorMenuScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vendorId = Array.isArray(id) ? id[0] : id;
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [customerName, setCustomerName] = useState('Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash on pickup');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentQrUrls, setPaymentQrUrls] = useState<{ GCash: string | null; Maya: string | null }>({ GCash: null, Maya: null });
  const [coinBalance, setCoinBalance] = useState(0);
  const [useCoins, setUseCoins] = useState(false);
  const [selectedFulfillment, setSelectedFulfillment] = useState<'pickup' | 'meetup'>('pickup');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ average: 0, count: 0 });
  const [batches, setBatches] = useState<VendorBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchStock, setBatchStock] = useState<Record<string, number>>({});
  const [startingConversation, setStartingConversation] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All items');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVendorMenu = useCallback(async () => {
    if (!vendorId) return;
    try {
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace('/login');
        return;
      }
      const { data: coinData } = await supabase.rpc('get_customer_coin_balance');
      setCoinBalance(Number(coinData ?? 0));
      const preferences = await getCustomerPreferences(userData.user.id);
      setIsFavorite(preferences.favorites.some((favorite) => favorite.id === vendorId));

      const [{ data: vendorData, error: vendorError }, { data: menuData, error: menuError }, { data: customerData }, { data: reviewData, error: reviewError }] = await Promise.all([
        supabase
          .from('vendors')
          .select('id, business_name, owner_name, cuisine_specialty, physical_address, store_type, fulfillment_mode, meetup_details, store_photo_url, profile_photo_url, payment_qr_url, gcash_qr_url, maya_qr_url, payment_account_name, phone')
          .eq('id', vendorId)
          .eq('is_verified', true)
          .maybeSingle(),
        supabase
          .from('menus')
          .select('id, name, description, price, menu_image_url, category, options, is_available, stock_quantity')
          .eq('vendor_id', vendorId)
          .order('category')
          .order('name'),
        supabase.from('customers').select('full_name').eq('id', userData.user.id).maybeSingle(),
        supabase.from('reviews').select('rating').eq('vendor_id', vendorId),
      ]);

      if (vendorError) throw vendorError;
      if (menuError) throw menuError;
      if (reviewError) throw reviewError;
      if (!vendorData) {
        setError('This kitchen is not available right now.');
        return;
      }

      setVendor(vendorData as Vendor);
      setMenus((menuData ?? []) as MenuItem[]);
      const { data: batchData } = await supabase.rpc('get_vendor_batches', { target_vendor_id: vendorId });
      const openBatches = (batchData ?? []) as VendorBatch[];
      setBatches(openBatches);
      setSelectedBatchId((current) => current && openBatches.some((batch) => batch.id === current) ? current : openBatches[0]?.id ?? null);
      const ratings = (reviewData ?? []).map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
      setReviewSummary({ average: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : 0, count: ratings.length });
      setCustomerName(customerData?.full_name || userData.user.user_metadata?.full_name || 'Customer');
      const photoPath = vendorData.profile_photo_url ?? vendorData.store_photo_url;
      if (photoPath) {
        const { data: signedPhoto } = await supabase.storage.from('vendor-verification').createSignedUrl(photoPath, 3600);
        setCoverUrl(signedPhoto?.signedUrl ?? null);
      } else {
        setCoverUrl(null);
      }
      const qrEntries = await Promise.all((['GCash', 'Maya'] as const).map(async (provider) => {
        const path = provider === 'GCash' ? vendorData.gcash_qr_url ?? vendorData.payment_qr_url : vendorData.maya_qr_url ?? vendorData.payment_qr_url;
        if (!path) return [provider, null] as const;
        const { data: signedQr, error: qrError } = await supabase.storage.from('vendor-verification').createSignedUrl(path, 3600);
        if (qrError) console.error(`Could not load ${provider} QRPH image:`, qrError.message);
        return [provider, signedQr?.signedUrl ?? null] as const;
      }));
      setPaymentQrUrls(Object.fromEntries(qrEntries) as { GCash: string | null; Maya: string | null });
    } catch (loadError: any) {
      setError(loadError.message ?? 'Unable to load this kitchen menu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, vendorId]);

  const selectedPaymentQrUrl = paymentMethod === 'GCash' || paymentMethod === 'Maya' ? paymentQrUrls[paymentMethod] : null;

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      await loadVendorMenu();
      if (!isMounted) return;
    };

    runLoad();
    return () => {
      isMounted = false;
    };
  }, [loadVendorMenu]);

  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase.channel(`menu-inventory-${vendorId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'menus', filter: `vendor_id=eq.${vendorId}` }, loadVendorMenu).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadVendorMenu, vendorId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    const loadBatchStock = async () => {
      const { data } = await supabase.from('batch_menu_inventory').select('menu_id, quantity_remaining').eq('batch_id', selectedBatchId);
      setBatchStock(Object.fromEntries((data ?? []).map((item) => [item.menu_id, Number(item.quantity_remaining)])));
    };
    loadBatchStock();
  }, [selectedBatchId]);

  const toggleFavorite = async () => {
    if (!vendor || !vendorId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace('/login');
      return;
    }

    const result = await toggleFavoriteKitchen(userData.user.id, {
      id: vendor.id,
      business_name: vendor.business_name,
      cuisine_specialty: vendor.cuisine_specialty,
      physical_address: vendor.physical_address,
      store_type: vendor.store_type,
    });
    setIsFavorite(result.isSaved);
  };

  const openConversation = async () => {
    if (!vendor || startingConversation) return;
    setStartingConversation(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }
      const { data: conversationId, error: conversationError } = await supabase.rpc('get_or_create_conversation', {
        conversation_vendor_id: vendor.id,
        conversation_customer_id: userData.user.id,
        conversation_subject: 'General inquiry',
      });
      if (conversationError) throw conversationError;
      router.push({ pathname: '/customer/messages/[id]', params: { id: conversationId, vendorName: vendor.business_name } });
    } catch (conversationError: any) {
      alert(conversationError.message ?? 'Unable to start a conversation. Run messaging.sql in Supabase first.');
    } finally {
      setStartingConversation(false);
    }
  };

  const callVendor = async () => {
    if (!vendor?.phone) return;
    const supported = await Linking.canOpenURL(`tel:${vendor.phone}`);
    if (supported) await Linking.openURL(`tel:${vendor.phone}`);
    else alert('Calling is not available on this device.');
  };

  const categories = useMemo(() => ['All items', ...Array.from(new Set(menus.map((item) => item.category || 'Home-cooked')))], [menus]);
  const batchRequired = vendor?.store_type !== 'physical';
  const visibleMenus = batchRequired && !selectedBatchId ? [] : (selectedCategory === 'All items' ? menus : menus.filter((item) => (item.category || 'Home-cooked') === selectedCategory)).map((item) => selectedBatchId ? { ...item, stock_quantity: batchStock[item.id] ?? 0, is_available: (batchStock[item.id] ?? 0) > 0 } : item);
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const cartSubtotal = cart.reduce((total, line) => total + Number(line.item.price) * line.quantity, 0);
  const maxCoinDiscount = Math.floor(cartSubtotal * 0.3);
  const coinDiscount = useCoins ? Math.min(coinBalance, maxCoinDiscount) : 0;
  const cartTotal = Math.max(cartSubtotal - coinDiscount, 0);
  const isOrderable = (item: MenuItem) => item.is_available && item.stock_quantity > 0;

  const addToCart = (item: MenuItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stock_quantity) return current;
        return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { item, quantity: 1, note: '' }];
    });
  };

  const addSelectedItemToCart = () => {
    if (!selectedItem || !isOrderable(selectedItem)) return;
    addToCart(selectedItem);
    setSelectedItem(null);
  };

  const changeQuantity = (itemId: string, amount: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.item.id !== itemId) return [line];
      const quantity = line.quantity + amount;
      if (quantity > line.item.stock_quantity) return [line];
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  };

  const updateNote = (itemId: string, note: string) => {
    setCart((current) => current.map((line) => line.item.id === itemId ? { ...line, note } : line));
  };

  const placeOrder = async () => {
    if (!vendor || !cart.length || placingOrder) return;

    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Please enter your name and phone number before placing the order.');
      return;
    }
    if (vendor.store_type !== 'physical' && !selectedBatchId) {
      alert('Choose an available batch before placing a home-kitchen order.');
      return;
    }
    const onlinePayment = paymentMethod === 'GCash' || paymentMethod === 'Maya';
    if (onlinePayment && !selectedPaymentQrUrl) {
      alert(`This vendor has not uploaded a ${paymentMethod} QR code. Please use Cash on Pickup.`);
      return;
    }
    if (onlinePayment && !paymentReference.trim()) {
      alert('Enter the GCash or Maya reference number after completing payment.');
      return;
    }

    setPlacingOrder(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace('/login'); return; }

      const fulfillmentMode = vendor.fulfillment_mode === 'meetup' || vendor.fulfillment_mode === 'both' ? selectedFulfillment === 'meetup' ? 'meetup' : 'instore' : vendor.fulfillment_mode === 'meetup' ? 'meetup' : 'instore';
      const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
      const batchPickup = selectedBatch ? ` · ${selectedBatch.name} pickup ${new Date(selectedBatch.pickup_at).toLocaleString()}` : '';
      const pickupDetails = `${fulfillmentMode === 'meetup' ? (vendor.meetup_details || 'Meet-up at the scheduled venue') : (vendor.physical_address || 'Pickup location')}${batchPickup}`;
      const deliveryAddress = fulfillmentMode === 'meetup' ? vendor.meetup_details || 'Meet-up venue' : vendor.physical_address || 'Pickup location';

      const { data: createdOrder, error: orderError } = await supabase.from('orders').insert({
        vendor_id: vendor.id,
        batch_id: selectedBatchId,
        customer_id: userData.user.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        items: cart.map((line) => ({ id: line.item.id, name: line.item.name, qty: line.quantity, price: Number(line.item.price), note: line.note.trim() || null })),
        total: cartSubtotal,
        coin_discount: coinDiscount,
        coins_redeemed: coinDiscount,
        fulfillment_mode: fulfillmentMode,
        pickup_details: pickupDetails,
        delivery_address: deliveryAddress,
        delivery_notes: deliveryNotes.trim() || null,
        payment_method: paymentMethod,
        payment_reference: onlinePayment ? paymentReference.trim() : null,
        payment_status: onlinePayment ? 'awaiting_verification' : 'not_required',
        special_instructions: [
          onlinePayment ? `Online payment reference: ${paymentReference.trim()}` : '',
          cart.map((line) => line.note.trim()).filter(Boolean).join('; '),
          deliveryNotes.trim(),
        ].filter(Boolean).join(' | ') || null,
      }).select('id').single();

      if (orderError) throw orderError;
      if (!createdOrder?.id) throw new Error('The order was placed but no order receipt was returned.');
      setCart([]);
      setCartVisible(false);
      setCustomerPhone('');
      setDeliveryNotes('');
      setSelectedFulfillment('pickup');
      setPaymentMethod('Cash on pickup');
      setPaymentReference('');
      setUseCoins(false);
      router.replace({ pathname: '/customer/order-pass', params: { orderId: createdOrder.id } });
    } catch (orderError: any) {
      alert(orderError.message ?? 'Unable to place your order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  const renderMenuImage = (item: MenuItem, index: number) => item.menu_image_url ? (
    <Image source={{ uri: item.menu_image_url }} style={styles.menuImage} resizeMode="cover" />
  ) : (
    <LinearGradient colors={gradients[index % gradients.length]} style={styles.menuImage}>
      <MaterialCommunityIcons name="food-outline" size={35} color="#FFF7ED" />
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C2D12" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVendorMenu(); }} tintColor="#C2410C" />}
        >
          {vendor ? (
            <>
              <View style={styles.hero}>
                {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" /> : <LinearGradient colors={vendor.store_type === 'physical' ? gradients[0] : gradients[1]} style={StyleSheet.absoluteFill} />}
                <View style={styles.heroShade} />
                <TouchableOpacity style={styles.backButton} onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/customer/dashboard');
                }} accessibilityLabel="Back">
                  <Feather name="arrow-left" size={19} color="#292524" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite} accessibilityLabel={isFavorite ? 'Remove from saved kitchens' : 'Save kitchen'}>
                  <Feather name="bookmark" size={19} color={isFavorite ? '#C2410C' : '#292524'} fill={isFavorite ? '#C2410C' : 'transparent'} />
                </TouchableOpacity>
                <View style={styles.heroBottom}>
                  <Text style={styles.eyebrow}>TOLEDOGO KITCHEN</Text>
                  <Text style={styles.vendorName}>{vendor.business_name}</Text>
                  <Text style={styles.specialty}>{vendor.cuisine_specialty || 'Local specialties'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoItem}><Feather name="user" size={15} color="#C2410C" /><Text style={styles.infoText} numberOfLines={1}>By {vendor.owner_name || 'local maker'}</Text><View style={styles.verifiedBadge}><Feather name="check" size={10} color="#166534" /><Text style={styles.verifiedText}>VERIFIED</Text></View></View>
                <View style={styles.infoItem}><Feather name="map-pin" size={15} color="#C2410C" /><Text style={styles.infoText} numberOfLines={2}>{vendor.physical_address || 'Toledo City'}</Text></View>
                <View style={styles.infoItem}><MaterialCommunityIcons name={getFulfillmentIcon(vendor.fulfillment_mode) as any} size={16} color="#C2410C" /><Text style={styles.infoText}>{getFulfillmentLabel(vendor.fulfillment_mode)}</Text></View>
              </View>
              <View style={styles.reviewsRow}>
                <View style={styles.reviewSummary}><Feather name="star" size={16} color="#D97706" fill="#D97706" /><Text style={styles.reviewAverage}>{reviewSummary.count ? reviewSummary.average.toFixed(1) : 'New'}</Text><Text style={styles.reviewCount}>{reviewSummary.count ? `${reviewSummary.count} review${reviewSummary.count === 1 ? '' : 's'}` : 'No reviews yet'}</Text></View>
                <TouchableOpacity style={styles.reviewsButton} onPress={() => router.push({ pathname: '/customer/reviews', params: { vendorId, vendorName: vendor.business_name } })} accessibilityLabel="Reviews and ratings">
                  <Feather name="message-circle" size={15} color="#C2410C" /><Text style={styles.reviewsButtonText}>Reviews &amp; Ratings</Text><Feather name="arrow-up-right" size={14} color="#C2410C" />
                </TouchableOpacity>
              </View>
              <View style={styles.contactRow}>
                <TouchableOpacity style={styles.contactButton} onPress={openConversation} disabled={startingConversation}><Feather name="message-circle" size={16} color="#FFFFFF" /><Text style={styles.contactButtonText}>{startingConversation ? 'Opening chat...' : 'Message vendor'}</Text></TouchableOpacity>
                {vendor.phone ? <TouchableOpacity style={styles.callButton} onPress={callVendor}><Feather name="phone" size={16} color="#15803D" /><Text style={styles.callButtonText}>Call {vendor.phone}</Text></TouchableOpacity> : null}
              </View>
              {vendor.meetup_details && (vendor.fulfillment_mode === 'meetup' || vendor.fulfillment_mode === 'both') ? <View style={styles.meetup}><Feather name="clock" size={15} color="#9F1239" /><Text style={styles.meetupText}>{vendor.meetup_details}</Text></View> : null}

              {vendor.store_type !== 'physical' ? <View style={styles.batchSection}><View style={styles.batchHeading}><View><Text style={styles.batchTitle}>Cooking batches</Text><Text style={styles.batchSubtitle}>Scheduled batches open automatically at their start time.</Text></View><Feather name="calendar" size={19} color="#C2410C" /></View>{batches.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.batchList}>{batches.map((batch) => { const isOpen = batch.status === 'open'; return <TouchableOpacity key={batch.id} disabled={!isOpen} style={[styles.batchChip, isOpen && selectedBatchId === batch.id && styles.batchChipActive, !isOpen && styles.batchChipScheduled]} onPress={() => { setSelectedBatchId(batch.id); setCart([]); }}><Text style={[styles.batchChipTitle, isOpen && selectedBatchId === batch.id && styles.batchChipTextActive]}>{batch.name}</Text><Text style={[styles.batchChipDetail, isOpen && selectedBatchId === batch.id && styles.batchChipTextActive]}>{isOpen ? 'OPEN · ' : 'OPENS '}{new Date(isOpen ? batch.pickup_at : batch.starts_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text><Text style={[styles.batchChipDetail, isOpen && selectedBatchId === batch.id && styles.batchChipTextActive]}>{isOpen ? `Closes ${new Date(batch.cutoff_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `Pickup ${new Date(batch.pickup_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</Text></TouchableOpacity>; })}</ScrollView> : <Text style={styles.noBatchText}>No scheduled batches yet. Check back when this kitchen publishes its next cooking date.</Text>}</View> : null}

              <View style={styles.menuHeader}><View><Text style={styles.menuTitle}>Today&apos;s menu</Text><Text style={styles.menuSubtitle}>{menus.filter(isOrderable).length} available · {menus.length} total dishes</Text></View><TouchableOpacity style={styles.cartButton} onPress={() => setCartVisible(true)}><Feather name="shopping-bag" size={16} color="#FFFFFF" /><Text style={styles.cartButtonText}>{cartCount}</Text></TouchableOpacity></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
                {categories.map((category) => <TouchableOpacity key={category} style={[styles.categoryChip, selectedCategory === category && styles.categoryChipActive]} onPress={() => setSelectedCategory(category)}><Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextActive]}>{category}</Text></TouchableOpacity>)}
              </ScrollView>

              {visibleMenus.length > 0 ? (
                <View style={styles.productsGrid}>
                  {visibleMenus.map((item, index) => (
                    <TouchableOpacity key={item.id} style={[styles.productCard, !isOrderable(item) && styles.soldProductCard]} activeOpacity={isOrderable(item) ? 0.9 : 1} disabled={!isOrderable(item)} onPress={() => setSelectedItem(item)}>
                      <View style={styles.productImageWrap}>
                        {renderMenuImage(item, index)}
                        {!isOrderable(item) ? <View style={styles.soldOverlay}><Text style={styles.soldOverlayText}>SOLD OUT</Text></View> : item.stock_quantity <= 2 ? <View style={styles.lowStockBadge}><Text style={styles.lowStockText}>ONLY {item.stock_quantity} LEFT</Text></View> : null}
                      </View>

                      <View style={styles.productBody}>
                        <View style={styles.productMetaRow}>
                          <Text style={styles.categoryLabel}>{item.category || 'Home-cooked'}</Text>
                          <View style={styles.ratingPill}><Feather name="star" size={10} color="#B45309" /><Text style={styles.ratingText}>{reviewSummary.count ? reviewSummary.average.toFixed(1) : 'New'}</Text></View>
                        </View>

                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemDescription} numberOfLines={2}>{item.description || 'Made fresh by this local kitchen.'}</Text>

                        {item.options?.length ? <Text style={styles.options} numberOfLines={1}>{item.options.join('  ·  ')}</Text> : null}

                        <View style={styles.itemFooter}>
                          <Text style={[styles.price, !isOrderable(item) && styles.soldPrice]}>PHP {Number(item.price).toFixed(2)}</Text>

                            {isOrderable(item) ? (
                            <TouchableOpacity style={styles.addButton} onPress={() => addToCart(item)}>
                              <Feather name="plus" size={14} color="#FFFFFF" />
                              <Text style={styles.addButtonText}>Add</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.soldBadge}><Text style={styles.soldText}>OUT</Text></View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : <View style={styles.emptyState}><MaterialCommunityIcons name="food-off-outline" size={42} color="#C2410C" /><Text style={styles.emptyTitle}>Menu coming soon</Text><Text style={styles.emptyText}>This kitchen is preparing its next dishes.</Text></View>}
            </>
          ) : null}
          {loading ? <ActivityIndicator color="#C2410C" style={styles.loader} /> : null}
          {!loading && error ? <View style={styles.errorState}><Feather name="alert-circle" size={30} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={loadVendorMenu}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : null}
        </ScrollView>
        {cartCount > 0 ? <TouchableOpacity style={styles.cartBar} onPress={() => setCartVisible(true)} activeOpacity={0.9}><View><Text style={styles.cartBarTitle}>{cartCount} {cartCount === 1 ? 'item' : 'items'} in your order</Text><Text style={styles.cartBarTotal}>PHP {cartTotal.toFixed(2)}</Text></View><View style={styles.viewCart}><Text style={styles.viewCartText}>View cart</Text><Feather name="arrow-right" size={16} color="#FFFFFF" /></View></TouchableOpacity> : null}
        {selectedItem ? <View style={styles.itemModalBackdrop}><View style={styles.itemModal}><View style={styles.itemModalHeader}><Text style={styles.itemModalEyebrow}>TOLEDOGO MENU ITEM</Text><TouchableOpacity onPress={() => setSelectedItem(null)} accessibilityLabel="Close item details"><Feather name="x" size={22} color="#292524" /></TouchableOpacity></View><View style={styles.itemModalImage}>{renderMenuImage(selectedItem, menus.findIndex((item) => item.id === selectedItem.id))}</View><Text style={styles.itemModalCategory}>{selectedItem.category || 'Home-cooked'}</Text><Text style={styles.itemModalName}>{selectedItem.name}</Text><Text style={styles.itemModalDescription}>{selectedItem.description || 'Made fresh by this local kitchen.'}</Text>{selectedItem.options?.length ? <View style={styles.itemModalOptions}><Feather name="info" size={14} color="#9F1239" /><Text style={styles.itemModalOptionsText}>{selectedItem.options.join('  ·  ')}</Text></View> : null}<View style={styles.itemModalFooter}><Text style={[styles.itemModalPrice, !isOrderable(selectedItem) && styles.soldPrice]}>PHP {Number(selectedItem.price).toFixed(2)}</Text>{isOrderable(selectedItem) ? <TouchableOpacity style={styles.itemModalAddButton} onPress={addSelectedItemToCart}><Feather name="plus" size={16} color="#FFFFFF" /><Text style={styles.addButtonText}>Add to order</Text></TouchableOpacity> : <View style={styles.soldBadge}><Text style={styles.soldText}>SOLD OUT</Text></View>}</View></View></View> : null}
        {cartVisible ? <View style={styles.modalBackdrop}><View style={styles.cartModal}><View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Your order</Text><Text style={styles.modalSubtitle}>{vendor?.business_name}</Text></View><TouchableOpacity onPress={() => setCartVisible(false)}><Feather name="x" size={22} color="#292524" /></TouchableOpacity></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checkoutBody}>{cart.map((line) => <View key={line.item.id} style={styles.cartLine}><View style={styles.cartLineTop}><View style={styles.cartLineCopy}><Text style={styles.cartItemName}>{line.item.name}</Text><Text style={styles.cartItemPrice}>PHP {(Number(line.item.price) * line.quantity).toFixed(2)}</Text></View><View style={styles.quantityControls}><TouchableOpacity onPress={() => changeQuantity(line.item.id, -1)} style={styles.quantityButton}><Feather name="minus" size={14} color="#C2410C" /></TouchableOpacity><Text style={styles.quantity}>{line.quantity}</Text><TouchableOpacity onPress={() => changeQuantity(line.item.id, 1)} style={styles.quantityButton}><Feather name="plus" size={14} color="#C2410C" /></TouchableOpacity></View></View><TextInput style={styles.noteInput} value={line.note} onChangeText={(note) => updateNote(line.item.id, note)} placeholder="Special preparation note (optional)" placeholderTextColor="#A8A29E" /></View>)}

          <View style={styles.checkoutSection}>
            <Text style={styles.sectionTitle}>Fulfillment</Text>
            {(vendor?.fulfillment_mode === 'both' || vendor?.fulfillment_mode === 'meetup') ? (
              <View style={styles.optionRow}>
                <TouchableOpacity style={[styles.optionChip, selectedFulfillment === 'pickup' && styles.optionChipActive]} onPress={() => setSelectedFulfillment('pickup')}>
                  <Text style={[styles.optionText, selectedFulfillment === 'pickup' && styles.optionTextActive]}>Pickup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, selectedFulfillment === 'meetup' && styles.optionChipActive]} onPress={() => setSelectedFulfillment('meetup')}>
                  <Text style={[styles.optionText, selectedFulfillment === 'meetup' && styles.optionTextActive]}>Meet-up</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.fulfillmentText}>
              {selectedFulfillment === 'meetup' ? (vendor?.meetup_details || 'Meet-up at the signed schedule') : (vendor?.physical_address || 'Pickup location')}
            </Text>
          </View>

          <View style={styles.checkoutSection}>
            <Text style={styles.sectionTitle}>Contact details</Text>
            <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Customer name" placeholderTextColor="#A8A29E" />
            <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="Phone number" keyboardType="phone-pad" placeholderTextColor="#A8A29E" />
            <TextInput style={[styles.input, styles.textArea]} value={deliveryNotes} onChangeText={setDeliveryNotes} multiline placeholder="Delivery or meetup notes" placeholderTextColor="#A8A29E" />
          </View>

          <View style={styles.checkoutSection}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.paymentGrid}>
              {['Cash on pickup', 'GCash', 'Maya'].map((method) => (
                <TouchableOpacity key={method} style={[styles.paymentOption, paymentMethod === method && styles.paymentOptionActive]} onPress={() => setPaymentMethod(method)}>
                  <Text style={[styles.paymentOptionText, paymentMethod === method && styles.paymentOptionTextActive]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {paymentMethod === 'GCash' || paymentMethod === 'Maya' ? <View style={styles.onlinePaymentBox}>
              <Text style={styles.onlinePaymentTitle}>Pay via QRPH</Text>
              <Text style={styles.paymentAmount}>Amount to pay: PHP {cartTotal.toFixed(2)}</Text>
              {selectedPaymentQrUrl ? <Image source={{ uri: selectedPaymentQrUrl }} style={styles.paymentQr} resizeMode="contain" /> : <Text style={styles.paymentFallback}>This vendor has not uploaded a {paymentMethod} QR code yet. Please use Cash on Pickup or contact the vendor.</Text>}
              {vendor?.payment_account_name ? <Text style={styles.onlinePaymentText}>Account: {vendor.payment_account_name}</Text> : null}
              <TextInput style={styles.input} value={paymentReference} onChangeText={setPaymentReference} placeholder="Enter payment reference number" placeholderTextColor="#A8A29E" autoCapitalize="characters" />
              <Text style={styles.paymentHint}>Your order will wait for vendor verification before preparation.</Text>
            </View> : null}
          </View>

          {coinBalance > 0 ? <TouchableOpacity style={styles.coinToggle} onPress={() => setUseCoins((current) => !current)} activeOpacity={0.85}>
            <View style={styles.coinCopy}><Feather name="award" size={17} color="#B45309" /><View><Text style={styles.coinTitle}>Apply loyalty coins</Text><Text style={styles.coinSubtitle}>{coinBalance} coin{coinBalance === 1 ? '' : 's'} available · 1 coin = PHP 1 · up to {maxCoinDiscount}</Text></View></View>
            <View style={[styles.toggleTrack, useCoins && styles.toggleTrackActive]}><View style={[styles.toggleThumb, useCoins && styles.toggleThumbActive]} /></View>
          </TouchableOpacity> : null}

          {coinDiscount > 0 ? <View style={styles.discountRow}><Text style={styles.discountLabel}>Loyalty discount</Text><Text style={styles.discountValue}>- PHP {coinDiscount.toFixed(2)}</Text></View> : null}
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>PHP {cartTotal.toFixed(2)}</Text></View>
          <TouchableOpacity style={styles.orderButton} onPress={placeOrder} disabled={placingOrder}>{placingOrder ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="check-circle" size={17} color="#FFFFFF" /><Text style={styles.orderButtonText}>Place order</Text></>}</TouchableOpacity>
          <Text style={styles.orderHint}>This order is sent directly to the vendor dashboard.</Text>
        </ScrollView></View></View> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  safeArea: { flex: 1 },
  content: { paddingBottom: 35 },
  hero: { height: 285, overflow: 'hidden', justifyContent: 'space-between' },
  heroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(41, 37, 36, 0.28)' },
  backButton: { margin: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  favoriteButton: { position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 20 },
  eyebrow: { color: '#FED7AA', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  vendorName: { color: '#FFFFFF', fontSize: 29, fontWeight: '900', marginTop: 5 },
  specialty: { color: '#FFF7ED', fontSize: 13, fontWeight: '700', marginTop: 4 },
  infoRow: { paddingHorizontal: 18, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3E8DC', gap: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, color: '#57534E', fontSize: 12, fontWeight: '700' },
  reviewsRow: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#FFF7ED', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F3E8DC' },
  reviewSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  reviewAverage: { color: '#92400E', fontSize: 15, fontWeight: '900' },
  reviewCount: { color: '#78716C', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  reviewsButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FED7AA', flexShrink: 0 },
  reviewsButtonText: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
  contactRow: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, backgroundColor: '#FFF7ED', flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F3E8DC' },
  contactButton: { flex: 1, minHeight: 43, borderRadius: 11, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  contactButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  callButton: { flex: 1, minHeight: 43, borderRadius: 11, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  callButtonText: { color: '#15803D', fontSize: 10, fontWeight: '900' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 4 },
  verifiedText: { color: '#166534', fontSize: 8, fontWeight: '900' },
  meetup: { marginHorizontal: 18, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#FFF1F2', flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetupText: { flex: 1, color: '#9F1239', fontSize: 12, fontWeight: '800' },
  batchSection: { marginHorizontal: 18, marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  batchHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  batchTitle: { color: '#92400E', fontSize: 13, fontWeight: '900' },
  batchSubtitle: { color: '#B45309', fontSize: 10, marginTop: 3 },
  batchList: { gap: 8, paddingTop: 11 },
  batchChip: { minWidth: 150, padding: 10, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FDE68A' },
  batchChipActive: { backgroundColor: '#D97706', borderColor: '#D97706' },
  batchChipScheduled: { backgroundColor: '#F5F5F4', borderColor: '#D6D3D1' },
  batchChipTitle: { color: '#92400E', fontSize: 11, fontWeight: '900' },
  batchChipDetail: { color: '#B45309', fontSize: 9, marginTop: 4 },
  batchChipTextActive: { color: '#FFFFFF' },
  noBatchText: { color: '#92400E', fontSize: 11, lineHeight: 16, marginTop: 10 },
  menuHeader: { marginHorizontal: 18, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuTitle: { color: '#292524', fontSize: 22, fontWeight: '900' },
  menuSubtitle: { color: '#A8A29E', fontSize: 12, fontWeight: '700', marginTop: 3 },
  cartButton: { minWidth: 44, height: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  cartButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  categoryList: { gap: 8, paddingHorizontal: 18, paddingVertical: 14 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC' },
  categoryChipActive: { backgroundColor: '#C2410C', borderColor: '#C2410C' },
  categoryText: { color: '#78716C', fontSize: 12, fontWeight: '800' },
  categoryTextActive: { color: '#FFFFFF' },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  productCard: { width: '48.5%', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#F3E8DC', overflow: 'hidden', marginBottom: 14 },
  soldProductCard: { backgroundColor: '#F5F5F4', borderColor: '#D6D3D1' },
  productImageWrap: { position: 'relative', height: 142 },
  menuImage: { width: '100%', height: '100%' },
  soldOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(87, 83, 78, 0.62)', paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  soldOverlayText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  lowStockBadge: { position: 'absolute', top: 10, left: 10, borderRadius: 999, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 5 },
  lowStockText: { color: '#92400E', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  productBody: { padding: 10 },
  productMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF7ED', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  ratingText: { color: '#B45309', fontSize: 9, fontWeight: '900' },
  categoryLabel: { color: '#C2410C', fontSize: 8, fontWeight: '900', letterSpacing: 1.0, textTransform: 'uppercase', flexShrink: 1 },
  itemName: { color: '#292524', fontSize: 15, fontWeight: '900', marginTop: 8 },
  itemDescription: { color: '#78716C', fontSize: 11, lineHeight: 16, marginTop: 5 },
  options: { color: '#9F1239', fontSize: 9, fontWeight: '700', marginTop: 7 },
  price: { color: '#C2410C', fontSize: 16, fontWeight: '900' },
  soldPrice: { color: '#A8A29E' },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  addButton: { backgroundColor: '#C2410C', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  soldBadge: { backgroundColor: '#F5F5F4', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  soldText: { color: '#78716C', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  emptyState: { margin: 18, padding: 35, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', borderWidth: 1, borderColor: '#F3E8DC' },
  emptyTitle: { color: '#292524', fontSize: 17, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#78716C', fontSize: 12, textAlign: 'center', marginTop: 5 },
  loader: { marginVertical: 35 },
  errorState: { margin: 18, padding: 25, borderRadius: 17, backgroundColor: '#FEF2F2', alignItems: 'center' },
  errorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center', marginTop: 10 },
  retryButton: { marginTop: 15, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#B91C1C' },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  cartBar: { position: 'absolute', left: 14, right: 14, bottom: 14, minHeight: 62, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#7C2D12', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 6, shadowColor: '#292524', shadowOpacity: 0.2, shadowRadius: 10 },
  cartBarTitle: { color: '#FED7AA', fontSize: 11, fontWeight: '800' },
  cartBarTotal: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 2 },
  viewCart: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  viewCartText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  itemModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(41,37,36,0.55)', justifyContent: 'flex-end' },
  itemModal: { backgroundColor: '#FFF9F2', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 28 },
  itemModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  itemModalEyebrow: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  itemModalImage: { width: '100%', height: 210, borderRadius: 17, overflow: 'hidden', backgroundColor: '#7C2D12' },
  itemModalCategory: { color: '#C2410C', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 15 },
  itemModalName: { color: '#292524', fontSize: 27, fontWeight: '900', marginTop: 4 },
  itemModalDescription: { color: '#78716C', fontSize: 12, lineHeight: 19, marginTop: 8 },
  itemModalOptions: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#FFF1F2', flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemModalOptionsText: { color: '#9F1239', fontSize: 11, fontWeight: '700', flex: 1 },
  itemModalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19 },
  itemModalPrice: { color: '#C2410C', fontSize: 21, fontWeight: '900' },
  itemModalAddButton: { minHeight: 46, paddingHorizontal: 17, borderRadius: 12, backgroundColor: '#C2410C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(41,37,36,0.5)', justifyContent: 'flex-end' },
  cartModal: { maxHeight: '82%', backgroundColor: '#FFF9F2', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 },
  modalTitle: { color: '#292524', fontSize: 22, fontWeight: '900' },
  modalSubtitle: { color: '#A8A29E', fontSize: 12, fontWeight: '700', marginTop: 3 },
  checkoutBody: { paddingBottom: 8 },
  cartLine: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E7D9CC' },
  cartLineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cartLineCopy: { flex: 1, minWidth: 0, maxWidth: '62%' },
  cartItemName: { color: '#292524', fontSize: 14, fontWeight: '900' },
  cartItemPrice: { color: '#C2410C', fontSize: 13, fontWeight: '900', marginTop: 4 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 4 },
  quantityButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  quantity: { minWidth: 24, textAlign: 'center', color: '#292524', fontSize: 17, fontWeight: '900' },
  noteInput: { minHeight: 38, marginTop: 10, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', color: '#292524', fontSize: 11 },
  checkoutSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E7D9CC' },
  sectionTitle: { color: '#292524', fontSize: 14, fontWeight: '900', marginBottom: 10 },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionChip: { flex: 1, paddingVertical: 9, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', alignItems: 'center' },
  optionChipActive: { borderColor: '#C2410C', backgroundColor: '#FFF1E6' },
  optionText: { color: '#57534E', fontSize: 12, fontWeight: '800' },
  optionTextActive: { color: '#C2410C' },
  fulfillmentText: { color: '#6B7280', fontSize: 11, lineHeight: 17, marginTop: 8 },
  input: { minHeight: 42, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', borderRadius: 10, paddingHorizontal: 12, color: '#292524', fontSize: 12, marginBottom: 10 },
  textArea: { minHeight: 74, textAlignVertical: 'top', paddingTop: 10 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentOption: { flexBasis: '48%', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7D9CC', alignItems: 'center' },
  paymentOptionActive: { backgroundColor: '#FFF1E6', borderColor: '#C2410C' },
  paymentOptionText: { color: '#57534E', fontSize: 11, fontWeight: '800' },
  paymentOptionTextActive: { color: '#C2410C' },
  onlinePaymentBox: { marginTop: 12, padding: 13, borderRadius: 13, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', alignItems: 'center' },
  onlinePaymentTitle: { color: '#9A3412', fontSize: 13, fontWeight: '900' },
  paymentAmount: { color: '#C2410C', fontSize: 16, fontWeight: '900', marginTop: 7 },
  onlinePaymentText: { color: '#78716C', fontSize: 11, textAlign: 'center', marginTop: 7 },
  paymentFallback: { color: '#9A3412', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  paymentQr: { width: 170, height: 170, marginTop: 10, backgroundColor: '#FFFFFF' },
  paymentHint: { color: '#9A3412', fontSize: 10, textAlign: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
  totalLabel: { color: '#292524', fontSize: 15, fontWeight: '900' },
  totalValue: { color: '#C2410C', fontSize: 20, fontWeight: '900' },
  coinToggle: { marginTop: 14, padding: 13, borderRadius: 13, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coinCopy: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  coinTitle: { color: '#92400E', fontSize: 12, fontWeight: '900' },
  coinSubtitle: { color: '#B45309', fontSize: 10, marginTop: 3 },
  toggleTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#D6D3D1', padding: 3 },
  toggleTrackActive: { backgroundColor: '#D97706' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  toggleThumbActive: { alignSelf: 'flex-end' },
  discountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13 },
  discountLabel: { color: '#B45309', fontSize: 12, fontWeight: '800' },
  discountValue: { color: '#B45309', fontSize: 12, fontWeight: '900' },
  orderButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#C2410C', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  orderButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  orderHint: { color: '#A8A29E', fontSize: 11, textAlign: 'center', marginTop: 10 },
});
