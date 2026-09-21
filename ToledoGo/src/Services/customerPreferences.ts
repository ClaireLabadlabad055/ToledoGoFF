import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FavoriteKitchen {
  id: string;
  business_name: string;
  cuisine_specialty?: string | null;
  physical_address?: string | null;
  store_type?: string | null;
}

export interface CustomerPreferences {
  defaultAddress: string;
  orderUpdates: boolean;
  localPicks: boolean;
  favorites: FavoriteKitchen[];
}

const getStorageKey = (userId: string) => `@toledogo/customer-preferences/${userId}`;

const defaultPreferences: CustomerPreferences = {
  defaultAddress: '',
  orderUpdates: true,
  localPicks: true,
  favorites: [],
};

export const getCustomerPreferences = async (userId: string): Promise<CustomerPreferences> => {
  const stored = await AsyncStorage.getItem(getStorageKey(userId));
  if (!stored) return defaultPreferences;

  try {
    return { ...defaultPreferences, ...JSON.parse(stored) };
  } catch {
    return defaultPreferences;
  }
};

export const saveCustomerPreferences = async (userId: string, preferences: CustomerPreferences) => {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(preferences));
};

export const toggleFavoriteKitchen = async (userId: string, kitchen: FavoriteKitchen) => {
  const preferences = await getCustomerPreferences(userId);
  const isSaved = preferences.favorites.some((favorite) => favorite.id === kitchen.id);
  const favorites = isSaved
    ? preferences.favorites.filter((favorite) => favorite.id !== kitchen.id)
    : [kitchen, ...preferences.favorites];
  const nextPreferences = { ...preferences, favorites };
  await saveCustomerPreferences(userId, nextPreferences);
  return { preferences: nextPreferences, isSaved: !isSaved };
};