// AK-LOGIC AI GST — Local-First Offline Cache Helper
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'ak_cache_';

export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data as T;
  } catch {
    return null;
  }
}

export async function setCache(key: string, data: any): Promise<void> {
  try {
    const payload = {
      data,
      cachedAt: Date.now(),
    };
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (err) {
    console.warn(`Failed to set cache for ${key}:`, err);
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch {}
}
