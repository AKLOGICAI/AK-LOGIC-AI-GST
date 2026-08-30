/**
 * Shared JSON fetch client for the FastAPI backend.
 *
 * RLS hardening Phase 2 (see supabase/migrations/0005_merchants_lockdown.sql):
 * merchant registration/login/profile-edit/plan-purchase and every admin
 * merchant-management action now go through the backend instead of the
 * browser talking directly to Supabase with the anon key. This module is
 * the one place that knows how to call it, reused by both
 * merchantService and adminService in services.ts.
 */

import { secureStorage } from './secureStorage';
import { emit } from './db';

const getApiBase = (): string => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim()) return envBase.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  return 'https://gst-v1p5.onrender.com';
};

const API_BASE = getApiBase();

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class ApiUnavailableError extends Error {
  constructor(message = 'The server is not reachable. Please check your internet/backend server connection and try again.') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiUnavailableError();
  }

  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    if (res.status === 401) {
      if (path.startsWith('/api/merchant')) {
        secureStorage.removeItem('aklogic_merchant_session');
        emit();
      } else if (path.startsWith('/api/admin')) {
        secureStorage.removeItem('aklogic_admin_session');
        emit();
      }
    }
    const message =
      (data.detail as string) ||
      (data.message as string) ||
      `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const apiConfigured = !!API_BASE;
