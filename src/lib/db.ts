/**
 * Persistence adapter.
 *
 * Today this is backed by localStorage. To migrate to FastAPI + PostgreSQL,
 * replace the `Table` implementation with `fetch()` calls to REST endpoints
 * (e.g. GET /api/merchants, POST /api/billing-requests). The service layer
 * (services.ts) and React hooks stay unchanged.
 */

import { secureStorage } from './secureStorage';

const NS = 'aklogic';

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(cb: Listener) { listeners.add(cb); return () => listeners.delete(cb); }
export function emit() { listeners.forEach((l) => l()); }

// Cross-tab sync: subscribe()/emit() above only notify listeners within the
// SAME tab that performed the write, because `cache` and `listeners` are
// in-memory, per-tab module state. A customer submitting a request in one
// tab (e.g. the QR-scan flow) never reaches a merchant's dashboard open in
// another tab of the same browser — that tab's own `cache` stays stale
// until it happens to write something itself or the page is reloaded.
// The browser's native `storage` event fires in every OTHER tab of the same
// origin whenever localStorage changes, so we use it to invalidate our
// cache for the changed key and notify this tab's subscribers, keeping
// multiple tabs of the same browser live-in-sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(`${NS}_`)) return;
    cache.delete(e.key);
    emit();
  });
}

/**
 * Snapshot cache (critical for performance + correctness with
 * useSyncExternalStore). Decrypting + JSON.parsing on every read would (a) be
 * slow and (b) return a NEW array reference each call, which makes React think
 * the store changed on every check → excessive re-renders / "getSnapshot should
 * be cached" warnings. We cache the parsed value per key and only invalidate
 * the specific key on write. Reads then return a stable reference.
 */
const cache = new Map<string, unknown>();

// All reads/writes go through the encryption-at-rest layer.
function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let val: T = fallback;
  try {
    const raw = secureStorage.getItem(key);
    if (raw) val = JSON.parse(raw) as T;
  } catch {
    val = fallback;
  }
  cache.set(key, val);
  return val;
}
function write<T>(key: string, val: T) {
  cache.set(key, val); // keep cache in sync so subsequent reads are stable
  try {
    secureStorage.setItem(key, JSON.stringify(val));
  } catch {
    // storage full / serialization issue — keep in-memory value so app stays usable
  }
}

export interface Identifiable { id: string }

/** A typed collection mapped to one Postgres table. */
export class Table<T extends Identifiable> {
  private key: string;
  constructor(name: string) { this.key = `${NS}_${name}`; }

  all(): T[] {
    const val = read<T[]>(this.key, []);
    // A corrupted/mismatched-key decrypt can produce JSON that parses
    // successfully but isn't actually an array (e.g. an object or null).
    // read()'s try/catch only guards against JSON.parse throwing, not
    // against a wrong-shaped result — validate the shape here so callers
    // (useInvoices/useRequests/etc.) never receive a non-array and crash
    // on .find()/.filter()/.map().
    if (!Array.isArray(val)) return [];
    return val;
  }
  find(pred: (t: T) => boolean): T | undefined { return this.all().find(pred); }
  filter(pred: (t: T) => boolean): T[] { return this.all().filter(pred); }
  byId(id: string): T | undefined { return this.all().find((t) => t.id === id); }

  setAll(rows: T[]) { write(this.key, rows); emit(); }

  insert(row: T): T { write(this.key, [row, ...this.all()]); emit(); return row; }
  append(row: T): T { write(this.key, [...this.all(), row]); emit(); return row; }

  update(id: string, patch: Partial<T>): T | undefined {
    const rows = this.all();
    let updated: T | undefined;
    const next = rows.map((r) => {
      if (r.id === id) {
        const merged = { ...r };
        for (const k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) {
            const val = patch[k];
            if (val !== undefined && val !== '') {
              merged[k] = val as any;
            }
          }
        }
        return (updated = merged);
      }
      return r;
    });
    write(this.key, next); emit();
    return updated;
  }

  remove(id: string) { write(this.key, this.all().filter((r) => r.id !== id)); emit(); }
  seed(rows: T[]) { write(this.key, rows); }
  upsert(row: T) {
    if (this.byId(row.id)) {
      this.update(row.id, row);
    } else {
      this.append(row);
    }
  }
  isEmpty(): boolean { return this.all().length === 0; }
}

