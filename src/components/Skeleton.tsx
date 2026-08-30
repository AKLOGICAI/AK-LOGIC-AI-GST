/** Loading skeletons shown via Suspense fallback while lazy chunks load. */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg bg-[rgba(255,255,255,0.04)] ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-7 animate-pulse-fast">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Bar className="h-8 w-56" />
          <Bar className="h-4 w-72" />
        </div>
        <Bar className="h-11 w-40" />
      </div>
      {/* stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="depth-card rounded-2xl p-5 space-y-3">
            <Bar className="h-11 w-11 rounded-xl" />
            <Bar className="h-7 w-24" />
            <Bar className="h-4 w-32" />
          </div>
        ))}
      </div>
      {/* large panels */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 depth-card rounded-2xl p-6 space-y-4">
          <Bar className="h-5 w-40" />
          <Bar className="h-44 w-full" />
        </div>
        <div className="depth-card rounded-2xl p-6 space-y-3">
          <Bar className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => <Bar key={i} className="h-10 w-full" />)}
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-6 animate-pulse-fast">
      <div className="space-y-2">
        <Bar className="h-8 w-48" />
        <Bar className="h-4 w-64" />
      </div>
      <Bar className="h-12 w-full max-w-md" />
      <div className="depth-card rounded-2xl p-2 space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Bar className="h-10 w-10 rounded-xl" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
