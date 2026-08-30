import { useState, useEffect, useRef } from 'react';
import { Search, ShieldCheck, Loader2, CheckCircle2, User, X } from 'lucide-react';
import { merchantService } from '../lib/services';

interface CustomerSearchBarProps {
  onSelectCustomer: (customer: {
    customerCode: string;
    name: string;
    phone: string;
    email?: string;
    gstin?: string;
    billingAddress?: string;
    companyName?: string;
    state?: string;
  }) => void;
  className?: string;
  compact?: boolean;
}

// How long to wait after the user stops typing before firing the search.
// Also cuts down on redundant API calls for every keystroke.
const SEARCH_DEBOUNCE_MS = 400;

export default function CustomerSearchBar({ onSelectCustomer, className = '', compact = false }: CustomerSearchBarProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [result, setResult] = useState<{
    customerCode: string;
    name: string;
    phoneMasked: string;
    state: string;
  } | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce timer for the current keystroke burst.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically increasing id for each search actually fired. Used so
  // that if an earlier (e.g. partial-number) request resolves *after* a
  // later, more complete one, its stale result is ignored instead of
  // overwriting the correct one — this was causing "no customer found"
  // to flash in and replace a valid result on the first search attempt.
  const searchIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up any pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = async (clean: string) => {
    const myId = ++searchIdRef.current;
    setSearching(true);
    setOpen(true);

    try {
      const res = await merchantService.searchCustomer(clean);
      // A newer search has started since this one was fired — drop this
      // (now stale) result instead of letting it clobber the latest state.
      if (myId !== searchIdRef.current) return;
      if (res.found && res.customer) {
        setResult(res.customer);
      } else {
        setResult(null);
      }
    } catch {
      if (myId !== searchIdRef.current) return;
      setResult(null);
    } finally {
      if (myId === searchIdRef.current) setSearching(false);
    }
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    setErr('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const clean = val.trim();
    if (!clean || clean.length < 1) {
      // Bump the id so any in-flight request for a previous, longer query
      // can no longer apply its result once it resolves.
      searchIdRef.current++;
      setResult(null);
      setSearching(false);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(clean);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = async () => {
    if (!result) return;
    setSelecting(true);
    setErr('');

    try {
      const res = await merchantService.selectCustomer(result.customerCode);
      if (res.ok && res.customer) {
        onSelectCustomer(res.customer);
        setOpen(false);
        setQuery('');
      } else {
        setErr('Could not load customer details.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error fetching customer profile.');
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 rounded-xl bg-[#0c1322] border border-cyan-500/30 focus-within:border-cyan-400 transition shadow-lg ${compact ? 'max-w-xs' : 'w-full'}`}>
        <Search size={16} className="text-cyan-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search Customer (AKC ID / Mobile)"
          aria-label="Search customer by AKC ID or mobile number"
          className="w-full bg-transparent text-xs sm:text-sm text-[var(--color-ivory)] outline-none placeholder:text-[var(--color-mist-2)]"
        />
        {query && (
          <button
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              searchIdRef.current++;
              setQuery('');
              setOpen(false);
              setResult(null);
              setSearching(false);
            }}
            aria-label="Clear search"
            className="w-9 h-9 -mx-1.5 shrink-0 grid place-items-center rounded-full text-[var(--color-mist-2)] hover:text-white"
          >
            <X size={14} />
          </button>
        )}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold shrink-0 border border-emerald-500/30 select-none">
          <ShieldCheck size={12} /> KYC Verified
        </div>
      </div>

      {/* Results Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 depth-card rounded-2xl p-4 border border-cyan-400/40 shadow-2xl z-50 overflow-hidden bg-[#0c1322]">
          {searching ? (
            <div className="py-6 text-center text-xs text-[var(--color-mist)] flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-cyan-400" /> Searching AKC Directory…
            </div>
          ) : result ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    <User size={14} className="text-cyan-400" /> {result.name}
                  </div>
                  <div className="text-xs font-mono text-cyan-300 mt-0.5">
                    {result.customerCode}
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
                  {result.state || 'India'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-[var(--color-mist)] flex items-center justify-between">
                <span>Mobile (Masked):</span>
                <span className="font-mono text-white font-semibold">{result.phoneMasked}</span>
              </div>

              {err && <p className="text-[11px] text-[var(--color-rose)]">{err}</p>}

              <button
                onClick={handleSelect}
                disabled={selecting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white depth-raised disabled:opacity-60 transition"
                style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)' }}
              >
                {selecting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Unmasking Profile…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Use This Customer
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[var(--color-mist)]">
              No matching customer found for <strong className="text-white">"{query}"</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
