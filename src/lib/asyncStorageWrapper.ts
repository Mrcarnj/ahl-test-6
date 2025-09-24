import AsyncStorage from '@react-native-async-storage/async-storage';

// Wrapper for AsyncStorage with error handling to prevent app crashes
// when AsyncStorage fails to create directories (common in simulators)

export const safeAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.warn(`AsyncStorage.getItem failed for key "${key}":`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.warn(`AsyncStorage.setItem failed for key "${key}":`, error);
      // Don't throw - let the app continue without persistence
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn(`AsyncStorage.removeItem failed for key "${key}":`, error);
      // Don't throw - let the app continue
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.warn('AsyncStorage.clear failed:', error);
      // Don't throw - let the app continue
    }
  },

  async getAllKeys(): Promise<readonly string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.warn('AsyncStorage.getAllKeys failed:', error);
      return [];
    }
  }
};

// Test AsyncStorage availability on app start
export const testAsyncStorage = async (): Promise<boolean> => {
  try {
    await AsyncStorage.setItem('__test__', 'test');
    await AsyncStorage.removeItem('__test__');
    return true;
  } catch (error) {
    console.warn('AsyncStorage is not available:', error);
    return false;
  }
};
