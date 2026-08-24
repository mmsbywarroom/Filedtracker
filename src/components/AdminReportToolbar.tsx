"use client";

const field =
  "mt-1 block h-11 w-full min-w-[150px] rounded-xl border border-navy/10 bg-white px-3 text-sm";

export function AdminReportToolbar({
  date,
  onDate,
  q,
  onQ,
  qPlaceholder = "Search name, number, assembly",
  zone,
  onZone,
  zones,
  district,
  onDistrict,
  districts,
  designation,
  onDesignation,
  designations,
  reason,
  onReason,
  reasons,
  onApply,
  onCsv,
  onPdf,
}: {
  date?: string;
  onDate?: (v: string) => void;
  q: string;
  onQ: (v: string) => void;
  qPlaceholder?: string;
  zone: string;
  onZone: (v: string) => void;
  zones: string[];
  district: string;
  onDistrict: (v: string) => void;
  districts: string[];
  designation: string;
  onDesignation: (v: string) => void;
  designations: string[];
  reason: string;
  onReason: (v: string) => void;
  reasons: { value: string; label: string }[];
  onApply?: () => void;
  onCsv: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="mt-4 mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card">
      {onDate && (
        <label className="text-xs font-medium text-navy/55">
          Date
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={field} />
        </label>
      )}
      <label className="min-w-[180px] flex-1 text-xs font-medium text-navy/55">
        Search
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={qPlaceholder} className={field} />
      </label>
      <label className="text-xs font-medium text-navy/55">
        Zone wise
        <select value={zone} onChange={(e) => onZone(e.target.value)} className={field}>
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-navy/55">
        District
        <select value={district} onChange={(e) => onDistrict(e.target.value)} className={field}>
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-navy/55">
        Designation
        <select value={designation} onChange={(e) => onDesignation(e.target.value)} className={field}>
          <option value="">All designations</option>
          {designations.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-navy/55">
        Reason wise
        <select value={reason} onChange={(e) => onReason(e.target.value)} className={field}>
          <option value="">All reasons</option>
          {reasons.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {onApply && (
        <button type="button" onClick={onApply} className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          Apply
        </button>
      )}
      <button
        type="button"
        onClick={onCsv}
        className="h-11 rounded-xl border border-navy/15 px-4 text-sm font-semibold text-navy"
      >
        Download CSV
      </button>
      <button
        type="button"
        onClick={onPdf}
        className="h-11 rounded-xl border border-navy/15 px-4 text-sm font-semibold text-navy"
      >
        PDF
      </button>
    </div>
  );
}
