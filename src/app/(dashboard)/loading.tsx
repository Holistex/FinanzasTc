export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded-lg bg-slate-200" />
          <div className="h-4 w-96 max-w-full rounded bg-slate-200/80" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-slate-200" />
          <div className="h-9 w-32 rounded-lg bg-slate-200" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-sm"
          >
            <div className="h-3.5 w-28 rounded bg-slate-200" />
            <div className="h-7 w-36 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex gap-3">
          <div className="h-9 flex-1 max-w-sm rounded-md bg-slate-200" />
          <div className="h-9 w-36 rounded-md bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100 p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="h-10 w-full rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
