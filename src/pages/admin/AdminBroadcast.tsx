import { useState } from 'react';
import { Megaphone, Send, Check, Bell, Users, Crown, Zap } from 'lucide-react';
import { store, useMerchants, useNotifications } from '../../lib/store';
import { PageHeader, timeAgo } from '../../components/ui';
import { Field, Area } from '../../components/Field';

type Audience = 'all' | 'monthly' | 'short' | 'selected';

export default function AdminBroadcast() {
  const merchants = useMerchants();
  const notifs = useNotifications().filter((n) => n.type === 'broadcast').sort((a, b) => b.createdAt - a.createdAt);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [sent, setSent] = useState(0);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const targetCount = audience === 'all' ? merchants.length
    : audience === 'monthly' ? merchants.filter((m) => m.planValidityDays >= 30).length
    : audience === 'short' ? merchants.filter((m) => m.planValidityDays < 30).length
    : selected.length;

  const send = () => {
    if (!title || !body || targetCount === 0) return;
    let n = 0;
    if (audience === 'all') { store.admin.broadcastAll(title, body); n = merchants.length; }
    else if (audience === 'monthly') n = store.admin.notifyByPlanValidity(30, 99999, title, body);
    else if (audience === 'short') n = store.admin.notifyByPlanValidity(0, 29, title, body);
    else { store.admin.notifySelected(selected, title, body); n = selected.length; }
    setTitle(''); setBody(''); setSelected([]); setSent(n);
    setTimeout(() => setSent(0), 3000);
  };

  const seen = new Set<string>();
  const unique = notifs.filter((n) => { const k = n.title + n.body; if (seen.has(k)) return false; seen.add(k); return true; });

  const segments: { id: Audience; label: string; icon: typeof Users }[] = [
    { id: 'all', label: 'All Merchants', icon: Users },
    { id: 'monthly', label: 'Monthly Plans (≥30d)', icon: Crown },
    { id: 'short', label: 'Short Plans (<30d)', icon: Zap },
    { id: 'selected', label: 'Selected', icon: Bell },
  ];

  return (
    <div>
      <PageHeader title="Global Notifications" subtitle="Send announcements to all merchants, a plan segment, or selected merchants." />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Megaphone size={18} className="text-[var(--color-violet)]" /> Compose</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {segments.map((s) => (
              <button key={s.id} onClick={() => setAudience(s.id)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition ${audience === s.id ? 'border-[var(--color-violet)] bg-[rgba(124,108,245,0.1)] text-[var(--color-ivory)]' : 'border-[var(--color-line)] text-[var(--color-mist)]'}`}><s.icon size={15} /> {s.label}</button>
            ))}
          </div>

          {audience === 'selected' && (
            <div className="mb-4 max-h-40 overflow-y-auto no-scrollbar space-y-1.5 depth-soft rounded-xl p-2">
              {merchants.map((m) => (
                <button key={m.id} onClick={() => toggle(m.id)} className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${selected.includes(m.id) ? 'bg-[rgba(124,108,245,0.14)] text-[var(--color-ivory)]' : 'text-[var(--color-mist)]'}`}>
                  {m.shopName} {selected.includes(m.id) && <Check size={14} className="text-[var(--color-violet)]" />}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New feature launched" />
            <Area label="Message" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your announcement..." />
            <button onClick={send} disabled={!title || !body || targetCount === 0} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#9385ff,#7c6cf5)' }}>
              {sent > 0 ? <><Check size={17} strokeWidth={3} /> Sent to {sent} merchants</> : <><Send size={17} /> Send to {targetCount} merchant{targetCount === 1 ? '' : 's'}</>}
            </button>
          </div>
        </div>

        <div className="depth-card rounded-2xl p-6">
          <h3 className="font-[var(--font-display)] font-semibold mb-4 flex items-center gap-2"><Bell size={18} className="text-[var(--color-aqua)]" /> Sent History</h3>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto no-scrollbar">
            {unique.map((n) => (
              <div key={n.id} className="depth-soft rounded-xl px-4 py-3"><div className="text-sm font-medium">{n.title}</div><p className="text-sm text-[var(--color-mist)] mt-0.5">{n.body}</p><div className="text-[11px] text-[var(--color-mist-2)] mt-1">{timeAgo(n.createdAt)}</div></div>
            ))}
            {unique.length === 0 && <p className="text-sm text-[var(--color-mist-2)]">No broadcasts yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
