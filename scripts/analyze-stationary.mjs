import { readFileSync } from "fs";

const text = readFileSync("data/stationary-sessions-7d.csv", "utf8").replace(/^\uFEFF/, "");
const lines = text.trim().split(/\r?\n/);
const hdr = lines[0].split(",");

function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return Object.fromEntries(hdr.map((h, i) => [h, out[i] ?? ""]));
}

const rows = lines.slice(1).map(parseLine);
const byDay = {};
const byUser = {};

for (const r of rows) {
  byDay[r.Date] = (byDay[r.Date] || 0) + 1;
  const k = `${r.Phone}|${r.Name}`;
  if (!byUser[k])
    byUser[k] = { name: r.Name, phone: r.Phone, assembly: r.Assembly, sessions: 0, zeroTravel: 0, maxHours: 0 };
  byUser[k].sessions++;
  const h = parseFloat(r.Hours) || 0;
  byUser[k].maxHours = Math.max(byUser[k].maxHours, h);
  if (r["Travel (m)"] === "0") byUser[k].zeroTravel++;
}

console.log("Total sessions:", rows.length);
console.log("Unique users:", Object.keys(byUser).length);
console.log("By day:", byDay);

const top = Object.values(byUser)
  .sort((a, b) => b.zeroTravel - a.zeroTravel || b.sessions - a.sessions)
  .slice(0, 20);
console.log("\nTop 20 — most 0m-travel same-location sessions:");
for (const u of top)
  console.log(`${u.name} | ${u.phone} | ${u.assembly} | ${u.sessions} sessions | 0m: ${u.zeroTravel} | max ${u.maxHours.toFixed(1)}h`);

const longDay = rows
  .filter((r) => parseFloat(r.Hours) >= 6 && r["Travel (m)"] === "0")
  .sort((a, b) => parseFloat(b.Hours) - parseFloat(a.Hours))
  .slice(0, 15);
console.log("\nLong shifts (6h+) with 0m travel:");
for (const r of longDay)
  console.log(`${r.Date} | ${r.Name} | ${r.Assembly} | ${r.Hours}h | ${r["Punch In"]} → ${r["Punch Out"]} | ${r["Punch out reason"]}`);
