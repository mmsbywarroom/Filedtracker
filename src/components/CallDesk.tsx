"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CALL_OUTCOMES, CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES, REDIAL_CALL_STATUSES } from "@/lib/callList";
import { fillCallTokens, questionVisible, TEXT_QUESTION_TYPES, type CallFormShape, type CallQuestion } from "@/lib/callForm";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";

const COPY = {
  en: {
    title: "AAP Calling Dashboard",
    role: "",
    user: "User",
    logout: "Logout",
    filter: "Filter by status",
    fresh: "Fresh",
    searchTitle: "Search contact by mobile",
    searchPh: "Enter 10 digit mobile number",
    search: "Search",
    assigned: "Assigned contact",
    go: "Go to",
    jump: "Jump",
    none: "No assigned contacts.",
    openForm: "Open calling form",
    prev: "← Previous",
    next: "Next →",
    last: "Last status",
    copy: "Copy",
    copied: "Copied",
    opening: "Opening script",
    closer: "Call closer script",
    status: "Call status",
    selectStatus: "Select call status",
    remarks: "Remarks (optional)",
    note: "Add a note",
    clear: "Clear form",
    cancel: "Cancel",
    save: "Save & next",
    needStatus: "Select a call status.",
    saveFail: "Could not save.",
    details: "Enter details",
    select: "Select",
    total: "Total calls",
    dialed: "Total dialed",
    pending: "Fresh (pending)",
    redial: "Re-dial queue",
    connected: "Connected calls",
    complete: "Call complete",
    notConnected: "Not connected",
  },
  pa: {
    title: "ਏਏਪੀ ਕਾਲਿੰਗ ਡੈਸ਼ਬੋਰਡ",
    role: "",
    user: "ਯੂਜ਼ਰ",
    logout: "ਲਾਗ ਆਊਟ",
    filter: "ਸਥਿਤੀ ਨਾਲ ਫਿਲਟਰ",
    fresh: "ਨਵਾਂ",
    searchTitle: "ਮੋਬਾਈਲ ਨਾਲ ਸੰਪਰਕ ਖੋਜੋ",
    searchPh: "10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ",
    search: "ਖੋਜੋ",
    assigned: "ਸੌਂਪਿਆ ਸੰਪਰਕ",
    go: "ਜਾਓ",
    jump: "ਛਾਲ",
    none: "ਕੋਈ ਸੰਪਰਕ ਨਹੀਂ।",
    openForm: "ਕਾਲਿੰਗ ਫਾਰਮ ਖੋਲ੍ਹੋ",
    prev: "← ਪਿਛਲਾ",
    next: "ਅਗਲਾ →",
    last: "ਆਖਰੀ ਸਥਿਤੀ",
    copy: "ਕਾਪੀ",
    copied: "ਕਾਪੀ ਹੋ ਗਿਆ",
    opening: "ਸ਼ੁਰੂਆਤੀ ਸਕ੍ਰਿਪਟ",
    closer: "ਕਾਲ ਬੰਦ ਕਰਨ ਦੀ ਸਕ੍ਰਿਪਟ",
    status: "ਕਾਲ ਸਥਿਤੀ",
    selectStatus: "ਕਾਲ ਸਥਿਤੀ ਚੁਣੋ",
    remarks: "ਟਿੱਪਣੀ (ਜ਼ਰੂਰੀ ਨਹੀਂ)",
    note: "ਨੋਟ ਲਿਖੋ",
    clear: "ਫਾਰਮ ਸਾਫ਼ ਕਰੋ",
    cancel: "ਰੱਦ",
    save: "ਸੇਵ ਅਤੇ ਅਗਲਾ",
    needStatus: "ਕਾਲ ਸਥਿਤੀ ਚੁਣੋ।",
    saveFail: "ਸੇਵ ਨਹੀਂ ਹੋ ਸਕਿਆ।",
    details: "ਵੇਰਵਾ ਲਿਖੋ",
    select: "ਚੁਣੋ",
    total: "ਕੁੱਲ ਕਾਲਾਂ",
    dialed: "ਕੁੱਲ ਡਾਇਲ",
    pending: "ਨਵੀਆਂ (ਬਾਕੀ)",
    redial: "ਦੁਬਾਰਾ ਕਾਲ",
    connected: "ਜੁੜੀਆਂ ਕਾਲਾਂ",
    complete: "ਕਾਲ ਪੂਰੀ",
    notConnected: "ਨਹੀਂ ਜੁੜੀ",
  },
} as const;

type Row = {
  id: string;
  halka: string;
  villageWard: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  position: string;
  status: string;
  remarks: string;
  answers: Record<string, string>;
};

type Stats = {
  total: number;
  dialed: number;
  fresh: number;
  redial: number;
  connected: number;
  complete: number;
  notConnected: number;
};

