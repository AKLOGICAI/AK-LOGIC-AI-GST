import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Share2, Inbox, Clock, Send, CheckCircle2, MessageSquare, Check, X,
  MapPin, Truck, Star, History, ShieldAlert, Image as ImageIcon, Filter,
  AlertTriangle, Search, RefreshCw, Zap, Plus, Building2, ChevronRight,
  Sparkles, Radio, ArrowRight, ShieldCheck, Tag
} from 'lucide-react';
import type { Merchant } from '../../lib/types';
import { merchantNetworkService, merchantService } from '../../lib/services';

interface NetworkReqData {
  request: {
    id: string;
    requester_merchant_id: string;
    product_name: string;
    quantity: number;
    unit: string;
    urgency: 'normal' | 'urgent';
    status: string;
    city?: string;
    pincode?: string;
    state?: string;
    origin: string;
    created_at: number;
  };
  shopName: string;
  distanceKm?: number;
  kyc: string;
}

interface NetworkOrderData {
  order: {
    id: string;
    request_id: string;
    buyer_merchant_id: string;
    seller_merchant_id: string;
    delivery_mode: string;
    delivery_provider_code?: string;
    delivery_provider_ref?: string;
    buyer_confirmed_at?: number;
    seller_confirmed_at?: number;
    cancellation_reason?: string;
    status: string;
    created_at: number;
  };
  partnerShopName: string;
  productName: string;
}

interface NetworkMessage {
  id: string;
  order_id: string;
  sender_merchant_id: string;
  body: string;
  image_url?: string;
  created_at: number;
}

interface HistoryRequest {
  id: string;
  requester_merchant_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  urgency: 'normal' | 'urgent';
  status: string;
  city?: string;
  pincode?: string;
  state?: string;
  origin: string;
  created_at: number;
}

interface HydratedRequest {
  request: HistoryRequest;
  responses: {
    response: {
      id: string;
      request_id: string;
      responder_merchant_id: string;
      availability: 'available' | 'not_available';
      created_at: number;
    };
    shopName: string;
    kyc: string;
  }[];
}

export default function MerchantNetworkPageWrapper({ merchant }: { merchant: Merchant }) {
  const [acceptedLocally, setAcceptedLocally] = useState(false);

  if (!merchant.networkTermsAccepted && !acceptedLocally) {
    return (
      <div className="max-w-2xl mx-auto mt-8 depth-card rounded-2xl p-8 border border-[var(--color-line)] shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[rgba(56,224,200,0.12)] border border-[rgba(56,224,200,0.3)] grid place-items-center text-[var(--color-aqua)]">
            <Share2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-ivory)]">B2B Merchant Network — Terms of Use</h2>
            <p className="text-xs text-[var(--color-mist)]">Zero-commission local merchant stock exchange</p>
          </div>
        </div>
        <div className="space-y-3.5 text-xs text-[var(--color-mist)] leading-relaxed bg-[#0a0f1d]/60 p-5 rounded-xl border border-[var(--color-line)]">
          <p className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-[var(--color-aqua)] shrink-0 mt-0.5" />
            <span><strong>Wholesale & B2B Trading Only:</strong> Direct peer-to-peer merchant stock exchange.</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-[var(--color-aqua)] shrink-0 mt-0.5" />
            <span><strong>Zero Commission:</strong> Connect directly with local verified merchants without intermediary fee.</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-[var(--color-aqua)] shrink-0 mt-0.5" />
            <span><strong>Independent Verification:</strong> Check counterparty GSTIN and order details before fund transfer.</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-[var(--color-aqua)] shrink-0 mt-0.5" />
            <span><strong>Fair Play:</strong> Spamming or abusive behavior will permanently revoke network access.</span>
          </p>
        </div>
        <div className="mt-6 pt-5 border-t border-[var(--color-line)] flex justify-end">
          <button
            onClick={async () => {
              try {
                await merchantService.update(merchant.id, {
                  networkTermsAccepted: true,
                  networkTermsAcceptedAt: Date.now(),
                  networkTermsVersion: '1.0'
                });
                setAcceptedLocally(true);
              } catch (e) {
                console.error("Failed to accept network terms:", e);
                toast.error("Failed to accept terms. Please try again.");
              }
            }}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] text-[var(--color-ink)] hover:scale-105 transition cursor-pointer shadow-lg shadow-[rgba(56,224,200,0.2)]"
          >
            Accept & Enter Network →
          </button>
        </div>
      </div>
    );
  }

  return <MerchantNetworkPage merchant={merchant} />;
}

