/**
 * Montos de línea para `factura_items` alineados a SIFEN (IVA 10% incluido en el total en GS).
 * Misma lógica que `splitIvaIncluidoDesdeTotal` en `rde-xml.ts` (total / 1.1 → base).
 */

export function montosFacturaItemGsPrecioIncluyeIva10(totalLineaConIva: number): {
  subtotal: number;
  iva: number;
  total: number;
} {
  const T = Math.round(Math.max(0, Number(totalLineaConIva)));
  if (T <= 0) return { subtotal: 0, iva: 0, total: 0 };
  const subtotal = Math.round(T / 1.1);
  const iva = T - subtotal;
  return { subtotal, iva, total: T };
}

/**
 * Valores para insertar en `factura_items`.
 * GS: precio pactado incluye IVA 10% → descompone base / IVA / total.
 * USD: sin desglose IVA en ERP (el DE electrónico actual solo admite GS en `rde-xml`).
 */
export function montosFacturaItemParaInsert(input: {
  totalLinea: number;
  moneda: string;
  cantidad: number;
  precioUnitario: number;
}): { subtotal: number; iva: number; total: number; precio_unitario: number } {
  const c = Number(input.cantidad) > 0 ? Number(input.cantidad) : 1;
  const m = String(input.moneda || "GS").toUpperCase();
  const T = Math.round(Math.max(0, Number(input.totalLinea)));
  const puIn = Number(input.precioUnitario);

  if (m === "USD") {
    const precio_unitario = Number.isFinite(puIn) && puIn > 0 ? puIn : T / c;
    return { subtotal: T, iva: 0, total: T, precio_unitario };
  }

  const { subtotal, iva, total } = montosFacturaItemGsPrecioIncluyeIva10(T);
  const precio_unitario =
    Number.isFinite(puIn) && puIn > 0 ? puIn : c === 1 ? total : total / c;
  return { subtotal, iva, total, precio_unitario };
}
