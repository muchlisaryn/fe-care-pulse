"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/atoms/Button";


const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Kalender popup. Bisa memilih satu tanggal (date "YYYY-MM-DD")
 * atau merekap satu bulan penuh (month "YYYY-MM").
 */
export default function DatePicker({
  date,
  month,
  onPickDate,
  onPickMonth,
  onClear,
  className = "",
}: {
  date: string;
  month: string;
  onPickDate: (value: string) => void;
  onPickMonth: (value: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = date ? new Date(date) : month ? new Date(month + "-01") : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const total = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < first; i++) arr.push(null);
    for (let d = 1; d <= total; d++) arr.push(d);
    return arr;
  }, [view]);

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const viewMonthStr = `${view.y}-${pad(view.m + 1)}`;

  const label = date
    ? (() => {
        const d = new Date(date);
        return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
      })()
    : month
      ? `${BULAN[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
      : "Semua Tanggal";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        className="w-full justify-start gap-2 font-normal"
      >
        <span>📅</span>
        <span className={`flex-1 text-left ${date || month ? "" : "text-slate-400"}`}>{label}</span>
        <span className="text-slate-400">▾</span>
      </Button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => shift(-1)}>‹</Button>
            <span className="text-sm font-semibold">{BULAN[view.m]} {view.y}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => shift(1)}>›</Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {HARI.map((h) => (
              <div key={h} className="py-1 text-[11px] font-medium text-slate-400">{h}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const ds = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
              const selected = date === ds;
              const inSelectedMonth = month === viewMonthStr;
              const today = todayStr === ds;
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => {
                    onPickDate(ds);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-lg text-sm transition ${
                    selected
                      ? "bg-emerald-600 text-white font-semibold"
                      : inSelectedMonth
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : today
                          ? "ring-1 ring-emerald-400 text-emerald-700 hover:bg-emerald-50"
                          : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              onPickMonth(viewMonthStr);
              setOpen(false);
            }}
          >
            Rekap sebulan ({BULAN[view.m]} {view.y})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Semua / Hapus filter
          </Button>
        </div>
      )}
    </div>
  );
}
