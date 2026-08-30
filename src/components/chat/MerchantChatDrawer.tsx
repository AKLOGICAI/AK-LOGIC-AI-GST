import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  X,
  User,
  Loader2,
  Receipt,
  Store,
  Sparkles,
  Search,
  PlusCircle,
  AlertCircle,
  Phone,
  ChevronLeft,
  Bot,
  TrendingUp,
  Package,
  Clock,
  CheckCheck,
  Mic,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { chatService, type ChatMessage, type ChatThread } from '../../lib/chatService';
import { useInvoices, useRequests, useMerchantSession } from '../../lib/store';
import AkaiActionCard from './AkaiActionCard';

interface MerchantChatDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelectCustomerForInvoice?: (customerCode: string) => void;
}

export default function MerchantChatDrawer({
  open,
  onClose,
  onSelectCustomerForInvoice,
}: MerchantChatDrawerProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'merchant'>('all');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Sarvam AI Voice & Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceMic = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      setIsRecording(true);
      setText('@akai Aaj ka total collection aur pending bills batao');
      setTimeout(() => setIsRecording(false), 900);
    }
  };

  const handlePlayAudio = async (msgId: string, content: string) => {
    if (playingMsgId === msgId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingMsgId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    setAudioLoading(msgId);
    try {
      const res = await fetch('/api/sarvam/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, languageCode: 'hi-IN', speaker: 'meera' }),
      });
      const data = await res.json();
      if (data && data.audioBase64) {
        setPlayingMsgId(msgId);
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setPlayingMsgId(null);
          currentAudioRef.current = null;
        };
        audio.play();
      }
    } catch {
      // fallback
    } finally {
      setAudioLoading(null);
    }
  };

  // Quick Start Chat Search State
  const [searchCode, setSearchCode] = useState('');
  const [searchingCode, setSearchingCode] = useState(false);
  const [searchError, setSearchError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const invoices = useInvoices();
  const requests = useRequests();
  const merchantSession = useMerchantSession();

  // Extract recent customer contacts from invoices & billing requests for 1-tap quick chat start
  const recentCustomerContacts = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; code?: string }>();

    for (const inv of invoices) {
      const phone = inv.customerPhone?.trim();
      const name = inv.customerName?.trim();
      if (phone && !map.has(phone)) {
        map.set(phone, { name: name || 'Customer', phone });
      }
    }

    for (const req of requests) {
      const phone = req.customerPhone?.trim();
      const name = req.customerName?.trim();
      if (phone && !map.has(phone)) {
        map.set(phone, { name: name || 'Customer', phone });
      }
    }

    return Array.from(map.values()).slice(0, 6);
  }, [invoices, requests]);

  // Load threads
  const loadThreads = async () => {
    setLoading(true);
    try {
      const res = await chatService.getMerchantThreads();
      setThreads(res);
      // On desktop, auto-select first thread if available. On mobile, stay on thread list.
      if (window.innerWidth >= 768 && res.length > 0 && !activeThread) {
        setActiveThread(res[0]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadThreads();
    }
  }, [open]);

  // Load active thread messages
  useEffect(() => {
    if (!activeThread) return;

    const fetchMsgs = async () => {
      try {
        const msgs = await chatService.getMessages(activeThread.id);
        setMessages(msgs);
        await chatService.markRead(activeThread.id, 'merchant');
        setThreads((prev) =>
          prev.map((t) => (t.id === activeThread.id ? { ...t, merchant_unread_count: 0 } : t))
        );
      } catch {
        // ignore
      }
    };

    fetchMsgs();

    const socket = chatService.subscribeToThread(activeThread.id, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      chatService.markRead(activeThread.id, 'merchant').catch(() => {});
    });

    return () => {
      if (socket && typeof socket.close === 'function') {
        socket.close();
      }
    };
  }, [activeThread]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !activeThread || sending) return;
    const sendText = text.trim();
    setText('');
    setSending(true);

    try {
      await chatService.sendMessage({
        threadId: activeThread.id,
        senderType: 'merchant',
        senderId: activeThread.merchant_id || merchantSession || 'merchant',
        content: sendText,
      });
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleStartChatByCode = async (explicitCode?: string) => {
    const target = (explicitCode || searchCode).trim();
    if (!target) return;

    setSearchingCode(true);
    setSearchError('');

    try {
      const res = await chatService.startThreadByCode(target);
      if (res && res.thread) {
        const thread = res.thread;
        setThreads((prev) => {
          const exists = prev.some((t) => t.id === thread.id);
          return exists ? prev : [thread, ...prev];
        });
        setActiveThread(thread);
        setSearchCode('');
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Chat partner not found with this code or phone number.');
    } finally {
      setSearchingCode(false);
    }
  };

  const filteredThreads = threads.filter((t) => {
    if (activeTab === 'customer') {
      return !t.customer_code?.startsWith('MERCHANT-') && !t.channel_type?.includes('b2b');
    }
    if (activeTab === 'merchant') {
      return t.customer_code?.startsWith('MERCHANT-') || t.channel_type?.includes('b2b');
    }
    return true;
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end sm:p-4 md:p-6 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full h-full sm:w-[680px] md:w-[820px] sm:h-[88vh] sm:max-h-[780px] bg-[#080d1a] sm:border sm:border-white/15 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100"
          >
            {/* Top Navigation Bar */}
            <div className="px-4 py-3.5 bg-[#0e1628] border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {/* On mobile, if inside an active thread, show Back button to thread list */}
                {activeThread && (
                  <button
                    onClick={() => setActiveThread(null)}
                    className="md:hidden p-2 -ml-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-400 active:scale-95 transition flex items-center gap-1 cursor-pointer"
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft size={22} />
                  </button>
                )}

                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600/30 to-blue-600/20 text-cyan-400 grid place-items-center border border-cyan-500/30 shadow-inner">
                  {activeThread ? (
                    activeThread.channel_type?.includes('b2b') || activeThread.customer_code?.startsWith('MERCHANT-') ? (
                      <Store size={20} className="text-emerald-400" />
                    ) : (
                      <User size={20} className="text-cyan-400" />
                    )
                  ) : (
                    <Bot size={22} className="text-cyan-400" />
                  )}
                </div>

                <div>
                  <h2 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                    {activeThread ? (
                      <span className="truncate max-w-[190px] sm:max-w-xs">
                        {activeThread.customer_name || 'Customer Conversation'}
                      </span>
                    ) : (
                      <>
                        Merchant Workspace <Sparkles size={15} className="text-amber-400 animate-pulse" />
                      </>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                    {activeThread ? (
                      <span className="font-mono text-cyan-300">
                        {activeThread.customer_code || 'Direct Customer'} {activeThread.customer_phone ? `· ${activeThread.customer_phone}` : ''}
                      </span>
                    ) : (
                      <span>Direct Customer, B2B & @AKAI AI Copilot</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeThread && onSelectCustomerForInvoice && activeThread.customer_code && (
                  <button
                    onClick={() => {
                      onSelectCustomerForInvoice(activeThread.customer_code!);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-md hover:scale-105 active:scale-95 transition cursor-pointer"
                  >
                    <Receipt size={14} /> Auto-fill Bill
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 transition cursor-pointer"
                  aria-label="Close Chat"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Split Master-Detail Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* LEFT: Conversation List View (Hidden on mobile when activeThread is open) */}
              <div
                className={`${
                  activeThread ? 'hidden md:flex' : 'flex'
                } w-full md:w-[320px] lg:w-[340px] flex-col border-r border-white/10 bg-[#090f20] shrink-0 overflow-hidden`}
              >
                {/* Search / Start Chat Header */}
                <div className="p-3.5 space-y-3 bg-[#0c1426] border-b border-white/10">
                  <div className="flex items-center gap-2 bg-[#060a14] border border-white/15 focus-within:border-cyan-400 rounded-2xl px-3 py-2.5 transition">
                    <Search size={16} className="text-cyan-400 shrink-0" />
                    <input
                      type="text"
                      value={searchCode}
                      onChange={(e) => {
                        setSearchCode(e.target.value);
                        setSearchError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleStartChatByCode()}
                      placeholder="Phone, Customer ID (AKC-...), or Merchant..."
                      className="bg-transparent text-xs sm:text-sm text-white outline-none w-full placeholder:text-slate-500"
                    />
                    <button
                      onClick={() => handleStartChatByCode()}
                      disabled={!searchCode.trim() || searchingCode}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition disabled:opacity-40 flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                    >
                      {searchingCode ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                      <span>Start</span>
                    </button>
                  </div>

                  {searchError && (
                    <div className="text-xs text-rose-400 font-medium px-1 flex items-center gap-1.5 bg-rose-950/40 p-2 rounded-xl border border-rose-500/30">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{searchError}</span>
                    </div>
                  )}

                  {/* 1-Tap Quick Contacts Chips */}
                  {recentCustomerContacts.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                        Recent Billing Contacts:
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        {recentCustomerContacts.map((c) => (
                          <button
                            key={c.phone}
                            onClick={() => handleStartChatByCode(c.phone)}
                            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 text-cyan-300 text-xs font-medium shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Phone size={11} className="text-cyan-400" />
                            <span className="font-semibold">{c.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({c.phone.slice(-4)})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabs: All / Customers / B2B */}
                  <div className="flex items-center gap-1.5 p-1 bg-[#060a14] rounded-2xl border border-white/10">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        activeTab === 'all'
                          ? 'bg-white/15 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({threads.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('customer')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        activeTab === 'customer'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <User size={13} /> Customers
                    </button>
                    <button
                      onClick={() => setActiveTab('merchant')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        activeTab === 'merchant'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Store size={13} /> B2B
                    </button>
                  </div>
                </div>

                {/* Conversation Threads Scroll List */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {loading ? (
                    <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                      <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
                      <p className="font-medium">Loading conversations…</p>
                    </div>
                  ) : filteredThreads.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 px-4 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 grid place-items-center mx-auto text-slate-500">
                        <Clock size={24} />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-white text-sm">
                          {activeTab === 'merchant' ? 'No B2B Partner Chats' : 'No Active Customer Chats'}
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Enter a customer phone number or ID above to start chatting and sending instant invoices.
                        </p>
                      </div>
                    </div>
                  ) : (
                    filteredThreads.map((th) => {
                      const isSelected = activeThread?.id === th.id;
                      const isPartner = th.customer_code?.startsWith('MERCHANT-') || th.channel_type?.includes('b2b');
                      const displayName = th.customer_name || (isPartner ? 'B2B Partner Merchant' : 'Customer');
                      const displayCode = th.customer_code || (th.customer_phone ? th.customer_phone : 'AKC-Vault');

                      return (
                        <button
                          key={th.id}
                          onClick={() => setActiveThread(th)}
                          className={`w-full text-left p-3.5 rounded-2xl transition flex items-start gap-3 border cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-cyan-950/60 to-blue-950/40 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20'
                              : 'bg-[#0c1426]/60 border-white/5 hover:border-white/15 hover:bg-white/5'
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 border ${
                              isPartner
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                            }`}
                          >
                            {isPartner ? <Store size={18} /> : <User size={18} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="font-bold text-sm text-white truncate">{displayName}</h4>
                              {th.merchant_unread_count > 0 && (
                                <span className="bg-cyan-400 text-slate-950 font-extrabold text-[11px] px-2 py-0.5 rounded-full shrink-0 animate-pulse shadow-xs">
                                  {th.merchant_unread_count}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                              <span className="font-mono text-cyan-300/90 text-[11px] truncate">
                                {displayCode}
                              </span>
                              {th.last_message_at && (
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  {new Date(th.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-300/80 truncate mt-1 font-normal">
                              {th.last_message_snippet || 'Tap to open conversation…'}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT: Chat Thread & Messages Area */}
              {activeThread ? (
                <div className="flex-1 flex flex-col h-full bg-[#070c18] overflow-hidden">
                  {/* Chat Mobile Subheader Info */}
                  <div className="px-4 py-2.5 bg-[#0b1222] border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-slate-300 font-medium">
                        Connected to <strong className="text-white">{activeThread.customer_name || 'Customer'}</strong>
                      </span>
                    </div>

                    <div className="text-xs font-mono text-cyan-400">
                      {activeThread.customer_phone || activeThread.customer_code || ''}
                    </div>
                  </div>

                  {/* Messages Bubble Container */}
                  <div className="flex-1 p-3.5 sm:p-5 overflow-y-auto space-y-3.5 bg-[#050811]">
                    {messages.length === 0 ? (
                      <div className="py-16 text-center text-slate-400 space-y-3 max-w-sm mx-auto">
                        <div className="w-14 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 grid place-items-center mx-auto shadow-inner">
                          <MessageSquare size={28} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-bold text-white text-base">Conversation Ready</h3>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Type a regular message to chat, or mention <strong className="text-cyan-300">@akai</strong> to create draft invoices, check stock, or review sales.
                          </p>
                        </div>
                      </div>
                    ) : (
                      messages.map((m) => {
                        const isMe = m.sender_type === 'merchant';
                        const isAi = m.sender_type === 'ai_assistant' || m.sender_type === 'akai' || !!m.metadata?.is_ai;
                        const actionCard = m.metadata?.action_card;
                        const confirmationToken = m.metadata?.confirmation_token;

                        return (
                          <div
                            key={m.id || Math.random().toString()}
                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[90%] sm:max-w-[80%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                                isMe
                                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-xs'
                                  : isAi
                                  ? 'bg-gradient-to-br from-indigo-950/95 to-purple-950/90 text-purple-100 border border-purple-500/40 rounded-bl-xs'
                                  : 'bg-[#10182c] text-slate-100 border border-white/10 rounded-bl-xs'
                              }`}
                            >
                              {isAi && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1.5 border-b border-purple-500/30 pb-1.5">
                                  <Sparkles size={14} className="text-amber-400" />
                                  <span>@AKAI Business Operating Copilot</span>
                                </div>
                              )}

                              <p className="break-words whitespace-pre-wrap text-sm select-text">{m.content}</p>

                              {/* Sarvam AI Listen Voice Audio Button */}
                              {isAi && (
                                <button
                                  type="button"
                                  onClick={() => handlePlayAudio(m.id, m.content)}
                                  className="mt-2.5 flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-medium border border-purple-400/30 transition cursor-pointer active:scale-95 shadow-sm"
                                >
                                  {audioLoading === m.id ? (
                                    <Loader2 size={12} className="animate-spin text-purple-300" />
                                  ) : (
                                    <Volume2 size={13} className={playingMsgId === m.id ? 'text-amber-400 animate-pulse' : 'text-purple-300'} />
                                  )}
                                  <span>{playingMsgId === m.id ? 'Playing…' : '🔊 Listen (सुनिए)'}</span>
                                </button>
                              )}

                              {/* Interactive Action Preview Card with Confirmation */}
                              {actionCard && (
                                <AkaiActionCard
                                  cardData={actionCard}
                                  confirmationToken={confirmationToken}
                                  onActionSuccess={() => {
                                    // Action executed cleanly
                                  }}
                                />
                              )}

                              <div
                                className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 font-mono ${
                                  isMe ? 'text-cyan-200/80' : 'text-slate-400'
                                }`}
                              >
                                <span>{new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {isMe && <CheckCheck size={13} className="text-cyan-300" />}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Mention Autocomplete Suggestion Pill */}
                  {(text.endsWith('@') || text.endsWith('@a') || text.endsWith('@ak') || text.endsWith('@aka')) && (
                    <div className="px-4 py-2 bg-[#0d1424] border-t border-cyan-500/30 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = text.replace(/@[a-zA-Z]*$/, '');
                          setText(`${prefix}@akai `);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-bold hover:bg-cyan-500/30 transition cursor-pointer shadow-sm"
                      >
                        <Sparkles size={14} className="text-amber-300" />
                        <span>@akai (Business AI Copilot)</span>
                      </button>
                      <span className="text-xs text-slate-400 hidden sm:inline">Tap to autocomplete</span>
                    </div>
                  )}

                  {/* Quick suggestion prompt chips */}
                  {!text && (
                    <div className="px-3 py-2 bg-[#090f1f] border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
                      <span className="text-xs font-bold text-amber-300 shrink-0 flex items-center gap-1">
                        <Sparkles size={12} /> AI Shortcuts:
                      </span>
                      <button
                        type="button"
                        onClick={() => setText('@akai Aaj ki sale kitni hui?')}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <TrendingUp size={13} className="text-cyan-400" /> Today's Sales
                      </button>
                      <button
                        type="button"
                        onClick={() => setText('@akai Low stock check karo')}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Package size={13} className="text-amber-400" /> Low Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => setText('@akai Rahul ko 2 cement 350 ka bill bana do')}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Receipt size={13} className="text-emerald-400" /> Create Invoice
                      </button>
                    </div>
                  )}

                  {/* Bottom Input Area */}
                  <div className="p-3 sm:p-4 bg-[#0b1222] border-t border-white/10 flex items-center gap-2 shrink-0">
                    <div className="flex-1 bg-[#060a14] border border-white/15 focus-within:border-cyan-400 rounded-2xl px-3.5 py-2.5 transition flex items-center gap-2">
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type message or ask @akai in Hindi/English..."
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                      />
                    </div>

                    {/* Voice Mic Button */}
                    <button
                      type="button"
                      onClick={handleVoiceMic}
                      title="Voice speech-to-text / Voice Billing"
                      className={`h-11 w-11 rounded-2xl flex items-center justify-center transition shrink-0 cursor-pointer active:scale-95 border ${
                        isRecording
                          ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                          : 'bg-white/10 text-cyan-300 hover:bg-white/15 border-white/10'
                      }`}
                    >
                      <Mic size={18} />
                    </button>

                    <button
                      onClick={handleSend}
                      disabled={!text.trim() || sending}
                      className="h-11 px-5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 shrink-0 cursor-pointer active:scale-95 transition"
                      style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-400 p-8 text-center space-y-4 bg-[#070c18]">
                  <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 text-cyan-400 grid place-items-center border border-cyan-500/20 shadow-inner">
                    <Bot size={32} />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="font-bold text-white text-base">Select or Start a Conversation</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Choose a customer or B2B merchant from the list on the left, or use the search bar to start a new chat with @AKAI.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
