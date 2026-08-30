import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calculator, Plus, Trash2 } from 'lucide-react';

interface TallyItem {
  id: string;
  value: number;
  label: string;
}

interface MiniCalculatorProps {
  open: boolean;
  onClose: () => void;
  onUseAmount: (amount: number) => void;
}

export function MiniCalculator({ open, onClose, onUseAmount }: MiniCalculatorProps) {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [tally, setTally] = useState<TallyItem[]>([]);

  if (!open) return null;

  const handleNum = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleDot = () => {
    if (waitingForNewValue) {
      setDisplay('0.');
      setWaitingForNewValue(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const calculate = (a: number, b: number, op: string) => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  };

  const handleOp = (op: string) => {
    const inputValue = parseFloat(display);
    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (operator) {
      const result = calculate(prevValue, inputValue, operator);
      setDisplay(String(result));
      setPrevValue(result);
    }
    setOperator(op);
    setWaitingForNewValue(true);
  };

  const handleEqual = () => {
    if (operator && prevValue !== null) {
      const inputValue = parseFloat(display);
      const result = calculate(prevValue, inputValue, operator);
      setDisplay(String(result));
      setPrevValue(null);
      setOperator(null);
      setWaitingForNewValue(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForNewValue(false);
  };

  const addToBill = () => {
    const val = parseFloat(display);
    if (isNaN(val) || val === 0) return;
    
    // Label indicates if it was a calculated result or a direct entry
    const isCalculated = prevValue !== null || operator !== null;
    const label = isCalculated ? `Calculated` : `Direct`;

    setTally([...tally, { id: Math.random().toString(36).slice(2), value: val, label }]);
    handleClear();
  };

  const removeTally = (id: string) => {
    setTally(tally.filter(t => t.id !== id));
  };

  const clearAll = () => {
    if (tally.length > 0 && window.confirm('Are you sure you want to clear the entire tally list?')) {
      setTally([]);
      handleClear();
    }
  };

  const grandTotal = tally.reduce((acc, curr) => acc + curr.value, 0);

  const handleUseTotal = () => {
    if (tally.length > 0) {
      onUseAmount(grandTotal);
    } else {
      const val = parseFloat(display);
      onUseAmount(isNaN(val) ? 0 : val);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-[#111111] border border-[var(--color-line)] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-line)]">
            <h3 className="font-bold text-[var(--color-ivory)] flex items-center gap-2">
              <Calculator size={18} className="text-[var(--color-aqua)]" /> Calculator
            </h3>
            <button onClick={onClose} className="text-[var(--color-mist-2)] hover:text-white transition">
              <X size={20} />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            {/* Calculator Display */}
            <div className="bg-[#0c1322] border border-[var(--color-line)] rounded-xl p-3 mb-4 text-right">
              <div className="text-[10px] text-[var(--color-mist-2)] h-4">
                {prevValue !== null && operator ? `${prevValue} ${operator}` : ''}
              </div>
              <div className="text-2xl font-mono text-white truncate">{display}</div>
            </div>

            {/* Calculator Keypad */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <button onClick={handleClear} className="col-span-2 py-2 rounded-lg bg-[var(--color-rose)]/10 text-[var(--color-rose)] border border-[var(--color-rose)]/20 font-bold active:bg-[var(--color-rose)]/20">C</button>
              <button onClick={() => handleOp('÷')} className="py-2 rounded-lg bg-[#1e293b] text-[var(--color-aqua)] font-bold active:bg-[#334155]">÷</button>
              <button onClick={() => handleOp('×')} className="py-2 rounded-lg bg-[#1e293b] text-[var(--color-aqua)] font-bold active:bg-[#334155]">×</button>

              <button onClick={() => handleNum('7')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">7</button>
              <button onClick={() => handleNum('8')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">8</button>
              <button onClick={() => handleNum('9')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">9</button>
              <button onClick={() => handleOp('-')} className="py-2 rounded-lg bg-[#1e293b] text-[var(--color-aqua)] font-bold active:bg-[#334155]">-</button>

              <button onClick={() => handleNum('4')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">4</button>
              <button onClick={() => handleNum('5')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">5</button>
              <button onClick={() => handleNum('6')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">6</button>
              <button onClick={() => handleOp('+')} className="py-2 rounded-lg bg-[#1e293b] text-[var(--color-aqua)] font-bold active:bg-[#334155]">+</button>

              <button onClick={() => handleNum('1')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">1</button>
              <button onClick={() => handleNum('2')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">2</button>
              <button onClick={() => handleNum('3')} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">3</button>
              <button onClick={handleEqual} className="row-span-2 py-2 rounded-lg bg-[var(--color-aqua)] text-[#111111] font-bold active:bg-[var(--color-emerald)]">=</button>

              <button onClick={() => handleNum('0')} className="col-span-2 py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">0</button>
              <button onClick={handleDot} className="py-2 rounded-lg bg-[#1e293b] text-white font-semibold active:bg-[#334155]">.</button>
            </div>

            {/* Add to Bill */}
            <button onClick={addToBill} className="w-full py-2.5 rounded-xl border border-dashed border-[var(--color-aqua)]/50 text-[var(--color-aqua)] font-bold hover:bg-[var(--color-aqua)]/10 transition flex items-center justify-center gap-2 mb-6">
              <Plus size={16} /> Add to Bill
            </button>

            {/* Tally List */}
            <div className="border-t border-[var(--color-line)] pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-[var(--color-mist-2)] uppercase tracking-wider">Tally List ({tally.length})</h4>
                {tally.length > 0 && (
                  <button onClick={clearAll} className="text-[10px] text-[var(--color-rose)] hover:underline">Clear All</button>
                )}
              </div>

              {tally.length === 0 ? (
                <div className="text-center py-4 text-xs text-[var(--color-mist-2)] italic">List is empty. Add amounts above.</div>
              ) : (
                <div className="space-y-2 mb-4 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                  {tally.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-[#1e293b]/50 p-2 rounded border border-[var(--color-line)]/50">
                      <span className="text-[11px] text-[var(--color-mist-2)]">{t.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-[var(--color-ivory)]">₹{t.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <button onClick={() => removeTally(t.id)} className="text-[var(--color-rose)] hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Grand Total */}
              <div className="flex items-center justify-between bg-[rgba(56,224,200,0.1)] p-3 rounded-xl border border-[var(--color-aqua)]/30">
                <span className="text-sm font-bold text-[var(--color-aqua)]">Grand Total</span>
                <span className="font-mono font-bold text-lg text-[var(--color-ivory)]">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[var(--color-line)] grid grid-cols-2 gap-3 bg-[#0c1322]">
            <button onClick={onClose} className="py-2.5 rounded-xl border border-[var(--color-line)] text-sm font-medium text-[var(--color-mist)] hover:text-white transition">
              Cancel
            </button>
            <button onClick={handleUseTotal} className="py-2.5 rounded-xl bg-[var(--color-aqua)] text-[#111111] text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition shadow-[0_0_15px_rgba(56,224,200,0.2)]">
              Use Total
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