/**
 * A typed collection for data that is genuinely SHARED across
 * devices/browsers (a customer submits a billing request on their phone;
 * a merchant must see it on a laptop in a different browser entirely). A
 * plain `Table` can never do this: it only ever reads/writes the current
 * browser's own localStorage.
 *
 * RLS hardening Phase 3 (see supabase/migrations/0007_billing_invoices_
 * lockdown.sql and backend/app/routers/billing.py): billing_requests and
 * invoices are no longer reachable from the browser with the anon key at
 * all — every read and write now goes through the FastAPI backend, scoped
 * and authorized per trust level (public/merchant/admin). This class is
 * therefore a plain in-memory cache with NO direct backend knowledge of
 * its own: callers (services.ts) are responsible for fetching from the
 * right endpoint and pushing the result in via `setAll`/`upsert`. It
 * reuses the same subscribe()/emit() bus as `Table` so every existing
 * useSyncExternalStore-based hook (useRequests, useInvoices, ...) keeps
 * working completely unchanged — components don't know or care whether
 * their data lives in localStorage or was fetched from the backend.
 */
export class CachedTable<T extends Identifiable> {
  private cache: T[] = [];
  private ready = false;
  private key: string;

  constructor(name?: string) {
    this.key = name ? `${NS}_cached_${name}` : '';
    if (this.key) {
      try {
        const persisted = read<T[]>(this.key, []);
        if (Array.isArray(persisted) && persisted.length > 0) {
          this.cache = persisted;
          this.ready = true;
        }
      } catch {
        // ignore
      }
    }
  }

  all(): T[] { return this.cache; }
  find(pred: (t: T) => boolean): T | undefined { return this.cache.find(pred); }
  filter(pred: (t: T) => boolean): T[] { return this.cache.filter(pred); }
  byId(id: string): T | undefined { return this.cache.find((t) => t.id === id); }
  /** False until the first backend fetch resolves or local cache is loaded. */
  isReady(): boolean { return this.ready; }

  /** Replace the whole cache — used after a list-all fetch */
  setAll(rows: T[]) {
    this.cache = rows;
    this.ready = true;
    if (this.key) {
      write(this.key, rows);
    }
    emit();
  }

  /** Insert-or-replace a single row */
  upsert(row: T) {
    const idx = this.cache.findIndex((r) => r.id === row.id);
    this.cache = idx === -1 ? [row, ...this.cache] : this.cache.map((r) => (r.id === row.id ? row : r));
    this.ready = true;
    if (this.key) {
      write(this.key, this.cache);
    }
    emit();
  }

  seed(rows: T[]) { void rows; }
}

export function genId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/**
 * Singleton key-value document store (for platform-wide settings such as the
 * default AK-LOGIC AI logo). Maps to a single-row config table in Postgres.
 */
export class Singleton<T> {
  private key: string;
  constructor(name: string, private fallback: T) { this.key = `${NS}_kv_${name}`; }
  get(): T { return read<T>(this.key, this.fallback); }
  set(value: T) { write(this.key, value); emit(); }
  patch(partial: Partial<T>) { write(this.key, { ...this.get(), ...partial }); emit(); }
}

/** Schema version flag so we can re-seed demo data on breaking changes.
 *  Bumped to v8 when encryption-at-rest was introduced so data is freshly
 *  written through the encrypted layer (no half-migrated plaintext). */
// Bumped to v10 to force re-seeding on every existing browser: v9 and
// earlier seeded a fake "AK-LOGIC-AI / Anil Kumar" demo merchant into the
// local cache, which has been removed. This clears that stale local record
// for anyone who already has it (Supabase, the real source of truth, was
// never affected since this merchant was only ever local).
const SCHEMA_VERSION = 'aklogic_schema_v10_no_demo_data';
export function needsSeed(): boolean { return !localStorage.getItem(SCHEMA_VERSION); }
export function markSeeded() { localStorage.setItem(SCHEMA_VERSION, '1'); }
