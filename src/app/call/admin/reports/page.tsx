export default function CallReportsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Download the full calling report. Submissions include each member’s halka. Summary includes Yellow Stone and Unify.
      </p>
      <div className="mt-4 grid gap-3">
        <a href="/api/call/admin/reports?kind=submissions" className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-semibold">Submissions report</p>
          <p className="mt-1 text-sm text-slate-600">One row per member, with halka, caller, call status, and the latest answers.</p>
          <p className="mt-3 text-sm font-semibold text-[#0b6fbf]">Download CSV</p>
        </a>
        <a href="/api/call/admin/reports?kind=summary" className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-semibold">Summary report</p>
          <p className="mt-1 text-sm text-slate-600">Yellow Stone and Unify totals, plus each caller’s assigned, dialed, fresh, connected, and re-dial counts.</p>
          <p className="mt-3 text-sm font-semibold text-[#0b6fbf]">Download CSV</p>
        </a>
      </div>
    </main>
  );
}
