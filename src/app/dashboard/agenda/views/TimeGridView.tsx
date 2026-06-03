"use client";

import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";
import {
  HOUR_PX,
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

export default function TimeGridView({
  view,
  anchor,
  citas,
  startHour,
  endHour,
  onSelect,
  onCreateAt,
}: {
  view: "dia" | "semana";
  anchor: Date;
  citas: AgendaCitaEnriquecida[];
  startHour: number;
  endHour: number;
  onSelect: (c: AgendaCitaEnriquecida) => void;
  onCreateAt: (d: Date) => void;
}) {
  const days = view === "dia" ? [startOfDay(anchor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  const gridHeight = hours.length * HOUR_PX;

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = startHour * 60 + (y / HOUR_PX) * 60;
    const minutes = Math.max(startHour * 60, Math.min(endHour * 60 - 15, Math.round(rawMin / 15) * 15));
    const d = new Date(day);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    onCreateAt(d);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-sm ring-1 ring-slate-100">
      {/* Encabezado de días */}
      <div className="flex border-b border-slate-300/80 bg-slate-50">
        <div className="w-14 shrink-0 border-r border-slate-200" />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div
              key={d.toISOString()}
              className={`flex-1 border-l border-slate-200 px-2 py-2 text-center ${today ? "bg-teal-50/70" : ""}`}
            >
              <div className={`text-[11px] font-medium uppercase tracking-wide ${today ? "text-teal-600" : "text-slate-400"}`}>
                {WEEKDAYS_ES[(d.getDay() + 6) % 7]}
              </div>
              <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${today ? "bg-teal-500 text-white shadow-sm" : "text-slate-700"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grilla con scroll */}
      <div className="relative max-h-[64vh] overflow-y-auto">
        <div className="flex" style={{ height: gridHeight }}>
          {/* Gutter de horas */}
          <div className="w-14 shrink-0 border-r border-slate-200 bg-slate-50/40">
            {hours.map((h) => (
              <div key={h} className="relative border-b border-slate-200/70" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 bg-slate-50/40 px-0.5 text-[10px] font-medium text-slate-500">{`${pad(h)}:00`}</span>
              </div>
            ))}
          </div>

          {/* Columnas por día */}
          {days.map((day) => {
            const dayStart = startOfDay(day);
            const dayCitas = citas.filter((c) => sameDay(new Date(c.inicio_at), day));
            const positioned = layoutDayEvents(dayCitas, dayStart, startHour, endHour);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                onClick={(e) => handleColumnClick(day, e)}
                className={`group relative flex-1 cursor-pointer border-l border-slate-200 transition-colors hover:bg-teal-50/20 ${today ? "bg-teal-50/40" : ""}`}
              >
                {/* líneas horarias + media hora */}
                {hours.map((h) => (
                  <div key={h} className="relative border-b border-slate-200" style={{ height: HOUR_PX }}>
                    <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-slate-100" />
                  </div>
                ))}
                {/* eventos */}
                {positioned.map((p) => {
                  const st = estadoStyle(p.cita.estado);
                  const ini = new Date(p.cita.inicio_at);
                  const fin = new Date(p.cita.fin_at);
                  const persona = p.cita.cliente?.nombre ?? p.cita.contacto_nombre;
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
                      className={`absolute overflow-hidden rounded-md border border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-black/5 ${st.block}`}
                    >
                      <div className="truncate font-semibold">{p.cita.titulo}</div>
                      <div className="truncate opacity-80">
                        {hhmm(ini)}–{hhmm(fin)}
                        {persona ? ` · ${persona}` : ""}
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