const CARDS: { key: keyof Stats; label: keyof (typeof COPY)["en"]; tone: string }[] = [
  { key: "total", label: "total", tone: "border-slate-200" },
  { key: "dialed", label: "dialed", tone: "border-sky-300" },
  { key: "fresh", label: "pending", tone: "border-amber-300" },
  { key: "redial", label: "redial", tone: "border-orange-400" },
  { key: "connected", label: "connected", tone: "border-emerald-400" },
  { key: "complete", label: "complete", tone: "border-green-500" },
  { key: "notConnected", label: "notConnected", tone: "border-rose-300" },
];

const CONNECTED = new Set<string>(CONNECTED_CALL_STATUSES);
const NOT_CONNECTED = new Set<string>(NOT_CONNECTED_CALL_STATUSES);
const REDIAL = new Set<string>(REDIAL_CALL_STATUSES);

function matchesSummary(status: string, filter: string) {
  if (!filter || filter === "total") return true;
  if (filter === "fresh") return !status;
  if (filter === "dialed") return Boolean(status);
  if (filter === "redial") return REDIAL.has(status);
  if (filter === "connected") return CONNECTED.has(status);
  if (filter === "complete") return status === "call_complete";
  if (filter === "notConnected") return NOT_CONNECTED.has(status);
  return status === filter;
}

const DESK_CACHE = "ft-call-desk";

