"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ConfiguracionCanalesPage from "@/app/dashboard/conversaciones/configuracion/page";
import { getMisModulos } from "@/lib/empresas/actions";

function hasOmnichannel(slugs: string[]) {
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

export default function ConfiguracionConversacionesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    getMisModulos()
      .then((mods) => setAllowed(hasOmnichannel(mods.map((m) => m.slug))))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return <div className="text-sm text-slate-500">Cargando configuración de conversaciones...</div>;
  }
  if (!allowed) {
    return (
      <div className="max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Tu empresa no tiene habilitado el módulo de Conversaciones/Omnicanal.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        <span className="font-medium">Vista recomendada: </span>
        <Link href="/configuracion/canales" className="font-semibold text-[#0284C7] hover:underline">
          Canales y comunicación
        </Link>
        <span className="text-sky-800/80"> — listado en cards y edición por ruta.</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-800">Configuración Global · Conversaciones / WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gestioná canal, pasos del flujo, bloques del mensaje y automatización omnicanal.
        </p>
        <div className="mt-3">
          <Link href="/configuracion/conversaciones/flujos" className="text-sm font-medium text-[#0EA5E9] hover:underline">
            Abrir configuración de flujos
          </Link>
        </div>
      </div>
      <ConfiguracionCanalesPage />
    </div>
  );
}
