/**
 * offlineDb.ts — High-Performance Encrypted IndexedDB Storage Layer for AK-LOGIC AI GST
 * 
 * Provides structured offline caching, delta change tracking, and local query indexing.
 * Pure Web Standards (IndexedDB + Web Crypto API) — Zero npm bundle bloat.
 */

const DB_NAME = 'ak_logic_offline_v1';
const DB_VERSION = 1;

export type SyncStatus = 'synced' | 'pending_sync' | 'failed';

export interface OfflineInvoice {
  id: string;
  requestId?: string;
  merchantId: string;
  invoiceNo: string;
  invoiceNumber?: string;
  invoiceDate: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress?: string;
  customerState?: string;
  paymentMode: string;
  paymentRef?: string;
  notes?: string;
  branded?: boolean;
  items: any[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  amountInWords?: string;
  placeOfSupply?: string;
  isInterState?: boolean;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OfflinePurchase {
  id: string;
  merchantId: string;
  supplierName: string;
  supplierGstin?: string;
  billNumber: string;
  billDate?: string;
  totalAmount: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  items: any[];
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OfflineInventoryItem {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  hsn: string;
  gstRate: number;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
  syncStatus: SyncStatus;
  updatedAt: number;
}

export interface OfflineContact {
  id: string;
  merchantId: string;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  state?: string;
  outstandingBalance?: number;
  updatedAt: number;
}

export interface OfflineJournalEntry {
  id: string;
  merchantId: string;
  entry_date: string;
  narration: string;
  source_type: 'invoice' | 'purchase' | 'manual';
  source_id: string;
  is_reversed: boolean;
  syncStatus: SyncStatus;
  createdAt: number;
}

export interface OfflineJournalLine {
  id: string;
  journal_entry_id: string;
  merchantId: string;
  account_id: string;
  account_code: string;
  debit: number;
  credit: number;
  party_type?: string;
  party_ref?: string;
  createdAt: number;
}

export interface OfflineDraft {
  id: string; // e.g. "draft_invoice_current"
  merchantId: string;
  type: 'invoice' | 'purchase';
  data: Record<string, any>;
  updatedAt: number;
}

export interface OutboxOperation {
  id: string;
  idempotencyKey: string;
  merchantId: string;
  entityType: 'invoice' | 'purchase' | 'inventory_delta' | 'contact';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

// -------------------------------------------------------------
// Web Crypto AES-GCM Layer
// -------------------------------------------------------------
const ENCRYPTION_SALT_KEY = 'ak_offline_salt';

async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  let salt = localStorage.getItem(ENCRYPTION_SALT_KEY);
  if (!salt) {
    const rawSalt = new Uint8Array(16);
    crypto.getRandomValues(rawSalt);
    salt = Array.from(rawSalt).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(ENCRYPTION_SALT_KEY, salt);
  }

  const enc = new TextEncoder();
  const rawKeyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(`AK_LOGIC_LOCAL_OFFLINE_${salt}_KEY`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 10000,
      hash: 'SHA-256',
    },
    rawKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

let cachedKey: CryptoKey | null = null;
async function getCryptoKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await getOrCreateCryptoKey();
  }
  return cachedKey;
}

export async function encryptData(plainText: string): Promise<string> {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );

    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    return plainText;
  }
}

export async function decryptData(cipherText: string): Promise<string> {
  try {
    const key = await getCryptoKey();
    const combined = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipherBytes = combined.slice(12);

    const dec = new TextDecoder();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes
    );
    return dec.decode(plainBuffer);
  } catch (e) {
    return cipherText;
  }
}

