import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, ShieldCheck, Store, Loader2, Sparkles } from 'lucide-react';
import { chatService, type ChatMessage, type ChatThread } from '../../lib/chatService';

interface CustomerChatWidgetProps {
  merchantId: string;
  merchantName: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
}

export default function CustomerChatWidget({
  merchantId,
  merchantName,
  customerId,
  customerCode,
  customerName,
  open,
  onClose,
}: CustomerChatWidgetProps) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !merchantId || !customerId) return;

    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    async function initChat() {
      setLoading(true);
      try {
        const th = await chatService.startThread(merchantId, customerId);
        setThread(th);
        const msgs = await chatService.getMessages(th.id);
        setMessages(msgs);
        await chatService.markRead(th.id, 'customer');

        // WebSocket subscription for instant push
        ws = chatService.subscribeToThread(th.id, (newMsg) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        });

        // Polling fallback to guarantee messages always update
        pollInterval = setInterval(async () => {
          try {
            const fresh = await chatService.getMessages(th.id);
            if (fresh && fresh.length > 0) {
              setMessages((prev) => {
                if (fresh.length !== prev.length || fresh[fresh.length - 1]?.id !== prev[prev.length - 1]?.id) {
                  return fresh;
                }
                return prev;
              });
            }
          } catch {
            // ignore
          }
        }, 2500);
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }

    initChat();

    return () => {
      if (ws) ws.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [open, merchantId, customerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !thread || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      thread_id: thread.id,
      sender_type: 'customer',
      sender_id: customerId,
      msg_type: 'text',
      content,
      status: 'sent',
      created_at: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const serverMsg = await chatService.sendMessage({
        threadId: thread.id,
        senderType: 'customer',
        senderId: customerId,
        content,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? serverMsg : m))
      );
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          className="fixed right-3 bottom-3 sm:right-6 sm:bottom-6 z-50 w-[calc(100%-24px)] sm:w-84 rounded-3xl bg-[#070b14] border border-cyan-500/40 shadow-2xl overflow-hidden flex flex-col h-[440px] max-h-[72vh]"
        >
          {/* Smart Header */}
          <div className="px-3.5 py-2.5 bg-[#080d1a] border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 grid place-items-center font-bold shrink-0 border border-cyan-500/30">
                <Store size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-white truncate leading-snug">
                  {merchantName}
                </div>
                <div className="text-[9px] text-cyan-300 font-mono flex items-center gap-1 truncate mt-0.2">
                  <ShieldCheck size={10} className="text-emerald-400 shrink-0" /> Direct Chat · {customerCode}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-[var(--color-mist)] hover:text-white p-1 rounded-xl hover:bg-white/5 transition">
              <X size={16} />
            </button>
          </div>

          {/* Messages Scroll View */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-[#070b14]">
            {loading ? (
              <div className="h-full grid place-items-center text-[11px] text-[var(--color-mist)]">
                <div className="flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin text-cyan-400" /> Connecting to merchant…
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-5 text-[var(--color-mist)] space-y-1.5">
                <MessageSquare size={28} className="text-cyan-400/40 mb-1 animate-pulse" />
                <p className="text-xs font-bold text-white">Ask anything about prices or products</p>
                <p className="text-[10px] text-[var(--color-mist-2)]">Your AKC ID is attached. Negotiated rates can be billed directly.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_type === 'customer';
                const isAi = m.sender_type === 'ai_assistant';
                return (
                  <div key={m.id || Math.random().toString()} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                        isMe
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none shadow-xs'
                          : isAi
                          ? 'bg-purple-950/80 text-purple-200 border border-purple-500/40 rounded-bl-none shadow-xs'
                          : 'bg-slate-800 text-[var(--color-ivory)] border border-white/10 rounded-bl-none'
                      }`}
                    >
                      {isAi && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-amber-300 mb-1">
                          <Sparkles size={10} /> @akai Assistant
                        </div>
                      )}
                      <p className="break-words whitespace-pre-wrap">{m.content}</p>
                      <div className={`text-[8px] mt-0.5 text-right font-mono ${isMe ? 'text-cyan-200/80' : 'text-[var(--color-mist-2)]'}`}>
                        {new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-2.5 bg-[#080d1a] border-t border-white/10 flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask for custom price or invoice..."
              className="flex-1 bg-[#070b14] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="px-3 py-1.5 rounded-xl font-bold text-xs text-slate-950 flex items-center gap-1 shadow-xs disabled:opacity-40 shrink-0"
              style={{ background: 'linear-gradient(135deg,#6ff2dc,#38e0c8)' }}
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
