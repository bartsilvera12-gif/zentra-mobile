"use client";

import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";

/**
 * Vista mobile interim para Conversaciones omnicanal.
 *
 * El módulo desktop tiene 3361 líneas: realtime de mensajes, transferencias, media,
 * voice notes, borradores, plantillas y muchísimas acciones. Construirlo bien para
 * mobile requiere una sesión dedicada de diseño + desarrollo.
 *
 * Por ahora: vista honesta que explica la situación y deriva a desktop. Si necesitás
 * responder un chat en movimiento, abrí desde la computadora.
 */
export default function ConversacionesMobile() {
  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Chats</h1>
        <p className="mt-0.5 text-xs text-slate-500">Conversaciones omnicanal</p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9]">
          <MessageCircle className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">Chat mobile en construcción</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          La bandeja omnicanal con respuestas en tiempo real, audio, imágenes y plantillas es
          uno de los módulos más complejos del ERP. Estamos diseñando una experiencia mobile
          dedicada para responder con el pulgar.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Mientras tanto, podés abrir tu inbox desde la computadora.
        </p>
      </div>

      {/* Atajos a vistas relacionadas que sí están en mobile */}
      <div className="mt-4 space-y-2">
        <Link
          href="/dashboard/campanas"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 transition-colors active:bg-slate-50"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Campañas</p>
            <p className="text-[11px] text-slate-500">Lanzar broadcasts a tus contactos</p>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" />
        </Link>
        <Link
          href="/dashboard/agenda"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 transition-colors active:bg-slate-50"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Agenda</p>
            <p className="text-[11px] text-slate-500">Tus citas y compromisos del día</p>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" />
        </Link>
      </div>
    </div>
  );
}