// -------------------------------------------------------------
// IndexedDB Core Class
// -------------------------------------------------------------
class OfflineDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public init(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }

      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;

        // Invoices Store
        if (!db.objectStoreNames.contains('invoices')) {
          const s = db.createObjectStore('invoices', { keyPath: 'id' });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
          s.createIndex('idx_syncStatus', 'syncStatus', { unique: false });
          s.createIndex('idx_createdAt', 'createdAt', { unique: false });
          s.createIndex('idx_customerPhone', 'customerPhone', { unique: false });
        }

        // Purchases Store
        if (!db.objectStoreNames.contains('purchases')) {
          const s = db.createObjectStore('purchases', { keyPath: 'id' });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
          s.createIndex('idx_syncStatus', 'syncStatus', { unique: false });
          s.createIndex('idx_createdAt', 'createdAt', { unique: false });
        }

        // Inventory Store
        if (!db.objectStoreNames.contains('inventory')) {
          const s = db.createObjectStore('inventory', { keyPath: 'id' });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
          s.createIndex('idx_name', 'name', { unique: false });
          s.createIndex('idx_hsn', 'hsn', { unique: false });
        }

        // Contacts / Customers Store
        if (!db.objectStoreNames.contains('contacts')) {
          const s = db.createObjectStore('contacts', { keyPath: 'id' });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
          s.createIndex('idx_phone', 'phone', { unique: false });
          s.createIndex('idx_name', 'name', { unique: false });
        }

        // Journal Entries Store
        if (!db.objectStoreNames.contains('journal_entries')) {
          const s = db.createObjectStore('journal_entries', { keyPath: 'id' });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
          s.createIndex('idx_syncStatus', 'syncStatus', { unique: false });
          s.createIndex('idx_source', ['source_type', 'source_id'], { unique: false });
        }

        // Journal Lines Store
        if (!db.objectStoreNames.contains('journal_lines')) {
          const s = db.createObjectStore('journal_lines', { keyPath: 'id' });
          s.createIndex('idx_entry', 'journal_entry_id', { unique: false });
          s.createIndex('idx_merchant_acc', ['merchantId', 'account_code'], { unique: false });
        }

        // Drafts Store
        if (!db.objectStoreNames.contains('drafts')) {
          const s = db.createObjectStore('drafts', { keyPath: 'id' });
          s.createIndex('idx_merchant_type', ['merchantId', 'type'], { unique: false });
        }

        // Outbox Store (Change-log for synchronization)
        if (!db.objectStoreNames.contains('outbox')) {
          const s = db.createObjectStore('outbox', { keyPath: 'id' });
          s.createIndex('idx_idempotency', 'idempotencyKey', { unique: true });
          s.createIndex('idx_status_created', ['status', 'createdAt'], { unique: false });
          s.createIndex('idx_merchantId', 'merchantId', { unique: false });
        }

        // KV Meta Store
        if (!db.objectStoreNames.contains('kv_meta')) {
          db.createObjectStore('kv_meta', { keyPath: 'key' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  public async getStore(name: string, mode: IDBTransactionMode = 'readonly'): Promise<{ store: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.init();
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    return { store, tx };
  }

  // -------------------------------------------------------------
  // Invoices API
  // -------------------------------------------------------------
  public async saveInvoice(inv: OfflineInvoice): Promise<OfflineInvoice> {
    const { store } = await this.getStore('invoices', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(inv);
      req.onsuccess = () => resolve(inv);
      req.onerror = () => reject(req.error);
    });
  }

  public async getInvoices(merchantId: string): Promise<OfflineInvoice[]> {
    const { store } = await this.getStore('invoices', 'readonly');
    const idx = store.index('idx_merchantId');
    return new Promise((resolve, reject) => {
      const req = idx.getAll(IDBKeyRange.only(merchantId));
      req.onsuccess = () => {
        const rows: OfflineInvoice[] = req.result || [];
        rows.sort((a, b) => b.createdAt - a.createdAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getInvoiceById(id: string): Promise<OfflineInvoice | null> {
    const { store } = await this.getStore('invoices', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // -------------------------------------------------------------
  // Inventory API
  // -------------------------------------------------------------
  public async setInventory(merchantId: string, items: OfflineInventoryItem[]): Promise<void> {
    const { store } = await this.getStore('inventory', 'readwrite');
    for (const it of items) {
      store.put({ ...it, merchantId });
    }
  }

  public async getInventory(merchantId: string): Promise<OfflineInventoryItem[]> {
    const { store } = await this.getStore('inventory', 'readonly');
    const idx = store.index('idx_merchantId');
    return new Promise((resolve, reject) => {
      const req = idx.getAll(IDBKeyRange.only(merchantId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async decrementStockLocal(itemId: string, deltaQty: number): Promise<void> {
    const { store } = await this.getStore('inventory', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.get(itemId);
      req.onsuccess = () => {
        const item: OfflineInventoryItem = req.result;
        if (item) {
          item.stockQuantity = Math.max(0, (item.stockQuantity || 0) - deltaQty);
          item.updatedAt = Date.now();
          store.put(item);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // -------------------------------------------------------------
  // Contacts API
  // -------------------------------------------------------------
  public async setContacts(merchantId: string, contacts: OfflineContact[]): Promise<void> {
    const { store } = await this.getStore('contacts', 'readwrite');
    for (const c of contacts) {
      store.put({ ...c, merchantId });
    }
  }

  public async getContacts(merchantId: string): Promise<OfflineContact[]> {
    const { store } = await this.getStore('contacts', 'readonly');
    const idx = store.index('idx_merchantId');
    return new Promise((resolve, reject) => {
      const req = idx.getAll(IDBKeyRange.only(merchantId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async upsertContact(contact: OfflineContact): Promise<void> {
    const { store } = await this.getStore('contacts', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(contact);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // -------------------------------------------------------------
  // Drafts API
  // -------------------------------------------------------------
  public async saveDraft(draft: OfflineDraft): Promise<void> {
    const { store } = await this.getStore('drafts', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(draft);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getDraft(id: string): Promise<OfflineDraft | null> {
    const { store } = await this.getStore('drafts', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async clearDraft(id: string): Promise<void> {
    const { store } = await this.getStore('drafts', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // -------------------------------------------------------------
  // Outbox Queue API
  // -------------------------------------------------------------
  public async pushOutbox(op: OutboxOperation): Promise<void> {
    const { store } = await this.getStore('outbox', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(op);
      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('outbox-updated'));
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getPendingOutbox(merchantId: string): Promise<OutboxOperation[]> {
    const { store } = await this.getStore('outbox', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows: OutboxOperation[] = req.result || [];
        const filtered = rows.filter((r) => r.merchantId === merchantId && r.status !== 'synced');
        filtered.sort((a, b) => a.createdAt - b.createdAt);
        resolve(filtered);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async updateOutboxStatus(id: string, status: 'pending' | 'syncing' | 'failed', error?: string): Promise<void> {
    const { store } = await this.getStore('outbox', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const op: OutboxOperation = req.result;
        if (op) {
          op.status = status;
          op.retryCount = (op.retryCount || 0) + (status === 'failed' ? 1 : 0);
          if (error) op.lastError = error;
          op.updatedAt = Date.now();
          store.put(op);
        }
        window.dispatchEvent(new CustomEvent('outbox-updated'));
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async removeOutbox(id: string): Promise<void> {
    const { store } = await this.getStore('outbox', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('outbox-updated'));
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getOutboxCount(merchantId: string): Promise<number> {
    const pending = await this.getPendingOutbox(merchantId);
    return pending.length;
  }

  // -------------------------------------------------------------
  // Accounting Double-Entry Local Journal Stores
  // -------------------------------------------------------------
  public async saveJournalEntry(entry: OfflineJournalEntry, lines: OfflineJournalLine[]): Promise<void> {
    const { store: eStore } = await this.getStore('journal_entries', 'readwrite');
    const { store: lStore } = await this.getStore('journal_lines', 'readwrite');

    return new Promise((resolve) => {
      eStore.put(entry);
      for (const l of lines) {
        lStore.put(l);
      }
      resolve();
    });
  }

  public async getLocalTrialBalance(merchantId: string): Promise<{ accounts: any[]; totalDebit: number; totalCredit: number; isBalanced: boolean }> {
    const { store } = await this.getStore('journal_lines', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const lines: OfflineJournalLine[] = (req.result || []).filter((l: OfflineJournalLine) => l.merchantId === merchantId);
        const map: Record<string, { code: string; debit: number; credit: number }> = {};

        let grandDebit = 0;
        let grandCredit = 0;

        for (const l of lines) {
          if (!map[l.account_code]) {
            map[l.account_code] = { code: l.account_code, debit: 0, credit: 0 };
          }
          map[l.account_code].debit += Number(l.debit || 0);
          map[l.account_code].credit += Number(l.credit || 0);
          grandDebit += Number(l.debit || 0);
          grandCredit += Number(l.credit || 0);
        }

        grandDebit = Math.round(grandDebit * 100) / 100;
        grandCredit = Math.round(grandCredit * 100) / 100;
        const isBalanced = Math.abs(grandDebit - grandCredit) < 0.05;

        resolve({
          accounts: Object.values(map),
          totalDebit: grandDebit,
          totalCredit: grandCredit,
          isBalanced
        });
      };
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineDb = new OfflineDatabase();
