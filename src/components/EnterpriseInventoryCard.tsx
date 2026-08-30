import { motion } from 'framer-motion';
import {
  Package,
  TrendingUp,
  Award,
  Edit3,
  Trash2,
  Trophy,
  Sparkles,
} from 'lucide-react';
import { computeProductLiveMetrics } from '../lib/inventoryService';

import type { Invoice } from '../lib/types';

export interface InventoryItemData {
  id: string;
  name: string;
  description: string;
  hsn: string;
  gstRate: number;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
}

interface EnterpriseInventoryCardProps {
  item: InventoryItemData;
  merchantId: string;
  invoices?: Invoice[];
  onEdit: (item: InventoryItemData) => void;
  onDelete: (id: string) => void;
}

/**
 * Speedometer-style Stock Health Gauge Meter
 */
function SpeedometerGauge({ quantity }: { quantity: number }) {
  const maxStockRef = 100;
  const percentage = Math.min(Math.max(quantity / maxStockRef, 0), 1);
  const needleAngle = -90 + percentage * 180;

  return (
    <div className="relative flex flex-col items-center shrink-0 scale-90">
      {/* Top Quantity Badge */}
      <div className="mb-0.5 px-2 py-0.5 rounded-md bg-emerald-500/90 text-white font-extrabold text-[10px] shadow-sm tracking-wide">
        {quantity}
      </div>

      {/* Speedometer SVG */}
      <div className="relative w-18 h-9 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path
            d="M 10 50 A 40 40 0 0 1 21.7 21.7"
            fill="none"
            stroke="#ef4444"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 21.7 21.7 A 40 40 0 0 1 50 10"
            fill="none"
            stroke="#f97316"
            strokeWidth="10"
          />
          <path
            d="M 50 10 A 40 40 0 0 1 78.3 21.7"
            fill="none"
            stroke="#eab308"
            strokeWidth="10"
          />
          <path
            d="M 78.3 21.7 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#22c55e"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </svg>

        {/* Speedometer Needle */}
        <div
          className="absolute bottom-0 left-1/2 w-1 h-7 bg-white origin-bottom transition-transform duration-700 ease-out -ml-0.5 rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]"
          style={{
            transform: `rotate(${needleAngle}deg)`,
          }}
        />
        <div className="absolute bottom-0 left-1/2 -ml-1.5 -mb-1.5 w-3 h-3 rounded-full bg-white border-2 border-slate-900 shadow-md" />
      </div>
    </div>
  );
}

export function EnterpriseInventoryCard({ item, merchantId, invoices, onEdit, onDelete }: EnterpriseInventoryCardProps) {
  const qty = Number(item.stockQuantity) || 0;

  // Compute live sales metrics from actual invoice history (no fake/hardcoded data)
  const metrics = computeProductLiveMetrics(merchantId, item.name, item.hsn, item.unit, qty, invoices);

  // Determine stock alert status
  const getAlertBadge = () => {
    if (qty === 0) {
      return {
        label: '⚫ OUT OF STOCK',
        bg: 'bg-slate-900/80 text-slate-300 border-slate-700',
      };
    }
    if (qty <= 9) {
      return {
        label: `🔴 REORDER SOON (${qty})`,
        bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    }
    if (qty <= 39) {
      return {
        label: `🟠 STOCK LOW (${qty})`,
        bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      };
    }
    return {
      label: `IN STOCK (${qty})`,
      bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    };
  };

  const alert = getAlertBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative rounded-[24px] p-4 sm:p-5 bg-gradient-to-br from-[#1e40af] via-[#0284c7] to-[#0f172a] text-white border border-cyan-400/30 shadow-lg shadow-cyan-950/40 hover:shadow-xl hover:shadow-cyan-500/20 hover:-translate-y-1 transition-all duration-300 group overflow-hidden flex flex-col justify-between"
    >
      {/* Background Glow Orb */}
      <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-cyan-400/20 blur-3xl pointer-events-none group-hover:bg-cyan-300/30 transition duration-500" />

      <div>
        {/* 1. TOP HEADER */}
        <div className="flex items-start justify-between gap-2.5 mb-3.5">
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white drop-shadow-sm line-clamp-1">
              {item.name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-medium text-cyan-200 bg-white/10 px-2 py-0.5 rounded border border-white/15">
                HSN: {item.hsn}
              </span>
              <span className="text-[11px] font-semibold text-white bg-blue-600/80 px-2 py-0.5 rounded border border-blue-400/40">
                GST {item.gstRate}%
              </span>
            </div>
          </div>

          {/* Speedometer Stock Gauge */}
          <SpeedometerGauge quantity={qty} />
        </div>

        {/* 2. MIDDLE SECTION: Information Panel */}
        <div className="rounded-xl bg-white/10 backdrop-blur-md border border-white/20 p-3 mb-3.5 shadow-inner grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/80 mb-0.5">
              SELLING PRICE
            </div>
            <div className="text-xl sm:text-2xl font-black text-cyan-300 drop-shadow">
              ₹{item.sellingPrice.toLocaleString('en-IN')}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/80 mb-0.5">
              STOCK
            </div>
            <div className="text-xl sm:text-2xl font-black text-white drop-shadow flex items-baseline gap-1">
              {qty}{' '}
              <span className="text-xs font-semibold text-cyan-200/90 font-normal">
                {item.unit || 'pcs'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. SMART INSIGHTS & METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch mb-3">
          {/* Left Metrics */}
          <div className="md:col-span-6 flex flex-col justify-between space-y-2">
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${alert.bg}`}
              >
                {alert.label}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center pt-1">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 grid place-items-center mb-0.5">
                  <Package size={14} />
                </div>
                <div className="text-[9px] text-cyan-200/70 uppercase">Total Sold</div>
                <div className="text-xs font-bold text-white">{metrics.totalSoldThisWeekDisplay}</div>
              </div>

              <div className="flex flex-col items-center border-x border-white/10 px-0.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center mb-0.5">
                  <TrendingUp size={14} />
                </div>
                <div className="text-[9px] text-cyan-200/70 uppercase">This Week</div>
                <div className="text-xs font-bold text-emerald-300">{metrics.growthDisplay}</div>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 grid place-items-center mb-0.5">
                  <Award size={14} />
                </div>
                <div className="text-[9px] text-cyan-200/70 uppercase">Top Selling</div>
                <div className="text-xs font-bold text-amber-300">
                  {metrics.isTopSelling ? 'Yes' : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Right AI Insight Card (Matching Reference Image) */}
          <div className="md:col-span-6 rounded-xl bg-gradient-to-br from-blue-900/60 to-slate-900/80 border border-yellow-400/30 p-3 relative overflow-hidden flex items-start gap-2.5 shadow-md">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-400 grid place-items-center shrink-0 border border-yellow-400/30">
              <Trophy size={18} />
            </div>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-300 flex items-center gap-1">
                {metrics.insightTitle}
              </div>
              <p className="text-[11px] text-slate-200 mt-0.5 leading-snug">
                {metrics.insightDescription}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM ACTION BAR */}
      <div className="pt-3 mt-1 border-t border-white/15 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-200 bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer active:scale-95"
          >
            <Edit3 size={13} /> Edit Product
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded-lg text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-500/30 border border-rose-500/20 transition cursor-pointer active:scale-95"
            title="Delete Product"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-cyan-200/80">
            Health: {metrics.healthPercentDisplay}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