const networkCache = {
  getNearby(mid: string): NetworkReqData[] | null {
    if (!mid) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_net_nearby_${mid}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  saveNearby(mid: string, data: NetworkReqData[]) {
    if (!mid) return;
    try {
      localStorage.setItem(`ak_cache_net_nearby_${mid}`, JSON.stringify(data));
    } catch {}
  },
  getHistory(mid: string): { requests: HydratedRequest[]; orders: NetworkOrderData[] } | null {
    if (!mid) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_net_history_${mid}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  saveHistory(mid: string, data: { requests: HydratedRequest[]; orders: NetworkOrderData[] }) {
    if (!mid) return;
    try {
      localStorage.setItem(`ak_cache_net_history_${mid}`, JSON.stringify(data));
    } catch {}
  }
};

function MerchantNetworkPage({ merchant }: { merchant: Merchant }) {
  const [activeTab, setActiveTab] = useState<'post' | 'nearby' | 'orders' | 'history'>(() => {
    return (sessionStorage.getItem('merchantNetworkTab') as 'post' | 'nearby' | 'orders' | 'history') || 'nearby';
  });

  useEffect(() => {
    sessionStorage.setItem('merchantNetworkTab', activeTab);
  }, [activeTab]);
  
  const cachedNearby = useMemo(() => networkCache.getNearby(merchant.id), [merchant.id]);
  const cachedHistory = useMemo(() => networkCache.getHistory(merchant.id), [merchant.id]);

  // States for Requests
  const [nearbyRequests, setNearbyRequests] = useState<NetworkReqData[]>(() => cachedNearby || []);
  const [loadingNearby, setLoadingNearby] = useState(!cachedNearby);
  const [searchQuery, setSearchQuery] = useState('');
  const [newRequest, setNewRequest] = useState({ product_name: '', quantity: 1, unit: 'pcs', urgency: 'normal' as 'normal' | 'urgent' });
  const [postingReq, setPostingReq] = useState(false);
  const [reqSuccess, setReqSuccess] = useState<string | null>(null);

  // States for Orders
  const [activeOrders, setActiveOrders] = useState<NetworkOrderData[]>(() => {
    return cachedHistory?.orders?.filter((o: NetworkOrderData) => o.order.status !== 'completed' && o.order.status !== 'cancelled') || [];
  });
  const [myBroadcasts, setMyBroadcasts] = useState<HydratedRequest[]>(() => {
    return cachedHistory?.requests?.filter((r: HydratedRequest) => r.request.status === 'open' || r.request.status === 'responded') || [];
  });
  const [loadingOrders, setLoadingOrders] = useState(!cachedHistory);
  const [selectedOrder, setSelectedOrder] = useState<NetworkOrderData | null>(null);

  // States for Chat
  const [messages, setMessages] = useState<NetworkMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  // History states
  const [historyRequests, setHistoryRequests] = useState<HistoryRequest[]>(() => {
    return cachedHistory?.requests?.map((r: HydratedRequest) => r.request) || [];
  });
  const [historyOrders, setHistoryOrders] = useState<NetworkOrderData[]>(() => {
    return cachedHistory?.orders?.filter((o: NetworkOrderData) => o.order.status === 'completed' || o.order.status === 'cancelled') || [];
  });
  const [loadingHistory, setLoadingHistory] = useState(!cachedHistory);

  // Radius filter state
  const [radiusFilter, setRadiusFilter] = useState<'all' | '5' | '10' | '25'>('all');

  // Modals
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [cancelReasonSelect, setCancelReasonSelect] = useState<string>('Price mismatch');

  const [disputeModalOrderId, setDisputeModalOrderId] = useState<string | null>(null);
  const [disputeReasonSelect, setDisputeReasonSelect] = useState<string>('no_response');
  const [disputeDetailsText, setDisputeDetailsText] = useState<string>('');

  const [reviewModalOrderId, setReviewModalOrderId] = useState<string | null>(null);
  const [starRatingVal, setStarRatingVal] = useState<number>(5);
  const [reviewCommentText, setReviewCommentText] = useState<string>('');

  const [chatImageUrl, setChatImageUrl] = useState<string>('');
  const [showImageInput, setShowImageInput] = useState<boolean>(false);

  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ product_name: '', quantity: 1, unit: 'pcs', urgency: 'normal' });

  const startEditingRequest = (b: HydratedRequest) => {
    setEditingRequestId(b.request.id);
    setEditForm({
      product_name: b.request.product_name,
      quantity: b.request.quantity,
      unit: b.request.unit,
      urgency: b.request.urgency
    });
  };

  const submitEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequestId) return;
    try {
      const success = await merchantNetworkService.updateRequest(editingRequestId, editForm);
      if (success) {
        toast.success("Request updated successfully!");
        setEditingRequestId(null);
        fetchHistory(true);
        fetchActiveOrders(true);
      }
    } catch (err: unknown) {
      toast.error('Failed to edit request.');
    }
  };

  const fetchNearbyRequests = async (isManual = false) => {
    if (!nearbyRequests.length || isManual) setLoadingNearby(true);
    try {
      const data = await merchantNetworkService.getNearbyRequests();
      setNearbyRequests(data);
      networkCache.saveNearby(merchant.id, data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingNearby(false);
    }
  };

  const fetchActiveOrders = async (isManual = false) => {
    if ((!activeOrders.length && !myBroadcasts.length) || isManual) setLoadingOrders(true);
    try {
      const data = await merchantNetworkService.getHistory();
      const active = data.orders.filter(
        (o: NetworkOrderData) => o.order.status !== 'completed' && o.order.status !== 'cancelled'
      );
      setActiveOrders(active);
      const broadcasts = data.requests.filter(
        (r: HydratedRequest) => r.request.status === 'open' || r.request.status === 'responded'
      );
      setMyBroadcasts(broadcasts);
      networkCache.saveHistory(merchant.id, data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchChatMessages = async (orderId: string) => {
    try {
      const data = await merchantNetworkService.getMessages(orderId);
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async (isManual = false) => {
    if ((!historyOrders.length && !historyRequests.length) || isManual) setLoadingHistory(true);
    try {
      const data = await merchantNetworkService.getHistory();
      setHistoryOrders(data.orders.filter((o: NetworkOrderData) => o.order.status === 'completed' || o.order.status === 'cancelled'));
      setHistoryRequests(data.requests.map((r: HydratedRequest) => r.request));
      networkCache.saveHistory(merchant.id, data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      const success = await merchantNetworkService.cancelRequest(requestId);
      if (success) {
        toast.success('Request cancelled successfully.');
        fetchHistory();
        fetchActiveOrders();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to cancel request.');
    }
  };

  const submitCancelOrderWithReason = async () => {
    if (!cancelModalOrderId) return;
    try {
      const success = await merchantNetworkService.cancelOrder(cancelModalOrderId, cancelReasonSelect);
      if (success) {
        toast.success('B2B Deal cancelled successfully.');
        setCancelModalOrderId(null);
        setSelectedOrder(null);
        fetchActiveOrders();
        fetchHistory();
      }
    } catch (err: unknown) {
      toast.error('Failed to cancel order.');
    }
  };

  const submitDisputeReport = async () => {
    if (!disputeModalOrderId) return;
    try {
      const success = await merchantNetworkService.reportDispute(disputeModalOrderId, disputeReasonSelect, disputeDetailsText);
      if (success) {
        toast.success('Dispute reported to administrators. Support team will review.');
        setDisputeModalOrderId(null);
        setDisputeDetailsText('');
      }
    } catch (err: unknown) {
      toast.error('Failed to report dispute.');
    }
  };

  const submitRatingReview = async () => {
    if (!reviewModalOrderId) return;
    try {
      const success = await merchantNetworkService.submitReview(reviewModalOrderId, starRatingVal, reviewCommentText);
      if (success) {
        toast.success('Thank you! Your rating and trust feedback has been recorded.');
        setReviewModalOrderId(null);
        setReviewCommentText('');
      }
    } catch (err: unknown) {
      toast.error('Failed to submit review.');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'nearby') fetchNearbyRequests();
      if (activeTab === 'orders') fetchActiveOrders();
      if (activeTab === 'history') fetchHistory();
    }, 0);

    const interval = setInterval(() => {
      if (activeTab === 'nearby') fetchNearbyRequests();
      if (activeTab === 'orders') fetchActiveOrders();
    }, 10000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [activeTab]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!selectedOrder) return;
    const timer = setTimeout(() => {
      fetchChatMessages(selectedOrder.order.id);
    }, 0);

    const chatInterval = setInterval(() => {
      fetchChatMessages(selectedOrder.order.id);
    }, 5000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(chatInterval);
    };
  }, [selectedOrder]);

  const handlePostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.product_name) return;
    setPostingReq(true);
    setReqSuccess(null);
    try {
      await merchantNetworkService.createRequest(
        newRequest.product_name,
        newRequest.quantity,
        newRequest.unit,
        newRequest.urgency
      );
      setReqSuccess('Your request has been broadcasted to verified merchants nearby!');
      setNewRequest({ product_name: '', quantity: 1, unit: 'pcs', urgency: 'normal' });
      fetchNearbyRequests();
      fetchActiveOrders();
      setTimeout(() => setActiveTab('orders'), 1200);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to post request.');
    } finally {
      setPostingReq(false);
    }
  };

  const handleRespond = async (requestId: string, availability: 'available' | 'not_available') => {
    try {
      await merchantNetworkService.respondToRequest(requestId, availability);
      toast.success(availability === 'available' ? 'Stock availability reported to merchant!' : 'Availability marked as not available.');
      fetchNearbyRequests();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to respond to request.');
    }
  };

  const handleAcceptResponse = async (requestId: string, responderId: string) => {
    try {
      const res = await merchantNetworkService.acceptResponse(requestId, responderId);
      setActiveTab('orders');
      
      const data = await merchantNetworkService.getHistory();
      const active = data.orders.filter(
        (o: NetworkOrderData) => o.order.status !== 'completed' && o.order.status !== 'cancelled'
      );
      setActiveOrders(active);
      const broadcasts = data.requests.filter(
        (r: HydratedRequest) => r.request.status === 'open' || r.request.status === 'responded'
      );
      setMyBroadcasts(broadcasts);

      const newOrderId = res?.order?.id || res?.order_id;
      if (newOrderId) {
        const matchedOrder = active.find((o: NetworkOrderData) => o.order.id === newOrderId);
        if (matchedOrder) {
          setSelectedOrder(matchedOrder);
        } else if (res?.order) {
          setSelectedOrder({
            order: res.order,
            partnerShopName: res.responder_shop_name || 'Partner Merchant',
            productName: res.product_name || 'B2B Item',
          });
        }
      } else if (active.length > 0) {
        setSelectedOrder(active[0]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to accept response.');
    }
  };

  const handleDismissResponse = async (responseId: string) => {
    try {
      const success = await merchantNetworkService.dismissResponse(responseId);
      if (success) {
        fetchHistory();
        fetchActiveOrders();
      }
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || (!newMessageText.trim() && !chatImageUrl.trim())) return;
    setSendingMsg(true);
    try {
      if (chatImageUrl.trim()) {
        await merchantNetworkService.sendMessageWithImage(selectedOrder.order.id, newMessageText.trim() || 'Attached image', chatImageUrl.trim());
      } else {
        await merchantNetworkService.sendMessage(selectedOrder.order.id, newMessageText);
      }
      setNewMessageText('');
      setChatImageUrl('');
      setShowImageInput(false);
      fetchChatMessages(selectedOrder.order.id);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to send message.');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    try {
      await merchantNetworkService.confirmOrder(orderId);
      toast.success('You have confirmed this order! Awaiting partner confirmation to finalize.');
      fetchActiveOrders();
      if (selectedOrder) {
        fetchChatMessages(selectedOrder.order.id);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || 'Failed to confirm order.');
    }
  };

  // Filtered requests by radius & search term
  const filteredNearbyRequests = useMemo(() => {
    return nearbyRequests.filter((r) => {
      // Radius filter
      if (radiusFilter !== 'all') {
        const maxDist = parseFloat(radiusFilter);
        if (r.distanceKm !== undefined && r.distanceKm > maxDist) return false;
      }
      // Text search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = (r.request.product_name || '').toLowerCase();
        const sName = (r.shopName || '').toLowerCase();
        const cCity = (r.request.city || '').toLowerCase();
        if (!pName.includes(q) && !sName.includes(q) && !cCity.includes(q)) return false;
      }
      return true;
    });
  }, [nearbyRequests, radiusFilter, searchQuery]);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-16">
      
      {/* 1. TOP PULSE & LOCATION HERO BAR */}
      <div className="depth-card rounded-2xl p-4 sm:p-6 border border-[var(--color-line)] relative overflow-hidden bg-gradient-to-br from-[#0c1427]/90 via-[#0a0f1d] to-[#070b16]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[rgba(56,224,200,0.12)] via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[rgba(56,224,200,0.12)] border border-[rgba(56,224,200,0.25)] text-[var(--color-aqua)]">
                <span className="w-2 h-2 rounded-full bg-[var(--color-aqua)] animate-pulse" />
                Live B2B Network
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-mist)] bg-white/5 px-2.5 py-1 rounded-full border border-[var(--color-line)]">
                <MapPin size={11} className="text-[var(--color-gold)]" />
                {merchant.city || 'Local Hub'}{merchant.pincode ? ` (${merchant.pincode})` : ''}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-emerald)] font-semibold bg-[rgba(16,185,129,0.1)] px-2 py-0.5 rounded-md">
                <ShieldCheck size={11} /> Zero Commission
              </span>
            </div>

            <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-extrabold text-[var(--color-ivory)] flex items-center gap-2.5">
              <Share2 className="text-[var(--color-aqua)]" size={26} />
              Merchant B2B Network
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-mist)] mt-1 max-w-xl">
              Broadcast stock requirements, fulfill nearby demands & trade directly with verified GST merchants.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab !== 'post' && (
              <button
                onClick={() => setActiveTab('post')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] hover:scale-105 active:scale-95 transition flex items-center justify-center gap-2 shadow-lg shadow-[rgba(56,224,200,0.2)] cursor-pointer"
              >
                <Plus size={16} /> Broadcast Stock Need
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. SEGMENTED PILL TAB NAVIGATION */}
      <div className="p-1.5 rounded-2xl bg-[#0a0f1d] border border-[var(--color-line)] flex gap-1.5 overflow-x-auto no-scrollbar shadow-inner">
        <button
          onClick={() => setActiveTab('nearby')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer relative ${
            activeTab === 'nearby'
              ? 'bg-gradient-to-r from-[rgba(56,224,200,0.2)] to-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.4)] text-[var(--color-aqua)] shadow-md'
              : 'text-[var(--color-mist)] hover:text-white hover:bg-white/5'
          }`}
        >
          <Radio size={14} className={activeTab === 'nearby' ? 'text-[var(--color-aqua)] animate-pulse' : ''} />
          <span>Nearby Demands</span>
          {nearbyRequests.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'nearby' ? 'bg-[var(--color-aqua)] text-[var(--color-ink)]' : 'bg-white/10 text-white'}`}>
              {nearbyRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('post')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer relative ${
            activeTab === 'post'
              ? 'bg-gradient-to-r from-[rgba(56,224,200,0.2)] to-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.4)] text-[var(--color-aqua)] shadow-md'
              : 'text-[var(--color-mist)] hover:text-white hover:bg-white/5'
          }`}
        >
          <Plus size={14} />
          <span>Post a Request</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer relative ${
            activeTab === 'orders'
              ? 'bg-gradient-to-r from-[rgba(56,224,200,0.2)] to-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.4)] text-[var(--color-aqua)] shadow-md'
              : 'text-[var(--color-mist)] hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare size={14} />
          <span>Active Deals</span>
          {(activeOrders.length > 0 || myBroadcasts.length > 0) && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-[var(--color-rose)] text-white animate-pulse">
              {activeOrders.length + myBroadcasts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('history'); fetchHistory(); }}
          className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer relative ${
            activeTab === 'history'
              ? 'bg-gradient-to-r from-[rgba(56,224,200,0.2)] to-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.4)] text-[var(--color-aqua)] shadow-md'
              : 'text-[var(--color-mist)] hover:text-white hover:bg-white/5'
          }`}
        >
          <History size={14} />
          <span>Deal History</span>
        </button>
      </div>

      {/* 3. TAB PANELS */}
      <AnimatePresence mode="wait">
        
        {/* ============================================================ */}
        {/* TAB 1: NEARBY REQUESTS / OPEN STOCK DEMANDS                   */}
        {/* ============================================================ */}
        {activeTab === 'nearby' && (
          <motion.div
            key="nearby-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a0f1d] p-3 rounded-2xl border border-[var(--color-line)]">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mist-2)]" />
                <input
                  type="text"
                  placeholder="Search item (Cement, LED, Cable, Oil...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/5 border border-[var(--color-line)] rounded-xl text-xs sm:text-sm text-[var(--color-ivory)] placeholder-[var(--color-mist-2)] outline-none focus:border-[var(--color-aqua)] transition"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-mist-2)] hover:text-white">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Radius Select & Refresh */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-mist)] bg-white/5 px-3 py-2 rounded-xl border border-[var(--color-line)]">
                  <Filter size={13} className="text-[var(--color-aqua)]" />
                  <span className="hidden sm:inline">Radius:</span>
                  <select
                    value={radiusFilter}
                    onChange={e => setRadiusFilter(e.target.value as any)}
                    className="bg-transparent text-white font-semibold text-xs outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-[#0c1322] text-white">All Distances</option>
                    <option value="5" className="bg-[#0c1322] text-white">Within 5 km</option>
                    <option value="10" className="bg-[#0c1322] text-white">Within 10 km</option>
                    <option value="25" className="bg-[#0c1322] text-white">Within 25 km</option>
                  </select>
                </div>

                <button
                  onClick={() => fetchNearbyRequests(true)}
                  disabled={loadingNearby}
                  className="p-2.5 rounded-xl bg-white/5 border border-[var(--color-line)] text-[var(--color-aqua)] hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                  title="Refresh nearby demands"
                >
                  <RefreshCw size={13} className={loadingNearby ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Content List */}
            {loadingNearby ? (
              <div className="text-center py-16 depth-card rounded-2xl border border-[var(--color-line)]">
                <div className="w-12 h-12 rounded-full bg-[rgba(56,224,200,0.1)] mx-auto grid place-items-center mb-3">
                  <Clock className="text-[var(--color-aqua)] animate-spin" size={22} />
                </div>
                <h4 className="font-bold text-sm text-[var(--color-ivory)]">Scanning Open Demands Nearby...</h4>
                <p className="text-xs text-[var(--color-mist)] mt-1">Connecting to local verified merchant broadcast nodes</p>
              </div>
            ) : filteredNearbyRequests.length === 0 ? (
              /* MODERN INTERACTIVE EMPTY STATE */
              <div className="depth-card rounded-2xl p-8 sm:p-12 text-center border border-[var(--color-line)] relative overflow-hidden bg-gradient-to-b from-[#0a0f1d] to-[#060a14]">
                <div className="w-20 h-20 rounded-3xl bg-[rgba(56,224,200,0.06)] border border-[rgba(56,224,200,0.2)] mx-auto grid place-items-center mb-4 relative shadow-lg shadow-[rgba(56,224,200,0.05)]">
                  <Inbox size={36} className="text-[var(--color-aqua)]" />
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-aqua)] animate-ping" />
                </div>

                <h3 className="font-bold text-base sm:text-lg text-[var(--color-ivory)]">
                  No open stock demands in your selected range
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-mist)] max-w-md mx-auto mt-1.5 mb-6">
                  {radiusFilter !== 'all'
                    ? `No requests found within ${radiusFilter} km. Expand your radius or post your own stock requirement.`
                    : `Demands from verified merchants in ${merchant.city || 'your area'} will show up here automatically.`}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  {radiusFilter !== 'all' && (
                    <button
                      onClick={() => setRadiusFilter('all')}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-[var(--color-line)] transition cursor-pointer"
                    >
                      🌐 Expand Radius to All Distances
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('post')}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] hover:scale-105 transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[rgba(56,224,200,0.2)]"
                  >
                    <Plus size={15} /> Broadcast a Stock Need First
                  </button>
                </div>
              </div>
            ) : (
              /* DEMAND CARDS GRID */
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNearbyRequests.map((r) => (
                  <motion.div
                    key={r.request.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="depth-card rounded-2xl p-4 sm:p-5 border border-[var(--color-line)] hover:border-[rgba(56,224,200,0.3)] transition-all duration-200 flex flex-col justify-between group relative overflow-hidden bg-gradient-to-br from-[#0c1322] to-[#080d19]"
                  >
                    <div>
                      {/* Card Header Pills */}
                      <div className="flex justify-between items-center gap-2 mb-3">
                        <span
                          className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                            r.request.urgency === 'urgent'
                              ? 'bg-[rgba(255,107,136,0.15)] text-[var(--color-rose)] border border-[rgba(255,107,136,0.3)] animate-pulse'
                              : 'bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)] border border-[rgba(56,224,200,0.2)]'
                          }`}
                        >
                          {r.request.urgency === 'urgent' ? '🚨 URGENT DEMAND' : '🟢 REGULAR NEED'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[rgba(56,224,200,0.1)] text-[var(--color-aqua)]">
                            KYC {r.kyc}
                          </span>
                          {r.distanceKm !== undefined && (
                            <span className="text-[10px] text-[var(--color-mist)] flex items-center gap-0.5 bg-white/5 px-2 py-0.5 rounded">
                              <MapPin size={9} className="text-[var(--color-gold)]" />
                              {r.distanceKm.toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Product & Qty */}
                      <h4 className="font-extrabold text-base sm:text-lg text-[var(--color-ivory)] group-hover:text-[var(--color-aqua)] transition-colors leading-snug">
                        {r.request.product_name}
                      </h4>

                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[rgba(255,184,0,0.12)] text-[var(--color-gold)] font-extrabold text-xs">
                          <Tag size={11} /> Qty: {r.request.quantity} {r.request.unit}
                        </span>
                        <span className="text-[11px] text-[var(--color-mist-2)]">
                          {r.request.city || 'Nearby Area'}
                        </span>
                      </div>

                      {/* Merchant Shop info */}
                      <div className="mt-4 pt-3 border-t border-[var(--color-line)] flex items-center justify-between text-xs text-[var(--color-mist)]">
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[10px] font-bold text-[var(--color-aqua)] shrink-0">
                            {r.shopName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-[var(--color-ivory)] truncate">{r.shopName}</span>
                        </div>
                        <span className="text-[10px] text-[var(--color-mist-2)] shrink-0">
                          {new Date(r.request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 flex gap-2">
                      <button
                        onClick={() => handleRespond(r.request.id, 'available')}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] hover:scale-105 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-[rgba(56,224,200,0.15)]"
                      >
                        <Zap size={13} /> I Have Stock
                      </button>
                      <button
                        onClick={() => handleRespond(r.request.id, 'not_available')}
                        className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-line)] text-[var(--color-mist-2)] hover:text-white hover:bg-white/5 transition cursor-pointer"
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: POST A STOCK REQUEST / BROADCAST FORM                 */}
        {/* ============================================================ */}
        {activeTab === 'post' && (
          <motion.div
            key="post-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-2xl mx-auto"
          >
            <div className="depth-card rounded-2xl p-5 sm:p-7 border border-[var(--color-line)] shadow-xl space-y-6 bg-gradient-to-br from-[#0c1427] to-[#070b16]">
              <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-line)]">
                <div className="w-10 h-10 rounded-xl bg-[rgba(56,224,200,0.12)] border border-[rgba(56,224,200,0.3)] grid place-items-center text-[var(--color-aqua)] shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-ivory)]">Broadcast Stock Demand</h3>
                  <p className="text-xs text-[var(--color-mist)]">Notify verified merchants in {merchant.city || 'your area'} instantly with zero commission.</p>
                </div>
              </div>

              {reqSuccess && (
                <div className="p-4 rounded-xl bg-[rgba(56,224,200,0.1)] border border-[rgba(56,224,200,0.3)] text-sm text-[var(--color-aqua)] flex items-start gap-3 animate-fadeIn">
                  <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="font-bold">Broadcasted Successfully!</span>
                    <p className="text-xs text-[var(--color-mist)] mt-0.5">{reqSuccess}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePostRequest} className="space-y-4">
                {/* Product Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Product / Item Name *</label>
                  <input
                    type="text"
                    required
                    value={newRequest.product_name}
                    onChange={e => setNewRequest(prev => ({ ...prev, product_name: e.target.value }))}
                    placeholder="e.g. UltraTech Cement 50kg, Havells 2.5mm Wire, Tata Salt 1kg"
                    className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[var(--color-line)] text-sm text-[var(--color-ivory)] placeholder-[var(--color-mist-2)] outline-none focus:border-[var(--color-aqua)] transition"
                  />
                </div>

                {/* Quantity & Unit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Quantity Required *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={newRequest.quantity}
                      onChange={e => setNewRequest(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[var(--color-line)] text-sm text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)] transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Unit Type</label>
                    <select
                      value={newRequest.unit}
                      onChange={e => setNewRequest(prev => ({ ...prev, unit: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[var(--color-line)] text-sm text-[var(--color-ivory)] outline-none focus:border-[var(--color-aqua)] transition cursor-pointer"
                    >
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="box">Boxes (box)</option>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="pkt">Packets (pkt)</option>
                      <option value="bags">Bags / Kattas</option>
                      <option value="litres">Litres</option>
                    </select>
                  </div>
                </div>

                {/* Urgency Selector Card Radio */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-[var(--color-mist)] uppercase tracking-wider">Delivery Urgency</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      onClick={() => setNewRequest(prev => ({ ...prev, urgency: 'normal' }))}
                      className={`p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition ${
                        newRequest.urgency === 'normal'
                          ? 'bg-[rgba(56,224,200,0.1)] border-[var(--color-aqua)] text-[var(--color-aqua)]'
                          : 'bg-[#080d1a] border-[var(--color-line)] text-[var(--color-mist)] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">🟢 Normal Fulfill</span>
                        <input
                          type="radio"
                          name="urgency"
                          checked={newRequest.urgency === 'normal'}
                          onChange={() => {}}
                          className="accent-[var(--color-aqua)]"
                        />
                      </div>
                      <span className="text-[10px] text-[var(--color-mist-2)]">Standard 24-48 hrs fulfillment</span>
                    </label>

                    <label
                      onClick={() => setNewRequest(prev => ({ ...prev, urgency: 'urgent' }))}
                      className={`p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition ${
                        newRequest.urgency === 'urgent'
                          ? 'bg-[rgba(255,107,136,0.15)] border-[var(--color-rose)] text-[var(--color-rose)]'
                          : 'bg-[#080d1a] border-[var(--color-line)] text-[var(--color-mist)] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">🚨 Urgent Need</span>
                        <input
                          type="radio"
                          name="urgency"
                          checked={newRequest.urgency === 'urgent'}
                          onChange={() => {}}
                          className="accent-[var(--color-rose)]"
                        />
                      </div>
                      <span className="text-[10px] text-[var(--color-mist-2)]">Immediate stock requirement</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={postingReq}
                  className="w-full py-3.5 rounded-xl font-extrabold text-sm text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer shadow-lg shadow-[rgba(56,224,200,0.25)] flex items-center justify-center gap-2 mt-4"
                >
                  {postingReq ? (
                    <>
                      <Clock size={16} className="animate-spin" /> Broadcasting to B2B Network...
                    </>
                  ) : (
                    <>
                      <Share2 size={16} /> Broadcast Demand to Verified Merchants
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: ACTIVE DEALS & B2B NEGOTIATION CHAT                   */}
        {/* ============================================================ */}
        {activeTab === 'orders' && (
          <motion.div
            key="orders-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid lg:grid-cols-3 gap-5 items-start"
          >
            {/* Orders and Broadcasts list (Left 1 Col) */}
            <div className="lg:col-span-1 space-y-5">
              
              {/* My B2B Broadcasts */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-mist-2)] flex items-center gap-1.5">
                    <Share2 size={13} className="text-[var(--color-aqua)]" /> My Active Broadcasts ({myBroadcasts.length})
                  </h3>
                </div>

                {myBroadcasts.length === 0 ? (
                  <div className="depth-card rounded-2xl p-4 text-center text-xs text-[var(--color-mist-2)] border border-dashed border-[var(--color-line)]">
                    No active stock demands posted.
                  </div>
                ) : (
                  myBroadcasts.map((b) => (
                    <div
                      key={b.request.id}
                      className="depth-card rounded-2xl p-4 border border-[var(--color-line)] space-y-3 hover:border-[rgba(56,224,200,0.3)] transition bg-[#0c1322]"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-mono text-[var(--color-mist-2)]">#{b.request.id.slice(4, 10).toUpperCase()}</span>
                          <h4 className="font-bold text-sm text-[var(--color-ivory)] mt-0.5">{b.request.product_name}</h4>
                          <p className="text-xs text-[var(--color-gold)] font-semibold mt-0.5">Qty: {b.request.quantity} {b.request.unit}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(b.request.status === 'open' || b.request.status === 'pending') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelRequest(b.request.id); }}
                              className="text-[9px] font-bold px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)] uppercase">
                            {b.request.status}
                          </span>
                        </div>
                      </div>

                      {/* Responses List */}
                      {b.responses && b.responses.length > 0 && (
                        <div className="space-y-1.5 pt-2.5 border-t border-[var(--color-line)]">
                          <div className="text-[10px] font-bold uppercase text-[var(--color-mist-2)]">Merchant Quotes ({b.responses.length})</div>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
                            {b.responses.map((rp) => (
                              <div key={rp.response.id} className="rounded-xl p-2.5 flex items-center justify-between border border-[var(--color-line)] bg-white/3">
                                <div className="min-w-0 flex-1 mr-2">
                                  <div className="text-xs font-bold text-[var(--color-ivory)] truncate">{rp.shopName}</div>
                                  <div className="text-[9px] text-[var(--color-aqua)] font-semibold mt-0.5">✓ Ready with stock</div>
                                </div>
                                {rp.response.availability === 'available' && b.request.status !== 'accepted' && (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleDismissResponse(rp.response.id)}
                                      className="px-2 py-1 rounded border border-[var(--color-line)] text-[var(--color-mist-2)] text-[10px] font-semibold hover:bg-white/5 cursor-pointer"
                                    >
                                      Dismiss
                                    </button>
                                    <button
                                      onClick={() => handleAcceptResponse(b.request.id, rp.response.responder_merchant_id)}
                                      className="px-2.5 py-1 rounded bg-[var(--color-aqua)] text-[var(--color-ink)] text-[10px] font-extrabold hover:scale-105 cursor-pointer"
                                    >
                                      Accept Deal
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Active Negotiations */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-mist-2)] flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-[var(--color-aqua)]" /> Active B2B Deals ({activeOrders.length})
                </h3>

                {loadingOrders ? (
                  <div className="text-center p-6 depth-card rounded-2xl border border-[var(--color-line)]">
                    <Clock className="mx-auto text-[var(--color-mist-2)] animate-spin" size={18} />
                  </div>
                ) : activeOrders.length === 0 ? (
                  <div className="depth-card rounded-2xl p-4 text-center text-xs text-[var(--color-mist-2)] border border-dashed border-[var(--color-line)]">
                    No active 1-on-1 merchant deals open.
                  </div>
                ) : (
                  activeOrders.map((o) => (
                    <button
                      key={o.order.id}
                      onClick={() => { setMessages([]); setSelectedOrder(o); }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
                        selectedOrder?.order.id === o.order.id
                          ? 'bg-[rgba(56,224,200,0.1)] border-[var(--color-aqua)] shadow-md'
                          : 'depth-card border-[var(--color-line)] hover:border-white/20 bg-[#0c1322]'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-[var(--color-mist-2)]">#{o.order.id.slice(4, 10).toUpperCase()}</span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)] uppercase">
                          {o.order.status}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm mt-1 truncate text-[var(--color-ivory)]">{o.productName}</h4>
                      <p className="text-xs text-[var(--color-mist)] mt-0.5">Partner: <span className="font-semibold text-white">{o.partnerShopName}</span></p>
                      
                      <div className="mt-2.5 pt-2 border-t border-[var(--color-line)] flex items-center justify-between text-[10px] text-[var(--color-mist-2)]">
                        <span>{new Date(o.order.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 text-[var(--color-aqua)] font-semibold"><MessageSquare size={10} /> Open Chat →</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat & Negotiation Panel (Right 2 Cols) */}
            <div className="lg:col-span-2">
              {selectedOrder ? (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="depth-card rounded-2xl border border-[var(--color-line)] overflow-hidden flex flex-col h-[560px] shadow-2xl bg-[#090e1c]">
                  
                  {/* Panel Header */}
                  <div className="p-4 border-b border-[var(--color-line)] flex justify-between items-center bg-[#0d1424]">
                    <div>
                      <h4 className="font-extrabold text-sm sm:text-base text-[var(--color-ivory)]">{selectedOrder.productName}</h4>
                      <p className="text-xs text-[var(--color-mist)]">Negotiating with: <span className="font-bold text-[var(--color-aqua)]">{selectedOrder.partnerShopName}</span></p>
                    </div>

                    <div className="flex gap-1.5 items-center flex-wrap">
                      {/* Confirm Deal Button */}
                      {selectedOrder.order.buyer_merchant_id === merchant.id && !selectedOrder.order.buyer_confirmed_at ? (
                        <button
                          onClick={() => handleConfirmOrder(selectedOrder.order.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-amber)] hover:scale-105 transition cursor-pointer"
                        >
                          Confirm Deal
                        </button>
                      ) : selectedOrder.order.seller_merchant_id === merchant.id && !selectedOrder.order.seller_confirmed_at ? (
                        <button
                          onClick={() => handleConfirmOrder(selectedOrder.order.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-amber)] hover:scale-105 transition cursor-pointer"
                        >
                          Confirm Deal
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md bg-[rgba(56,224,200,0.12)] text-[var(--color-aqua)] text-[10px] font-bold uppercase flex items-center gap-1">
                          <Check size={11} /> You Confirmed
                        </span>
                      )}

                      {/* Dispute / Report Button */}
                      <button
                        onClick={() => setDisputeModalOrderId(selectedOrder.order.id)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                        title="Report issue"
                      >
                        <ShieldAlert size={13} />
                      </button>

                      {/* Cancel Button */}
                      {selectedOrder.order.status !== 'completed' && selectedOrder.order.status !== 'cancelled' && (
                        <button
                          onClick={() => setCancelModalOrderId(selectedOrder.order.id)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      {/* Rate Deal */}
                      {selectedOrder.order.status === 'completed' && (
                        <button
                          onClick={() => setReviewModalOrderId(selectedOrder.order.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--color-ink)] bg-[var(--color-aqua)] hover:scale-105 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Star size={13} fill="currentColor" /> Rate Deal
                        </button>
                      )}

                      <button onClick={() => { setSelectedOrder(null); setMessages([]); }} className="text-[var(--color-mist-2)] hover:text-white p-1 cursor-pointer">
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Delivery Mode & Info */}
                  <div className="px-4 py-2.5 bg-[#070b14] border-b border-[var(--color-line)] flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <Truck size={13} className="text-[var(--color-aqua)]" />
                      <span className="text-[var(--color-mist)] text-[11px]">Mode:</span>
                      <select className="bg-white/5 border border-[var(--color-line)] rounded px-1.5 py-0.5 text-xs text-[var(--color-ivory)] outline-none" defaultValue="self_pickup">
                        <option value="self_pickup">Self Pickup / Counter Exchange</option>
                        <option value="delivery_partner" disabled>Parcel Dispatch (In Development)</option>
                      </select>
                    </div>
                    <div className="text-[10px] text-[var(--color-mist-2)] font-mono">
                      Ref: #{selectedOrder.order.id.slice(4, 12).toUpperCase()}
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3 bg-[#080d19]">
                    {messages.length === 0 ? (
                      <div className="text-center py-12 text-xs text-[var(--color-mist-2)]">
                        <MessageSquare size={24} className="mx-auto mb-2 opacity-50 text-[var(--color-aqua)]" />
                        <p>Begin your wholesale deal negotiation with {selectedOrder.partnerShopName}.</p>
                      </div>
                    ) : (
                      messages.map((m) => {
                        const isMe = m.sender_merchant_id === merchant.id;
                        const isSystem = m.body.startsWith('System:');
                        return (
                          <div key={m.id} className={`flex ${isSystem ? 'justify-center' : isMe ? 'justify-end' : 'justify-start'}`}>
                            {isSystem ? (
                              <div className="text-[10px] font-semibold bg-[rgba(56,224,200,0.08)] border border-[rgba(56,224,200,0.15)] text-[var(--color-aqua)] px-3 py-1 rounded-full uppercase tracking-wider">
                                {m.body}
                              </div>
                            ) : (
                              <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-xs sm:text-sm ${
                                isMe
                                  ? 'bg-[var(--color-aqua)] text-[var(--color-ink)] font-medium rounded-tr-none shadow-md'
                                  : 'bg-[#10182b] border border-[var(--color-line)] text-[var(--color-ivory)] rounded-tl-none shadow'
                              }`}>
                                {m.image_url && (
                                  <img src={m.image_url} alt="Stock preview" className="rounded-xl max-h-48 w-full object-cover my-1 border border-black/20" />
                                )}
                                <p className="leading-relaxed">{m.body}</p>
                                <span className={`block text-[9px] mt-1 text-right ${isMe ? 'text-[rgba(0,0,0,0.5)]' : 'text-[var(--color-mist-2)]'}`}>
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Input Form with Image Upload */}
                  <div className="border-t border-[var(--color-line)] bg-[#0c1322] p-3 space-y-2">
                    {showImageInput && (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <input
                          type="url"
                          placeholder="Paste image URL (e.g. https://...)"
                          value={chatImageUrl}
                          onChange={(e) => setChatImageUrl(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--color-line)] text-xs text-white outline-none focus:border-[var(--color-aqua)]"
                        />
                        <button type="button" onClick={() => setShowImageInput(false)} className="text-xs text-[var(--color-mist-2)] hover:text-white px-2">Cancel</button>
                      </div>
                    )}
                    <form onSubmit={handleSendChatMessage} className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowImageInput(!showImageInput)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer ${showImageInput ? 'bg-[rgba(56,224,200,0.15)] border-[var(--color-aqua)] text-[var(--color-aqua)]' : 'border-[var(--color-line)] text-[var(--color-mist-2)] hover:text-white'}`}
                        title="Attach Photo"
                      >
                        <ImageIcon size={16} />
                      </button>
                      <input
                        type="text"
                        placeholder="Type price quote or delivery terms..."
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-[var(--color-line)] text-xs sm:text-sm text-white outline-none focus:border-[var(--color-aqua)]"
                      />
                      <button
                        type="submit"
                        disabled={sendingMsg || (!newMessageText.trim() && !chatImageUrl.trim())}
                        className="w-10 h-10 rounded-xl grid place-items-center bg-[var(--color-aqua)] text-[var(--color-ink)] hover:scale-105 active:scale-95 transition disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        <Send size={15} />
                      </button>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <div className="depth-card rounded-2xl border border-[var(--color-line)] p-12 text-center text-[var(--color-mist-2)] flex flex-col justify-center items-center h-[560px] bg-[#090e1c]">
                  <div className="w-16 h-16 rounded-2xl bg-[rgba(56,224,200,0.06)] border border-[rgba(56,224,200,0.2)] grid place-items-center mb-3 text-[var(--color-aqua)]">
                    <MessageSquare size={30} />
                  </div>
                  <h4 className="font-bold text-sm sm:text-base text-[var(--color-ivory)]">Select a B2B Deal to Open Negotiation</h4>
                  <p className="text-xs text-[var(--color-mist)] max-w-sm mt-1">Select an active deal from the left column to discuss pricing, stock availability, and logistics terms directly.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: DEAL HISTORY                                          */}
        {/* ============================================================ */}
        {activeTab === 'history' && (
          <motion.div
            key="history-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {loadingHistory ? (
              <div className="text-center py-16 depth-card rounded-2xl border border-[var(--color-line)]">
                <Clock className="mx-auto text-[var(--color-mist-2)] animate-spin" size={24} />
              </div>
            ) : (
              <>
                {/* Completed Deals */}
                <div className="space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-mist)] flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[var(--color-emerald)]" /> Completed B2B Deals
                  </h3>

                  {historyOrders.length === 0 ? (
                    <div className="depth-card rounded-2xl p-6 text-center text-xs text-[var(--color-mist-2)] border border-[var(--color-line)]">
                      No completed deals yet.
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {historyOrders.map((o) => (
                        <div key={o.order.id} className="depth-card rounded-2xl p-4 sm:p-5 border border-[var(--color-line)] flex items-start gap-3.5 bg-[#0c1322]">
                          <div className="w-10 h-10 rounded-xl grid place-items-center bg-[rgba(16,185,129,0.12)] text-[var(--color-emerald)] shrink-0">
                            <CheckCircle2 size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-mono text-[var(--color-mist-2)]">#{o.order.id.slice(4, 10).toUpperCase()}</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${o.order.status === 'completed' ? 'bg-[rgba(16,185,129,0.15)] text-[var(--color-emerald)]' : 'bg-red-500/10 text-red-400'}`}>
                                {o.order.status}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm mt-1 truncate text-[var(--color-ivory)]">{o.productName}</h4>
                            <p className="text-xs text-[var(--color-mist)] mt-0.5">Partner: <span className="font-semibold text-white">{o.partnerShopName}</span></p>
                            <div className="text-[10px] text-[var(--color-mist-2)] mt-2 flex justify-between items-center border-t border-[var(--color-line)] pt-2">
                              <span>Completed: {new Date(o.order.created_at).toLocaleDateString()}</span>
                              <span>Mode: {o.order.delivery_mode.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Past Broadcasts */}
                <div className="space-y-3 pt-6 border-t border-[var(--color-line)]">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-mist)] flex items-center gap-1.5">
                    <History size={13} className="text-[var(--color-aqua)]" /> My Past Broadcast Requests
                  </h3>

                  {historyRequests.length === 0 ? (
                    <div className="depth-card rounded-2xl p-6 text-center text-xs text-[var(--color-mist-2)] border border-[var(--color-line)]">
                      No broadcast history.
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {historyRequests.map((r) => (
                        <div key={r.id} className="depth-card rounded-2xl p-4 sm:p-5 border border-dashed border-[var(--color-line)] flex items-start gap-3.5 bg-[#0c1322]">
                          <div className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 text-[var(--color-mist-2)] shrink-0">
                            <History size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-mono text-[var(--color-mist-2)]">#{r.id.slice(4, 10).toUpperCase()}</span>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-[var(--color-mist-2)] uppercase">
                                {r.status}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm mt-1 truncate text-[var(--color-ivory)]">{r.product_name}</h4>
                            <p className="text-xs text-[var(--color-mist)] mt-0.5">Quantity: <span className="font-semibold text-white">{r.quantity} {r.unit}</span></p>
                            <div className="text-[10px] text-[var(--color-mist-2)] mt-2">
                              Posted: {new Date(r.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* 4. FLOATING ACTION BUTTON (FAB) FOR MOBILE */}
      {activeTab === 'nearby' && (
        <div className="fixed bottom-6 right-6 sm:hidden z-40">
          <button
            onClick={() => setActiveTab('post')}
            className="h-13 px-4 rounded-full font-bold text-xs text-[var(--color-ink)] bg-gradient-to-r from-[var(--color-aqua)] to-[var(--color-emerald)] shadow-2xl shadow-[rgba(56,224,200,0.5)] flex items-center gap-2 cursor-pointer active:scale-95 transition"
          >
            <Plus size={18} />
            <span>Post Stock Need</span>
          </button>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancelModalOrderId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs grid place-items-center p-4">
          <div className="depth-card rounded-2xl p-6 max-w-sm w-full border border-[var(--color-line)] space-y-4 shadow-2xl bg-[#0c1322]">
            <h4 className="font-bold text-base text-[var(--color-ivory)]">Cancel B2B Deal</h4>
            <p className="text-xs text-[var(--color-mist)]">Select reason for cancellation:</p>
            <select
              value={cancelReasonSelect}
              onChange={(e) => setCancelReasonSelect(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#070b14] border border-[var(--color-line)] text-xs text-white outline-none"
            >
              <option value="Price mismatch">Price mismatch</option>
              <option value="Stock unavailable">Stock unavailable</option>
              <option value="Changed mind">Changed mind</option>
              <option value="Delivery delayed">Delivery delayed</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-2 pt-2">
              <button
                onClick={submitCancelOrderWithReason}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition cursor-pointer"
              >
                Confirm Cancel
              </button>
              <button
                onClick={() => setCancelModalOrderId(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-line)] text-[var(--color-mist)] cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE / REPORT MODAL */}
      {disputeModalOrderId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs grid place-items-center p-4">
          <div className="depth-card rounded-2xl p-6 max-w-sm w-full border border-[var(--color-line)] space-y-4 shadow-2xl bg-[#0c1322]">
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldAlert size={20} />
              <h4 className="font-bold text-base text-[var(--color-ivory)]">Report Deal Dispute</h4>
            </div>
            <p className="text-xs text-[var(--color-mist)]">Our admin team will review this transaction and mediate if required:</p>
            <select
              value={disputeReasonSelect}
              onChange={(e) => setDisputeReasonSelect(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#070b14] border border-[var(--color-line)] text-xs text-white outline-none"
            >
              <option value="no_response">Partner merchant not responding</option>
              <option value="price_dispute">Price dispute / Rate altered</option>
              <option value="goods_damage">Goods quality issue</option>
              <option value="fraud_suspicion">Suspicious behavior / Fraud</option>
              <option value="other">Other issue</option>
            </select>
            <textarea
              placeholder="Additional details (optional)..."
              value={disputeDetailsText}
              onChange={(e) => setDisputeDetailsText(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#070b14] border border-[var(--color-line)] text-xs text-white outline-none h-20 resize-none"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={submitDisputeReport}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black transition cursor-pointer"
              >
                Submit Report
              </button>
              <button
                onClick={() => setDisputeModalOrderId(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-line)] text-[var(--color-mist)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RATING & REVIEW MODAL */}
      {reviewModalOrderId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs grid place-items-center p-4">
          <div className="depth-card rounded-2xl p-6 max-w-sm w-full border border-[var(--color-line)] space-y-4 shadow-2xl bg-[#0c1322] text-center">
            <h4 className="font-bold text-base text-[var(--color-ivory)]">Rate this B2B Deal</h4>
            <p className="text-xs text-[var(--color-mist)]">How was your transaction experience with this merchant?</p>
            
            <div className="flex justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setStarRatingVal(star)}
                  className={`text-2xl transition cursor-pointer hover:scale-125 ${star <= starRatingVal ? 'text-[var(--color-gold)]' : 'text-white/20'}`}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              placeholder="Leave feedback on delivery speed, item quality, communication..."
              value={reviewCommentText}
              onChange={(e) => setReviewCommentText(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#070b14] border border-[var(--color-line)] text-xs text-white outline-none h-20 resize-none text-left"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={submitRatingReview}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-aqua)] text-[var(--color-ink)] hover:scale-105 transition cursor-pointer"
              >
                Submit Rating
              </button>
              <button
                onClick={() => setReviewModalOrderId(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-line)] text-[var(--color-mist)] cursor-pointer"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
