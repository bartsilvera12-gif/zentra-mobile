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
    const facturaId = searchParams.get("factura_id");

    const supabase = getSupabase();
    let query = supabase
      .from("pagos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha_pago", { ascending: false });

    if (facturaId) {
      query = query.eq("factura_id", facturaId);
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
    const { factura_id, monto, fecha_pago, metodo_pago, referencia } = body;

    if (!factura_id?.trim()) {
      return NextResponse.json(errorResponse("factura_id es obligatorio"), { status: 400 });
    }
    if (monto == null || Number(monto) <= 0) {
      return NextResponse.json(errorResponse("monto debe ser mayor a 0"), { status: 400 });
    }
    if (!fecha_pago) {
      return NextResponse.json(errorResponse("fecha_pago es obligatoria"), { status: 400 });
    }

    const supabase = getSupabase();

    const { data: factura, error: errFactura } = await supabase
      .from("facturas")
      .select("id, monto, saldo, estado")
      .eq("id", factura_id)
      .eq("empresa_id", auth.empresa_id)
      .single();

    if (errFactura || !factura) {
      return NextResponse.json(errorResponse("Factura no encontrada"), { status: 404 });
    }

    const saldoActual = Number(factura.saldo);
    const montoNum = Number(monto);
    const nuevoSaldo = Math.max(0, saldoActual - montoNum);
    const nuevoEstado = nuevoSaldo <= 0 ? "Pagado" : "Pendiente";

    const metodosValidos = ["efectivo", "transferencia", "cheque", "tarjeta", "otro"];
    const metodo = metodosValidos.includes(metodo_pago) ? metodo_pago : "efectivo";

    const { data, error } = await supabase
      .from("pagos")
      .insert({
        empresa_id: auth.empresa_id,
        factura_id: factura_id.trim(),
        monto: montoNum,
        fecha_pago: fecha_pago,
        metodo_pago: metodo,
        referencia: referencia?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    await supabase
      .from("facturas")
      .update({ saldo: nuevoSaldo, estado: nuevoEstado })
      .eq("id", factura_id);

    await emitEvent(EVENT_TYPES.pago_registrado, { pago_id: data.id, factura_id, monto: montoNum });

    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
