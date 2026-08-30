# AK-LOGIC AI — Skills-Driven Design & Motion Plan

**Date:** 2026-08-15
**Source of expertise:** [emilkowalski/skills](https://github.com/emilkowalski/skills) — inspected all 9 skills, safety-checked (read-only design/animation guidance, no destructive or data-exfiltration instructions found).
**Status:** PLAN ONLY. No source code changed in this pass — this document is the audit + roadmap, per the same "plan before you touch" discipline already used for `PROMPT.md` and `SECURITY-AUDIT-PROMPT.md` in this repo.

---

## 1. Which skills are relevant, and why

| Skill | Used? | Why |
|---|---|---|
| `emil-design-eng` | ✅ Yes | Core craft bar for every component touched — press feedback, popover origin, transition vs. keyframes, blur-masked crossfades. |
| `apple-design` | ✅ Yes, selectively | Fluid/spring interaction principles (interruptibility, momentum, rubber-banding) for the cart drawer, mobile sheets, and drag interactions. **Not** used for visual style — no Apple chrome, no SF Symbols-alikes, no copying Apple's exact layouts, per the brief's explicit instruction. |
| `animate` | ✅ Yes | Build-sequence discipline (should this animate → purpose → tool → easing → duration → interrupt → reduced-motion) for every new animation in this plan. |
| `find-animation-opportunities` | ✅ Yes | Used to sweep the current codebase (see §3) — this *is* that sweep. |
| `improve-animations` | ✅ Yes | This document follows its audit → prioritized-plan format almost exactly (recon → categorized findings → severity-ranked table → phased plans). |
| `review-animations` | ✅ Yes (as a gate) | Every implementation phase below must pass this bar before being called done — it's the checklist in §7. |
| `animation-vocabulary` | Used implicitly | To name things precisely in this doc (stagger, origin-aware, rubber-banding) rather than vaguely. |
| `pick-ui-library` | ✅ Yes | Flags one real gap: the app hand-rolls `alert()` for error/success feedback in several places instead of a toast library. Recommends **Sonner**. |
| `ask-sonner` | ✅ Yes | Setup/integration guide for the above recommendation. |
| `prototype` | ❌ Not used | No open design decision here needs multiple divergent directions built and compared — the brief gives clear direction (premium colorful commerce for the store, dense/professional for admin). Would revisit if the merchant-facing redesign needs stakeholder buy-in on 2–3 real directions first. |

**Not used merely to prove use** — e.g. no toast library churn beyond the specific `alert()` call sites found, no wholesale animation rewrite of parts that already work (dashboard `depth-card`/`glass` system, existing `framer-motion` spring drawer in `PublicStore.tsx`'s cart, `AdminDashboard.tsx`'s nav).

---

## 2. What's already right (don't touch)

Confirmed while auditing — these already meet the skills' bar:

- `src/index.css` already has `prefers-reduced-motion` handling (collapses durations, doesn't disable outright) — correct per `apple-design` §14 and `animate` §7.
- `PublicStore.tsx`'s cart drawer already uses a **spring** (`{ type: 'spring', damping: 25, stiffness: 280 }`) with `AnimatePresence`, not keyframes — correct tool for an interruptible, gesture-adjacent sheet.
- `:focus-visible` is scoped correctly (keyboard-only ring, no stray ring on mouse/touch) — accessibility already handled.
- The stack is already right for everything this plan needs: **React 19 + Tailwind v4 + framer-motion + lucide-react** are exactly what `pick-ui-library` would recommend from scratch. No dependency swap needed anywhere except the one addition below.

---

## 3. Audit findings (file:line evidence)

### A. Design tokens — missing, causing ad-hoc easing everywhere

**Location:** `src/index.css` `@theme` block

Only color/font tokens exist. No `--ease-out` / `--ease-in-out` / `--ease-drawer` tokens. Effect: every animated component invents its own curve —

- `.tilt-hover` → `cubic-bezier(.2,.8,.2,1)`
- `.animate-slide-up-fade` → `cubic-bezier(0.16, 1, 0.3, 1)`
- `PublicStore.tsx` cart drawer → spring (fine, springs don't need this token)

None of these are *wrong* exactly, but they're three different "ease-out flavors" in one app where `emil-design-eng`/`animate` both specify one canonical strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`) to extend everywhere, not reinvent per-component.

**Severity: LOW** (cohesion, not a bug) — Phase 1 fix.

### B. Public Store — the brief's core complaint, confirmed in code

**Location:** `src/pages/store/PublicStore.tsx` (entire file)

| Finding | Evidence | Severity |
|---|---|---|
| Entire storefront is dark navy/black | `bg-[#070b14] text-[#e2e8f0]` on the root div (L134); every section is `bg-white/5 border border-white/10` — same translucent-dark-panel treatment as the internal admin dashboard | **HIGH** — directly contradicts the brief: *"avoid making everything black/dark"* for the customer-facing store |
| No real product-card elevation/hierarchy | Product cards (L262–314) are flat `bg-white/5` boxes with no shadow, no hover lift, price and "Add" button compete for attention at equal weight | **MEDIUM** |
| Cart badge uses CSS `animate-bounce` (Tailwind's default keyframe loop) | L179 `className="... animate-bounce"` | **LOW** — an infinite bounce on a persistent badge is a "seen 100+ times/session" element (skill: nothing that visible should loop-animate indefinitely); should be a one-shot pop on count change, not a permanent loop |
| `store.phone.replace(...)` — will throw if a merchant hasn't set a phone number | L~475, WhatsApp `href` builder | **BUG**, not a design finding — flagging for the implementation phase, not fixing silently as a "design" change |
| No skeleton loading state | Loading state (L58–64) is a single spinner + text, not layout-shaped skeletons for the product grid | **MEDIUM** — brief asks for "polished loading...states" |
| No empty-search state design | `filteredProducts.length === 0` (L253) renders a plain text line, no illustration/CTA | **LOW** |
| Search input has no debounce/no results count | Functional but minimal — fine to leave, not in scope unless doing a deeper commerce pass | Not flagged as a finding — out of scope for this phase |

### C. Admin panel — mostly fine, a few real gaps

**Location:** multiple admin routers/pages

| Finding | Evidence | Severity |
|---|---|---|
| `alert()` used for both error *and* transient success feedback | `MerchantNetworkPage.tsx`'s `submitEditRequest` catch block (`alert('Failed to edit request.')`, flagged earlier this session as BUG-021); `PublicStore.tsx`'s `handleSendDirectOrder` catch (`alert(e.message ...)`) | **MEDIUM** — blocking native `alert()` freezes the tab, has zero brand styling, and is explicitly the exact gap `pick-ui-library` names ("Toasts built by hand" → Sonner exists for this) |
| Admin dashboard's own motion is already fine | `AdminDashboard.tsx`'s `<motion.div initial={{opacity:0}} animate={{opacity:1}}>` page-transition wrapper, nav active-state via CSS class swap (no animation) — correct: nav switching is a 100+/day action and correctly has **no** transition animation | Not a finding — cited as an example of what's already right |
| No toast system at all in `package.json` | Confirmed: no `sonner`, no `react-hot-toast` | **Gap**, addressed in §5 |

---

## 4. Design direction (per the brief, grounded in the audit)

### Public Store (customer-facing) — premium colorful commerce
Move off the navy-dashboard palette entirely for this one surface. Concretely:
- **Base:** light, warm neutral canvas (off-white, not stark `#fff`) instead of `#070b14` — commerce sites read as trustworthy on light backgrounds; dark commerce is a niche aesthetic, not the default the brief asks for.
- **Merchant branding stays primary:** `theme_primary_color`/`theme_secondary_color` (already wired from the Website Builder, `website.py`'s `WebsiteUpdateIn`) become the accent on a light canvas instead of a glow on black — this makes merchant branding *more* visible, not less, since color pops harder against light neutral than against near-black.
- **Product cards:** real elevation (soft shadow, not just a border), consistent price/CTA hierarchy, hover lift (`translateY(-2px)` + shadow growth, `ease-out`, ~160ms — well within the sub-300ms UI budget).
- **Skeletons** for the initial product-grid load instead of a spinner-only state (`animate-pulse-fast`/shimmer utilities already exist in `index.css` — reuse them, don't invent new ones).
- **Cart badge:** replace the looping `animate-bounce` with a one-shot spring pop keyed to count changes (`{ type: 'spring', bounce: 0.3, duration: 0.4 }` — bounce justified here specifically because it's a *count-changed* moment, not a permanent idle state).

### Admin Panel — professional, information-dense
No visual overhaul — the existing `depth-card`/`glass`/navy system already reads as a serious internal tool, which is correct per the brief ("keep it professional... prioritize clarity and speed over unnecessary animation"). Scope stays narrow:
- Replace `alert()` calls with Sonner toasts (see §5).
- Table/filter/detail-view polish only where a genuine gap exists (none found beyond the alert() issue in this pass — flag for a follow-up audit if the user wants a deeper admin-specific sweep).

---

## 5. One dependency addition: Sonner

Per `pick-ui-library`: "Toasts built by hand or with a modal library → Sonner exists for exactly this." Per `ask-sonner`: mount **one** `<Toaster />` at the app root (`src/App.tsx` or `main.tsx`), call `toast()`/`toast.success()`/`toast.error()` from event handlers.

This directly replaces:
- `alert('Failed to edit request.')` (MerchantNetworkPage.tsx)
- `alert(e.message || 'Error placing order directly to merchant.')` (PublicStore.tsx)
- any other `alert(` call sites found in the follow-up grep (full list to be confirmed at implementation time)

No other new dependency is needed — motion, icons, and everything else in this plan is covered by what's already installed.

---

## 6. Phased implementation plan

### Phase 1 — Foundation (low risk, no visual change to existing screens)
1. Add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` to `src/index.css`'s `@theme` block.
2. Install and wire up Sonner (`<Toaster />` at root); replace the 2 confirmed `alert()` call sites; grep for any others.
3. **Verify:** `npm run build` clean, manually trigger both replaced error paths, confirm toast appears/dismisses correctly, confirm no double-`<Toaster />` mount.

### Phase 2 — Public Store premium redesign (the brief's main ask)
1. Rebuild `PublicStore.tsx`'s visual shell on a light, merchant-branded canvas (keep all existing data-fetching, cart logic, direct-order-to-merchant flow, and the `publicStoreService` API contract completely unchanged — this is a presentation-layer change only).
2. Product cards: elevation, hover lift, consistent hierarchy.
3. Skeleton loading state for the product grid.
4. Empty-search state with a clear CTA (e.g. "clear search").
5. Cart badge: one-shot spring pop instead of infinite bounce.
6. Fix the `store.phone` crash guard (`store.phone?.replace(...)`) while touching this file — a correctness fix incidental to the redesign, not a new scope item.
7. **Verify:** test with a merchant that has no hero image / no gallery / no phone number (all the optional-field branches), confirm mobile layout (cart drawer, header) still works, confirm `prefers-reduced-motion` still collapses the new transitions, run through `review-animations`' Ten Non-Negotiable Standards on the diff before calling it done.

### Phase 3 — Admin polish (narrow, as scoped in §4)
1. Confirm no other `alert()`/`window.confirm()` call sites beyond the 2 found.
2. Leave everything else in the admin panel as-is per this pass's audit — no gaps found that justify a change beyond the toast swap.

### Phase 4 — Optional follow-up (not started without separate go-ahead)
- A dedicated `find-animation-opportunities` sweep of the **merchant dashboard** (Overview, RequestsPage, GstReturnCenter, etc.) — out of scope for this pass since the brief's explicit focus was the public store + admin, not the merchant's own dashboard.
- A dedicated `improve-animations` audit of `AdminSecurityAudit.tsx` (added this session) and other recently-added pages, once they've had real usage to surface any rough edges.

---

## 7. Verification gate for every phase (from `review-animations`)

Before any phase is marked done, the diff must pass:
1. Every animation has a named purpose (feedback / spatial consistency / state indication / preventing a jarring change) — no "it looks cool."
2. No `ease-in` on UI; no bare `transition: all`.
3. No `scale(0)` entrances — `scale(0.9–0.97)` + opacity minimum.
4. UI animations stay under 300ms (springs are duration-less by design, judged by feel instead).
5. Popovers/menus/tooltips use `transform-origin` at their trigger; modals stay centered.
6. Rapidly-triggered elements (toasts, cart badge, drawer) use transitions/springs, not restarting keyframes.
7. Only `transform`/`opacity` animated (except the accordion/height exception already tolerated by the skill).
8. `prefers-reduced-motion` and `@media (hover: hover)` gating present wherever relevant.
9. Nothing animates on a keyboard-triggered or 100+/day action (admin nav already correctly has none — must stay that way).

---

## 8. Explicitly out of scope / preserved

Per the brief's own constraints, none of the following change in any phase above:
- Database schema, RLS policies, migrations.
- Any backend route, business logic, or the `publicStoreService`/`websiteService` API contracts.
- Supabase credentials/service-role usage (none touched; this is a pure frontend-presentation plan).
- Merchant dashboard's existing navy `depth-card` design system (only the *public-facing* store surface changes palette, per the brief's explicit instruction that only the public website should move away from dark).
- Any third-party service beyond the one already-justified Sonner addition.

---

## 9. What happens next

This document is the plan only. Recommended order to actually execute: **Phase 1 → Phase 2 → Phase 3**, each deployed and verified (Render/Vercel + manual smoke test) before starting the next, matching how every other change in this repo's history has shipped this session — small, verified, reversible steps rather than one large redesign commit.
