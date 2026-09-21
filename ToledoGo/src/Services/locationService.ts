import * as Location from 'expo-location';
import { Alert } from 'react-native';

// Toledo City Center Coordinates
const TOLEDO_CITY_CENTER = {
  latitude: 10.3788,
  longitude: 123.6425,
};

// Maximum allowed radius in kilometers (15km service zone)
const MAX_RADIUS_KM = 15;

// Haversine formula to calculate distance between two lat/long points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of Earth in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

export const verifyUserLocation = async (): Promise<boolean> => {
  try {
    // 1. Request foreground location permissions
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location access is required to verify your delivery address and prevent spam orders.');
      return false;
    }

    // 2. Fetch current high-accuracy device GPS position
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude, longitude } = location.coords;

    // 3. Calculate distance from Toledo City center
    const distance = calculateDistance(
      latitude, 
      longitude, 
      TOLEDO_CITY_CENTER.latitude, 
      TOLEDO_CITY_CENTER.longitude
    );

    // 4. Enforce boundary check
    if (distance > MAX_RADIUS_KM) {
      Alert.alert(
        'Outside Service Area',
        `Your current location is about ${distance.toFixed(1)}km away from Toledo City. ToledoGo's services are currently restricted to local community zones.`
      );
      return false;
    }

    return true; // Location is valid!
  } catch (error) {
    Alert.alert('Error', 'Could not fetch your location. Please ensure GPS is enabled.');
    return false;
  }
};