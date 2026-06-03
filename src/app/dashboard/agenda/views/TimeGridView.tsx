"use client";

import { useEffect, useRef } from "react";
import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";
import {
  HOUR_PX,
  DAY_START_SCROLL_HOUR,
  addDays,
  estadoStyle,
  hhmm,
  isToday,
  layoutDayEvents,
  pad,
  sameDay,
  startOfDay,
  startOfWeek,
  WEEKDAYS_ES,
} from "../calendar-utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TimeGridView({
  view,
  anchor,
  citas,
  onSelect,
  onCreateAt,
}: {
  view: "dia" | "semana";
  anchor: Date;
  citas: AgendaCitaEnriquecida[];
  onSelect: (c: AgendaCitaEnriquecida) => void;
  onCreateAt: (d: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = view === "dia" ? [startOfDay(anchor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = DAY_START_SCROLL_HOUR * HOUR_PX;
  }, []);

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.round((y / HOUR_PX) * 60 / 15) * 15));
    const d = new Date(day);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    onCreateAt(d);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Encabezado de días */}
      <div className="flex border-b border-slate-200 bg-slate-50/60">
        <div className="w-14 shrink-0" />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div key={d.toISOString()} className="flex-1 border-l border-slate-100 px-2 py-2 text-center">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{WEEKDAYS_ES[(d.getDay() + 6) % 7]}</div>
              <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${today ? "bg-slate-800 text-white" : "text-slate-700"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grilla con scroll */}
      <div ref={scrollRef} className="relative max-h-[62vh] overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_PX }}>
          {/* Gutter de horas */}
          <div className="w-14 shrink-0">
            {HOURS.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1 text-[10px] text-slate-400">{h === 0 ? "" : `${pad(h)}:00`}</span>
              </div>
            ))}
          </div>

          {/* Columnas por día */}
          {days.map((day) => {
            const dayStart = startOfDay(day);
            const dayCitas = citas.filter((c) => sameDay(new Date(c.inicio_at), day));
            const positioned = layoutDayEvents(dayCitas, dayStart);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                onClick={(e) => handleColumnClick(day, e)}
                className={`relative flex-1 cursor-pointer border-l border-slate-100 ${today ? "bg-sky-50/30" : ""}`}
              >
                {/* líneas horarias */}
                {HOURS.map((h) => (
                  <div key={h} className="border-b border-slate-100" style={{ height: HOUR_PX }} />
                ))}
                {/* eventos */}
                {positioned.map((p) => {
                  const st = estadoStyle(p.cita.estado);
                  const ini = new Date(p.cita.inicio_at);
                  const fin = new Date(p.cita.fin_at);
                  return (
                    <button
                      key={p.cita.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(p.cita);
                      }}
                      style={{
                        top: p.topPx,
                        height: p.heightPx,
                        left: `calc(${p.leftPct}% + 2px)`,
                        width: `calc(${p.widthPct}% - 4px)`,
                      }}
                      className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ${st.block}`}
                    >
                      <div className="truncate font-semibold">{p.cita.titulo}</div>
                      <div className="truncate opacity-80">
                        {hhmm(ini)}–{hhmm(fin)}
                        {p.cita.cliente?.nombre || p.cita.contacto_nombre ? ` · ${p.cita.cliente?.nombre ?? p.cita.contacto_nombre}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
