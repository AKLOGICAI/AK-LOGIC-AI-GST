/**
 * akaiAuditStorage.ts — Persistent storage and management for AKAI Audit Reports.
 */

export interface ScoreBreakdown {
  sales: number;        // Max 20
  collections: number;  // Max 15
  inventory: number;    // Max 15
  accounting: number;   // Max 30
  gst: number;          // Max 10
  requests: number;     // Max 10
}

export interface BusinessSummaryMetrics {
  todaySales: number;
  todayCollections: number;
  todayInvoicesCount: number;
  totalInvoicesCount: number;
  pendingRequestsCount: number;
  outstandingReceivables: number;
  totalPurchases: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
  gstOutputTax: number;
  gstInputCredit: number;
}

export interface YesterdayComparison {
  yesterdaySales: number;
  yesterdayCollections: number;
  yesterdayInvoicesCount: number;
  yesterdayPurchases: number;
  salesGrowthPercent: number;
}

export interface AccountingIntegrity {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  statusText: string;
}

export interface DuplicateIntegrity {
  duplicatesFound: number;
  details: string[];
  statusText: string;
}

export interface OfflineSyncAudit {
  pendingOutboxCount: number;
  failedCount: number;
  lastSyncAt: number | null;
  statusText: string;
}

export interface AuditAlert {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  module: string;
}

export interface AkaiAuditReport {
  id: string;
  merchantId: string;
  createdAt: number;
  dateFormatted: string;
  healthScore: number;
  healthGrade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'ATTENTION';
  healthTone: 'emerald' | 'aqua' | 'gold' | 'rose';
  scoreBreakdown: ScoreBreakdown;
  metrics: BusinessSummaryMetrics;
  comparison: YesterdayComparison;
  accounting: AccountingIntegrity;
  duplicates: DuplicateIntegrity;
  offlineSync: OfflineSyncAudit;
  alerts: AuditAlert[];
  recommendations: string[];
  akaiConclusion: string;
}

const STORAGE_KEY_PREFIX = 'aklogic_akai_audits_';

export const akaiAuditStorage = {
  getAudits(merchantId: string): AkaiAuditReport[] {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${merchantId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveAudit(report: AkaiAuditReport): void {
    try {
      const existing = this.getAudits(report.merchantId);
      
      // Smart Deduplication: If latest audit was within last 10 minutes with same health score, replace it
      const latest = existing[0];
      const isRecentDuplicate = latest && (Date.now() - latest.createdAt < 10 * 60 * 1000) && (latest.healthScore === report.healthScore);

      let updated: AkaiAuditReport[];
      if (isRecentDuplicate) {
        // Update the latest report in-place
        updated = [report, ...existing.slice(1)];
      } else {
        // Prepend new report and cap at 30 items
        updated = [report, ...existing.filter((a) => a.id !== report.id)].slice(0, 30);
      }

      localStorage.setItem(`${STORAGE_KEY_PREFIX}${report.merchantId}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('akai-audit-saved', { detail: report }));
    } catch (e) {
      console.error('Error saving AKAI audit report:', e);
    }
  },

  deleteAudit(merchantId: string, auditId: string): void {
    try {
      const existing = this.getAudits(merchantId);
      const updated = existing.filter((a) => a.id !== auditId);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${merchantId}`, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('akai-audit-saved'));
    } catch (e) {
      console.error('Error deleting audit report:', e);
    }
  },

  clearAllAudits(merchantId: string): void {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${merchantId}`);
      window.dispatchEvent(new CustomEvent('akai-audit-saved'));
    } catch (e) {
      console.error('Error clearing audits:', e);
    }
  },

  getLatestAudit(merchantId: string): AkaiAuditReport | null {
    const audits = this.getAudits(merchantId);
    return audits.length > 0 ? audits[0] : null;
  },

  getAuditById(merchantId: string, auditId: string): AkaiAuditReport | null {
    const audits = this.getAudits(merchantId);
    return audits.find((a) => a.id === auditId) || null;
  }
};
