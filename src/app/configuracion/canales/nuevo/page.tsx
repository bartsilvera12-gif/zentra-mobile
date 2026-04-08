"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WhatsAppChannelForm } from "@/components/chat/WhatsAppChannelForm";
import { getMisModulos } from "@/lib/empresas/actions";

function hasOmnichannel(slugs: string[]) {
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

export default function NuevoCanalWhatsappPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    getMisModulos()
      .then((mods) => setAllowed(hasOmnichannel(mods.map((m) => m.slug))))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return <div className="py-24 text-center text-sm text-slate-400">Cargando…</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Módulo no habilitado.{" "}
        <Link href="/configuracion/canales" className="font-semibold underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracion" className="hover:text-slate-800">
          Configuración
        </Link>
        <span>/</span>
        <Link href="/configuracion/canales" className="hover:text-slate-800">
          Canales
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Conectar WhatsApp</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conectar WhatsApp (Meta)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Usá el <strong>Phone number ID</strong> que envía Meta en{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">metadata.phone_number_id</code> del webhook.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <WhatsAppChannelForm
          mode="create"
          cancelHref="/configuracion/canales"
          submitLabelCreate="Conectar y guardar"
          onSaved={(id) => router.push(`/configuracion/canales/${id}`)}
        />
      </section>

      <details className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        <summary className="font-medium cursor-pointer">Demo / variables de entorno</summary>
        <p className="mt-2 pl-1 text-sky-800/90">
          Opcional: <code className="text-xs">WHATSAPP_DEFAULT_EMPRESA_ID</code> y{" "}
          <code className="text-xs">WHATSAPP_PHONE_NUMBER_ID</code> en el servidor para aprovisionar el primer canal.
        </p>
      </details>
    </div>
  );
}