export function CallDesk() {
  const { lang } = useLang();
  const t = COPY[lang];
  const [phone, setPhone] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<CallFormShape | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const [jump, setJump] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(search = q) {
    const res = await fetch(`/api/call/queue?q=${encodeURIComponent(search)}`);
    if (res.status === 401) {
      window.location.href = "/call";
      return;
    }
    const data = await res.json();
    setPhone(data.phone || "");
    setStats(data.stats || null);
    setForm(data.form || null);
    setRows(data.contacts || []);
    try {
      sessionStorage.setItem(DESK_CACHE, JSON.stringify({ phone: data.phone, stats: data.stats, form: data.form, contacts: data.contacts }));
    } catch {
      /* ignore quota */
    }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DESK_CACHE);
      if (raw) {
        const data = JSON.parse(raw);
        setPhone(data.phone || "");
        setStats(data.stats || null);
        setForm(data.form || null);
        setRows(Array.isArray(data.contacts) ? data.contacts : []);
      }
    } catch {
      /* ignore bad cache */
    }
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    return rows.filter((r) => matchesSummary(r.status, filter));
  }, [rows, filter]);

  const safeIndex = visible.length ? Math.min(index, visible.length - 1) : 0;
  const row = visible[safeIndex] || null;

  useEffect(() => {
    setIndex(0);
    setFormOpen(false);
  }, [filter, q]);

  function show(i: number) {
    const next = Math.max(0, Math.min(visible.length - 1, i));
    setIndex(next);
    setFormOpen(false);
    const current = visible[next];
    setAnswers(current?.answers || {});
    setStatus(current?.status || "");
    setRemarks(current?.remarks || "");
  }

  function openRecord() {
    if (!row) return;
    setAnswers(row.answers || {});
    setStatus(row.status || "");
    setRemarks(row.remarks || "");
  }

  async function save(goNext: boolean) {
    if (!row || !status) {
      setMsg(t.needStatus);
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: row.id, status, remarks, answers }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || t.saveFail);
      return;
    }
    setFormOpen(false);
    await load(q);
    if (goNext) setIndex((i) => i + 1);
  }

  async function logout() {
    await fetch("/api/call/logout", { method: "POST" });
    window.location.href = "/call";
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.status || "fresh"] = (map[r.status || "fresh"] || 0) + 1;
    return map;
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#eef3f8] text-slate-900">
      <header className="flex items-center justify-between bg-[#0b6fbf] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <BrandMark size={32} tone="onDark" />
          <p className="text-sm font-semibold">{t.title}</p>
        </div>
        <div className="flex items-center gap-2 text-right text-xs">
          <LangToggle />
          <div>
            <p>{t.user}: {phone || "—"}</p>
            <button type="button" onClick={logout} className="mt-1 rounded bg-white/15 px-2 py-1 font-semibold">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {CARDS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key === "total" ? "" : filter === c.key ? "" : c.key)}
                className={`rounded-xl border-t-4 bg-white px-3 py-3 text-left shadow-sm ${c.tone} ${filter === c.key || (c.key === "total" && !filter) ? "ring-2 ring-[#0b6fbf]" : ""}`}
              >
                <p className="text-2xl font-semibold">{stats[c.key]}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{t[c.label]}</p>
              </button>
            ))}
          </div>
        ) : null}

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.filter}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip active={filter === "fresh"} label={`${t.fresh}: ${counts.fresh || 0}`} onClick={() => setFilter(filter === "fresh" ? "" : "fresh")} />
            {(form?.statuses || CALL_OUTCOMES).map((s) => (
              <FilterChip
                key={s.value}
                active={filter === s.value}
                label={`${s.label}: ${counts[s.value] || 0}`}
                onClick={() => setFilter(filter === s.value ? "" : s.value)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{t.searchTitle}</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder={t.searchPh}
              className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <button type="button" onClick={() => load(q)} className="rounded-xl bg-[#0b6fbf] px-4 text-sm font-semibold text-white">
              {t.search}
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t.assigned}</h2>
            <div className="flex items-center gap-2 text-xs">
              <span>{t.go}</span>
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
                className="h-8 w-16 rounded border border-slate-200 px-2"
              />
              <button
                type="button"
                className="rounded bg-slate-100 px-2 py-1 font-semibold"
                onClick={() => {
                  const n = Number(jump);
                  if (n >= 1) show(n - 1);
                }}
              >
                {t.jump}
              </button>
              <span>
                {visible.length ? safeIndex + 1 : 0} / {visible.length}
              </span>
            </div>
          </div>

          {row ? (
            <div key={row.id} className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Field label="Halka" value={row.halka} />
              <Field label="Village/Ward" value={row.villageWard} />
              <Field label="Name" value={row.name} />
              <Field label="Phone" value={row.phone} extra={<CopyButton text={row.phone} copy={t.copy} copied={t.copied} />} />
              <Field label="Age" value={row.age} />
              <Field label="Gender" value={row.gender} />
              <Field label="Position" value={row.position} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{t.none}</p>
          )}

          <button
            type="button"
            disabled={!row}
            onClick={() => {
              openRecord();
              setFormOpen(true);
            }}
            className="mt-4 h-14 w-full rounded-xl bg-[#16a34a] text-sm font-bold tracking-wide text-white disabled:opacity-40"
          >
            {t.openForm}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={safeIndex <= 0} onClick={() => show(safeIndex - 1)} className="h-11 rounded-xl bg-slate-100 text-sm font-semibold disabled:opacity-40">
              {t.prev}
            </button>
            <button
              type="button"
              disabled={safeIndex >= visible.length - 1}
              onClick={() => show(safeIndex + 1)}
              className="h-11 rounded-xl bg-slate-100 text-sm font-semibold disabled:opacity-40"
            >
              {t.next}
            </button>
          </div>
          {row?.status ? <p className="mt-3 text-sm text-slate-600">{t.last}: {statusLabel(form, row.status)}</p> : null}
        </section>
      </main>

      {formOpen && row && form ? (
        <CallingForm
          row={row}
          form={form}
          answers={answers}
          setAnswers={setAnswers}
          status={status}
          setStatus={setStatus}
          remarks={remarks}
          setRemarks={setRemarks}
          busy={busy}
          msg={msg}
          ui={t}
          onClose={() => setFormOpen(false)}
          onSave={() => save(true)}
        />
      ) : null}
    </div>
  );
}

function statusLabel(form: CallFormShape | null, value: string) {
  return form?.statuses.find((s) => s.value === value)?.label || value;
}

function Field({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="flex items-center gap-2 font-semibold">
        <span>{value || "—"}</span>
        {extra}
      </p>
    </div>
  );
}

function CopyButton({ text, copy, copied }: { text: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#0b6fbf]"
    >
      {done ? copied : copy}
    </button>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-[#0b6fbf] text-white" : "bg-slate-100 text-slate-700"}`}
    >
      {label}
    </button>
  );
}

function CallingForm({
  row,
  form,
  answers,
  setAnswers,
  status,
  setStatus,
  remarks,
  setRemarks,
  busy,
  msg,
  ui,
  onClose,
  onSave,
}: {
  row: Row;
  form: CallFormShape;
  answers: Record<string, string>;
  setAnswers: (v: Record<string, string>) => void;
  status: string;
  setStatus: (v: string) => void;
  remarks: string;
  setRemarks: (v: string) => void;
  busy: boolean;
  msg: string;
  ui: (typeof COPY)["en"];
  onClose: () => void;
  onSave: () => void;
}) {
  const script = { fontFamily: "var(--font-pa), sans-serif" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {form.title}: {row.name} ({row.phone})
          </h2>
          <button type="button" onClick={onClose} className="text-lg leading-none">
            ×
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {form.openingScript ? (
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-950" style={script}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide">{ui.opening}</p>
              <p className="whitespace-pre-wrap">{fillCallTokens(form.openingScript, row)}</p>
            </div>
          ) : null}
          {form.questions.filter((q) => questionVisible(q, answers, form.questions)).map((q, i) => (
            <QuestionBlock
              key={q.id}
              index={i + 1}
              question={q}
              row={row}
              answers={answers}
              onChange={(next) => setAnswers(next)}
              detailsLabel={ui.details}
              selectLabel={ui.select}
            />
          ))}
          <label className="block text-sm font-semibold">
            {ui.status} *
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal">
              <option value="">{ui.selectStatus}</option>
              {form.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            {ui.remarks}
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" placeholder={ui.note} />
          </label>
          {msg ? <p className="text-sm text-red-700">{msg}</p> : null}
        </div>
        {form.closingScript ? (
          <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950" style={script}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">{ui.closer}</p>
            <p className="max-h-28 overflow-y-auto whitespace-pre-wrap">{fillCallTokens(form.closingScript, row)}</p>
          </div>
        ) : null}
        <div className="flex gap-2 border-t px-4 py-3">
          <button type="button" onClick={() => setAnswers({})} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
            {ui.clear}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold">
            {ui.cancel}
          </button>
          <button type="button" disabled={busy} onClick={onSave} className="ml-auto rounded-xl bg-[#0b6fbf] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {ui.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionBlock({
  index,
  question,
  row,
  answers,
  onChange,
  detailsLabel,
  selectLabel,
}: {
  index: number;
  question: CallQuestion;
  row: Row;
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  detailsLabel: string;
  selectLabel: string;
}) {
  const label = fillCallTokens(question.label, row);
  const selected = answers[question.id] || "";
  const textKey = `${question.id}__text`;
  const option = question.options.find((o) => o.value === selected);
  const picked = new Set(selected.split("|").filter(Boolean));
  const script = { fontFamily: "var(--font-pa), sans-serif" };
  const input = "mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm";

  function setValue(value: string) {
    onChange({ ...answers, [question.id]: value });
  }

  function toggleMulti(value: string) {
    const next = new Set(picked);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setValue(Array.from(next).join("|"));
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3" style={{ ...script, borderLeftColor: question.color, borderLeftWidth: question.color ? 4 : undefined }}>
      <p className="text-sm font-semibold">
        Q{index}. {label}
      </p>
      {question.type === "long_text" ? (
        <textarea value={selected} onChange={(e) => setValue(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      ) : question.type === "number" ? (
        <input inputMode="decimal" value={selected} onChange={(e) => setValue(e.target.value)} className={input} />
      ) : question.type === "phone" ? (
        <input inputMode="numeric" value={selected} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 10))} className={input} />
      ) : question.type === "date" ? (
        <input type="date" value={selected} onChange={(e) => setValue(e.target.value)} className={input} />
      ) : question.type === "email" ? (
        <input type="email" value={selected} onChange={(e) => setValue(e.target.value)} className={input} />
      ) : question.type === "rating" ? (
        <div className="mt-2 flex gap-2">
          {["1", "2", "3", "4", "5"].map((n) => (
            <button key={n} type="button" onClick={() => setValue(n)} className={`h-10 w-10 rounded-full text-sm font-semibold ${selected === n ? "bg-[#0b6fbf] text-white" : "bg-slate-100"}`}>
              {n}
            </button>
          ))}
        </div>
      ) : TEXT_QUESTION_TYPES.has(question.type) ? (
        <input value={selected} onChange={(e) => setValue(e.target.value)} className={input} />
      ) : question.type === "dropdown" ? (
        <select value={selected} onChange={(e) => setValue(e.target.value)} className={input}>
          <option value="">{selectLabel}</option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : question.type === "multi" ? (
        <div className="mt-2 space-y-2">
          {question.options.map((o) => (
            <div key={o.value}>
              <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm" style={o.color ? { borderLeft: `4px solid ${o.color}` } : undefined}>
                <input type="checkbox" checked={picked.has(o.value)} onChange={() => toggleMulti(o.value)} />
                {o.label}
              </label>
              {o.allowText && picked.has(o.value) ? (
                <input
                  value={answers[`${question.id}__${o.value}__text`] || ""}
                  onChange={(e) => onChange({ ...answers, [`${question.id}__${o.value}__text`]: e.target.value })}
                  placeholder={detailsLabel}
                  className={input}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {question.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm" style={o.color ? { borderLeft: `4px solid ${o.color}` } : undefined}>
              <input type="radio" name={question.id} checked={selected === o.value} onChange={() => setValue(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {question.type !== "multi" && option?.allowText ? (
        <input
          value={answers[textKey] || ""}
          onChange={(e) => onChange({ ...answers, [textKey]: e.target.value })}
          placeholder={detailsLabel}
          className={input}
        />
      ) : null}
    </div>
  );
}
