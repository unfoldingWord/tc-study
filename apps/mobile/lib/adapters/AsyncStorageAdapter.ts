/**
 * AsyncStorage Adapter for linked-panels
 * 
 * A React Native-compatible storage adapter that uses AsyncStorage
 * instead of localStorage for panel state persistence.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export class AsyncStorageAdapter {
  private storageKey: string;

  constructor(storageKey: string = 'linked-panels-state') {
    this.storageKey = storageKey;
  }

  isAvailable(): boolean {
    // AsyncStorage is always available in React Native
    return true;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const item = await AsyncStorage.getItem(`${this.storageKey}:${key}`);
      return item;
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to get item ${key}:`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`${this.storageKey}:${key}`, value);
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to set item ${key}:`, error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${this.storageKey}:${key}`);
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to remove item ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const panelKeys = keys.filter(key => key.startsWith(`${this.storageKey}:`));
      await AsyncStorage.multiRemove(panelKeys);
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to clear storage:`, error);
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys
        .filter(key => key.startsWith(`${this.storageKey}:`))
        .map(key => key.replace(`${this.storageKey}:`, ''));
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to get all keys:`, error);
      return [];
    }
  }
}
