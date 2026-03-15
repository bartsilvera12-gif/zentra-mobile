import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase no configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa();
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get("cliente_id");

    const supabase = getSupabase();
    let query = supabase
      .from("facturas")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });

    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa();
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const body = await request.json();
    const { cliente_id, numero_factura, fecha, fecha_vencimiento, monto, tipo, moneda } = body;

    if (!cliente_id?.trim()) {
      return NextResponse.json(errorResponse("cliente_id es obligatorio"), { status: 400 });
    }
    if (!numero_factura?.trim()) {
      return NextResponse.json(errorResponse("numero_factura es obligatorio"), { status: 400 });
    }
    if (!fecha) {
      return NextResponse.json(errorResponse("fecha es obligatoria"), { status: 400 });
    }
    if (monto == null || Number(monto) < 0) {
      return NextResponse.json(errorResponse("monto debe ser >= 0"), { status: 400 });
    }

    const fechaVenc = fecha_vencimiento || fecha;
    const insert = {
      empresa_id: auth.empresa_id,
      cliente_id: cliente_id.trim(),
      numero_factura: numero_factura.trim(),
      fecha,
      fecha_vencimiento: fechaVenc,
      monto: Number(monto),
      saldo: Number(monto),
      estado: "Pendiente",
      tipo: tipo === "contado" || tipo === "credito" || tipo === "suscripcion" ? tipo : "credito",
      moneda: moneda === "USD" ? "USD" : "GS",
    };

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("facturas")
      .insert([insert])
      .select()
      .single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    await emitEvent(EVENT_TYPES.factura_creada, { factura_id: data.id, cliente_id: data.cliente_id, monto: data.monto });

    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
