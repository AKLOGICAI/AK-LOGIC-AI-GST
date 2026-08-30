import { auth } from './services';
import { apiRequest } from './apiClient';

export interface ChatThread {
  id: string;
  channel_type: string;
  merchant_id: string;
  customer_id: string;
  status: string;
  last_message_at: number;
  last_message_snippet: string;
  merchant_unread_count: number;
  customer_unread_count: number;
  merchant_pinned: boolean;
  customer_pinned: boolean;
  customer_name?: string;
  customer_code?: string;
  customer_phone?: string;
  merchant_name?: string;
  merchant_logo?: string;
  merchant_logo_url?: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_type: 'merchant' | 'customer' | 'system' | 'ai_assistant' | 'akai';
  sender_id: string;
  msg_type: string;
  content: string;
  media_url?: string;
  metadata?: any;
  status: string;
  created_at: number;
}

function getActiveToken(): string | null {
  return auth.customerToken() || auth.merchantToken();
}

export const chatService = {
  async startThread(merchantId: string, customerId: string): Promise<ChatThread> {
    const token = getActiveToken();
    const res = await apiRequest<{ ok: boolean; thread: ChatThread }>('/api/chat/threads/start', {
      method: 'POST',
      body: { merchantId, customerId },
      token: token || undefined,
    });
    return res.thread;
  },

  async getMerchantThreads(): Promise<ChatThread[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ ok: boolean; threads: ChatThread[] }>('/api/chat/threads/merchant', { token });
      return res.threads || [];
    } catch {
      return [];
    }
  },

  async getCustomerThreads(customerId: string): Promise<ChatThread[]> {
    const token = auth.customerToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ ok: boolean; threads: ChatThread[] }>(`/api/chat/threads/customer/${customerId}`, { token });
      return res.threads || [];
    } catch {
      return [];
    }
  },

  async getMessages(threadId: string): Promise<ChatMessage[]> {
    const token = getActiveToken();
    try {
      const res = await apiRequest<{ ok: boolean; messages: ChatMessage[] }>(`/api/chat/threads/${threadId}/messages`, {
        token: token || undefined,
      });
      return res.messages || [];
    } catch {
      return [];
    }
  },

  async startThreadByCode(code: string): Promise<{ thread: ChatThread; type: 'customer' | 'merchant' }> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Merchant session required');
    const res = await apiRequest<{ ok: boolean; thread: ChatThread; type: 'customer' | 'merchant' }>('/api/chat/threads/start-by-code', {
      method: 'POST',
      body: { code },
      token,
    });
    return res;
  },

  async sendMessage(params: {
    threadId: string;
    senderType: 'merchant' | 'customer';
    senderId: string;
    content: string;
    msgType?: string;
    mediaUrl?: string;
    metadata?: any;
  }): Promise<ChatMessage> {
    const token = params.senderType === 'merchant' ? (auth.merchantToken() || getActiveToken()) : (auth.customerToken() || getActiveToken());
    const res = await apiRequest<{ ok: boolean; message: ChatMessage }>('/api/chat/send', {
      method: 'POST',
      body: params,
      token: token || undefined,
    });
    return res.message;
  },

  async markRead(threadId: string, readerType: 'merchant' | 'customer'): Promise<void> {
    const token = getActiveToken();
    try {
      await apiRequest(`/api/chat/threads/${threadId}/read`, {
        method: 'POST',
        body: { readerType },
        token: token || undefined,
      });
    } catch {
      // ignore
    }
  },

  subscribeToThread(threadId: string, onMessage: (msg: ChatMessage) => void): WebSocket | null {
    try {
      const envBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
      const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');
      const wsBase = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      const token = getActiveToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${wsBase}/api/chat/ws/${threadId}${query}`;

      const ws = new WebSocket(wsUrl);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'new_message' && data.message) {
            onMessage(data.message);
          }
        } catch {
          // ignore
        }
      };
      return ws;
    } catch {
      return null;
    }
  },
};
