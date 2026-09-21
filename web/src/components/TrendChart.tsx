import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui";

type Point = { date: string; sent: number; opened: number; clicked: number; files?: number; bounced?: number };
// Categorical order is fixed (validated for light + dark and color-vision deficiencies).
const SERIES = [
  { key: "sent", label: "Sent", color: "var(--s1)" },
  { key: "opened", label: "Opened", color: "var(--s2)" },
  { key: "clicked", label: "Clicked", color: "var(--s3)" },
] as const;

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function TrendChart({ data, height = 240 }: { data: Point[]; height?: number }) {
  const [table, setTable] = useState(false);
  const total = (k: keyof Point) => data.reduce((s, p) => s + Number(p[k] ?? 0), 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-[13px] text-ink-2" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2"><span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />{s.label} <span className="text-muted">{total(s.key).toLocaleString()}</span></li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" onClick={() => setTable((v) => !v)} aria-pressed={table}>{table ? "Show chart" : "Show table"}</Button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-line-2">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr>{["Date", ...SERIES.map((s) => s.label)].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-left text-xs font-semibold text-muted">{h}</th>)}</tr></thead>
            <tbody>{data.map((p) => <tr key={p.date} className="border-b border-line-2"><td className="px-3 py-1.5 text-ink-2">{day(p.date)}</td>{SERIES.map((s) => <td key={s.key} className="px-3 py-1.5 tabular-nums text-ink">{p[s.key]}</td>)}</tr>)}</tbody></table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`Daily sent, opened and clicked counts. Totals: ${SERIES.map((s) => `${s.label} ${total(s.key)}`).join(", ")}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--line-2)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} minTickGap={28} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: "var(--muted)", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 font-semibold text-ink">{day(String(label))}</div>
                    {SERIES.map((s) => { const v = payload.find((p) => p.dataKey === s.key)?.value; return <div key={s.key} className="flex items-center gap-2 text-ink-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}<span className="ml-auto pl-4 font-medium tabular-nums text-ink">{String(v ?? 0)}</span></div>; })}
                  </div>
                ) : null}
              />
              {SERIES.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
