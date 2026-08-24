"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DESIGNATIONS } from "@/lib/hierarchy";

const empty = {
  name: "",
  phone: "",
  designation: "Sector Incharge",
  assemblyName: "",
  assemblies: [] as string[],
  sectorAllotted: "",
  zone: "",
  district: "",
  cluster: "",
};

function CreateUserForm() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("edit");
  const [form, setForm] = useState(empty);
  const [officialAssemblies, setOfficialAssemblies] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/assembly-names")
      .then((r) => r.json())
      .then((d) => setOfficialAssemblies(d.assemblies || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) {
      setForm(empty);
      return;
    }
    (async () => {
      const res = await fetch("/api/admin/users");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      const u = (data.users || []).find((row: { id: string }) => row.id === editId);
      if (u) {
        const assemblies = Array.isArray(u.assemblies) && u.assemblies.length ? u.assemblies : [];
        setForm({
          name: u.name,
          phone: u.phone,
          designation: u.designation || "Sector Incharge",
          assemblyName: u.assemblyName,
          assemblies: assemblies.length ? assemblies : u.assemblyName ? [u.assemblyName] : [],
          sectorAllotted: u.sectorAllotted,
          zone: u.zone,
          district: u.district,
          cluster: u.cluster || "",
        });
      }
    })();
  }, [editId]);

  function toggleAssembly(name: string) {
    setForm((f) => {
      const has = f.assemblies.includes(name);
      const assemblies = has ? f.assemblies.filter((a) => a !== name) : [...f.assemblies, name];
      return {
        ...f,
        assemblies,
        assemblyName: assemblies[0] || f.assemblyName,
      };
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.designation === "ALC" && form.assemblies.length < 1) {
      setError("ALC users need at least one mapped assembly for punch boundaries.");
      return;
    }
    const url = editId ? `/api/admin/users/${editId}` : "/api/admin/users";
    const payload = {
      ...form,
      assemblyName: form.designation === "ALC" ? form.assemblies[0] || form.assemblyName : form.assemblyName,
      assemblies: form.designation === "ALC" ? form.assemblies : [],
    };
    const res = await fetch(url, {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    router.push("/admin/users");
  }

  async function uploadCsv(file: File) {
    setCsvMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/users/csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setCsvMsg(data.error || "CSV failed");
      return;
    }
    setCsvMsg(`Created ${data.created}, updated ${data.updated}${data.errors?.length ? `, ${data.errors.length} row errors` : ""}`);
  }

  const isAlc = form.designation === "ALC";

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Users</p>
      <h1 className="mb-5 text-2xl font-semibold">{editId ? "Edit user" : "Create user"}</h1>
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <form onSubmit={save} className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">{editId ? "Update details" : "Manual create"}</h2>
          {(
            [
              ["name", "Name"],
              ["phone", "Mobile number"],
              ["designation", "Designation"],
              ...(isAlc ? [] : ([["assemblyName", "Assembly Name"]] as const)),
              ["sectorAllotted", "Sector Allotted"],
              ["cluster", "Cluster"],
              ["zone", "Zone"],
              ["district", "District"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mt-3 block text-xs font-medium text-navy/60">
              {label}
              {key === "designation" ? (
                <select
                  value={form.designation}
                  onChange={(e) => {
                    const designation = e.target.value;
                    setForm({
                      ...form,
                      designation,
                      assemblies: designation === "ALC" ? form.assemblies : [],
                    });
                  }}
                  className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm"
                >
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form[key as keyof typeof form] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm"
                  required={key !== "cluster"}
                />
              )}
            </label>
          ))}

          {isAlc && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                Mapped assemblies ({form.assemblies.length} selected)
              </p>
              <p className="mt-1 text-xs text-navy/50">
                ALC can punch inside any selected assembly boundary. Outside all mapped assemblies = blocked.
              </p>
              <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-navy/10 bg-sand/30 p-2">
                {officialAssemblies.length ? (
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {officialAssemblies.map((a) => (
                      <label key={a} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/80">
                        <input type="checkbox" checked={form.assemblies.includes(a)} onChange={() => toggleAssembly(a)} />
                        <span className="truncate">{a}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-xs text-navy/45">Loading assembly list…</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">
            {editId ? "Update" : "Create"}
          </button>
        </form>

        <div className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">CSV upload</h2>
          <p className="mt-1 text-xs text-navy/50">
            Required: Sector Incharge Name, Sector Incharge Number, Assembly Name, Sector Allotted, Zone, District.
            Optional: Designation, Cluster, Assemblies (ALC only — pipe-separated e.g. Sahnewal|Ludhiana East).
          </p>
          <a
            href="/sample-users.csv"
            download
            className="mt-3 inline-flex rounded-xl border border-navy/10 px-3 py-2 text-sm font-semibold text-teal"
          >
            Download CSV template
          </a>
          <input
            type="file"
            accept=".csv"
            className="mt-3 w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadCsv(f);
            }}
          />
          {csvMsg && <p className="mt-2 text-sm text-navy/70">{csvMsg}</p>}
        </div>
      </div>
    </main>
  );
}

export default function CreateUserPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-navy/50">Loading…</main>}>
      <CreateUserForm />
    </Suspense>
  );
}
