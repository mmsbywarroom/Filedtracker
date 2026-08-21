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
  const [error, setError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

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
        setForm({
          name: u.name,
          phone: u.phone,
          designation: u.designation || "Sector Incharge",
          assemblyName: u.assemblyName,
          sectorAllotted: u.sectorAllotted,
          zone: u.zone,
          district: u.district,
          cluster: u.cluster || "",
        });
      }
    })();
  }, [editId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const url = editId ? `/api/admin/users/${editId}` : "/api/admin/users";
    const res = await fetch(url, {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
              ["assemblyName", "Assembly Name"],
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
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
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
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm"
                  required={key !== "cluster"}
                />
              )}
            </label>
          ))}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">
            {editId ? "Update" : "Create"}
          </button>
        </form>

        <div className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">CSV upload</h2>
          <p className="mt-1 text-xs text-navy/50">
            Required columns: Sector Incharge Name, Sector Incharge Number, Assembly Name, Sector Allotted, Zone, District.
            Optional: Designation, Cluster.
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
