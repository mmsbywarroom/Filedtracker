"use client";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
};

export function PaginationBar({ page, pageSize, total, onPage, onPageSize }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(Math.max(1, page), pages);
  const from = total ? (safe - 1) * pageSize + 1 : 0;
  const to = Math.min(safe * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy/5 bg-[#f7f9fd] px-4 py-3 text-sm">
      <p className="text-navy/55">
        Showing <span className="font-semibold text-ink">{from}-{to}</span> of{" "}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2 text-xs text-navy/55">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-lg border border-navy/10 bg-white px-2 py-1.5 text-sm"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={safe <= 1}
          onClick={() => onPage(safe - 1)}
          className="rounded-lg border border-navy/10 bg-white px-3 py-1.5 font-medium disabled:opacity-40"
        >
          Previous
        </button>
        <span className="min-w-[5.5rem] text-center text-xs text-navy/60">
          Page {safe} / {pages}
        </span>
        <button
          type="button"
          disabled={safe >= pages}
          onClick={() => onPage(safe + 1)}
          className="rounded-lg border border-navy/10 bg-white px-3 py-1.5 font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
