"use client";

export type RallyOption = {
  id: string;
  name: string;
  scheduledDate: string;
  isActive: boolean;
  userCount?: number;
};

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function fmtRallyDate(ymd?: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
}

export function rallyOptionLabel(r: RallyOption) {
  const today = todayYmd();
  const when = r.scheduledDate === today ? "Today" : r.scheduledDate < today ? "Previous" : "Upcoming";
  const users = r.userCount ?? 0;
  return `${fmtRallyDate(r.scheduledDate)} · ${r.name} · ${when}${r.isActive ? " · active" : ""} · ${users} users`;
}

/** Default: today's active/newest, else any active, else newest. */
export function pickDefaultRallyId(list: RallyOption[]) {
  if (!list.length) return "";
  const today = todayYmd();
  const todayRows = list.filter((r) => r.scheduledDate === today);
  if (todayRows.length) {
    return todayRows.find((r) => r.isActive)?.id || todayRows[0].id;
  }
  return list.find((r) => r.isActive)?.id || list[0].id;
}

type Props = {
  label?: string;
  value: string;
  rallies: RallyOption[];
  onChange: (id: string) => void;
  className?: string;
  groupByDate?: boolean;
};

export function RallyPicker({ label, value, rallies, onChange, className, groupByDate = true }: Props) {
  const today = todayYmd();
  const todayList = rallies.filter((r) => r.scheduledDate === today);
  const previous = rallies.filter((r) => r.scheduledDate < today);
  const upcoming = rallies.filter((r) => r.scheduledDate > today);

  const renderOptions = (list: RallyOption[]) =>
    list.map((r) => (
      <option key={r.id} value={r.id}>
        {rallyOptionLabel(r)}
      </option>
    ));

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ""}`}>
      {label && <label className="text-sm text-navy/60">{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[240px] max-w-full px-3 py-2">
        {!value && <option value="">Select rally</option>}
        {groupByDate ? (
          <>
            {todayList.length > 0 && <optgroup label="Today">{renderOptions(todayList)}</optgroup>}
            {previous.length > 0 && <optgroup label="Previous rallies">{renderOptions(previous)}</optgroup>}
            {upcoming.length > 0 && <optgroup label="Upcoming">{renderOptions(upcoming)}</optgroup>}
          </>
        ) : (
          renderOptions(rallies)
        )}
      </select>
    </div>
  );
}
