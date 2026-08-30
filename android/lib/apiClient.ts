// AK-LOGIC AI GST — Android HTTP API Client
// Connected to FastAPI + PostgreSQL backend

const API_BASE_URL = 'https://gst-v1p5.onrender.com';

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  message?: string;
  status?: number;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number = 500, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let activeAuthToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  activeAuthToken = token;
}

export function getApiAuthToken(): string | null {
  return activeAuthToken;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    token?: string | null;
    timeoutMs?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    token = activeAuthToken,
    timeoutMs = 60000,
    retries = 2,
  } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (!(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let responseData: any = null;

      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }
      }

      if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        if (responseData) {
          if (typeof responseData.detail === 'string') {
            errorMsg = responseData.detail;
          } else if (Array.isArray(responseData.detail) && responseData.detail[0]?.msg) {
            errorMsg = responseData.detail[0].msg;
          } else if (responseData.message) {
            errorMsg = responseData.message;
          } else if (responseData.error) {
            errorMsg = responseData.error;
          }
        }
        throw new ApiError(errorMsg, response.status, responseData);
      }

      return responseData as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      // If it's a 4xx client error (e.g. 401 Unauthorized, 404, 409), do not retry
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // If retries remain and it's a network timeout / cold-start abort, wait and retry
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
    }
  }

  if (lastError?.name === 'AbortError' || lastError?.message?.includes('canceled') || lastError?.message?.includes('network')) {
    throw new ApiError('Server took too long to respond (cold start or slow network). Please try again.', 408);
  }
  if (lastError instanceof ApiError) {
    throw lastError;
  }
  throw new ApiError(lastError?.message || 'Network request failed. Please check your internet connection.', 0);
}

export const api = {
  get: <T = any>(endpoint: string, options: { token?: string | null; timeoutMs?: number } = {}) =>
    apiRequest<T>(endpoint, { method: 'GET', ...options }),

  post: <T = any>(endpoint: string, body: any, options: { token?: string | null; timeoutMs?: number } = {}) =>
    apiRequest<T>(endpoint, { method: 'POST', body, ...options }),

  put: <T = any>(endpoint: string, body: any, options: { token?: string | null; timeoutMs?: number } = {}) =>
    apiRequest<T>(endpoint, { method: 'PUT', body, ...options }),

  patch: <T = any>(endpoint: string, body: any, options: { token?: string | null; timeoutMs?: number } = {}) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body, ...options }),

  delete: <T = any>(endpoint: string, options: { token?: string | null; timeoutMs?: number } = {}) =>
    apiRequest<T>(endpoint, { method: 'DELETE', ...options }),
};
