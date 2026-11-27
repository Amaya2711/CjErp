/**
 * Almacenamiento clave/valor asíncrono. Por defecto usa localStorage (desarrollo y PWA).
 * En la app empaquetada con Capacitor se reemplaza llamando a setStorage() con una
 * implementación basada en @capacitor/preferences o en un plugin de almacenamiento seguro.
 */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const localStorageImpl: KeyValueStorage = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sin almacenamiento disponible */
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* sin almacenamiento disponible */
    }
  },
};

let current: KeyValueStorage = localStorageImpl;

export function setStorage(storage: KeyValueStorage) {
  current = storage;
}

export function getStorage(): KeyValueStorage {
  return current;
}
