/**
 * Genera buffer PDF tipo KuDE (representación gráfica del DE aprobado).
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { KudeParsedFromXml } from "./parse-kude-from-signed-xml";

export type BuildKudePdfInput = {
  parsed: KudeParsedFromXml;
  /** Número de factura interno (ERP) para encabezado. */
  numeroFactura: string;
  dProtAut: string | null;
  qrUrl: string;
};

function formatMonto(nStr: string, moneda: string): string {
  const n = Number.parseFloat(nStr.replace(",", "."));
  if (!Number.isFinite(n)) return nStr;
  if (moneda === "PYG" || moneda === "GS") {
    return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
  }
  return n.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeLogoPath(): string | null {
  const p = path.join(process.cwd(), "public", "logo-neura.png");
  try {
    if (fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

export async function buildKudePdfBuffer(input: BuildKudePdfInput): Promise<Buffer> {
  const { parsed, numeroFactura, dProtAut, qrUrl } = input;
  const logoPath = safeLogoPath();

  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 160,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `KuDE — Factura ${numeroFactura}`,
        Author: "Neura ERP",
      },
    });
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const left = doc.x;

    if (logoPath) {
      try {
        doc.image(logoPath, left, doc.y, { width: 140 });
      } catch {
        /* sin logo */
      }
    }
    doc.y = doc.y + (logoPath ? 52 : 0);

    doc.fontSize(16).fillColor("#0f172a").text("Factura electrónica — KuDE", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#16a34a").text("Documento aprobado por SIFEN / SET", { align: "center" });
    doc.moveDown(1);
    doc.fillColor("#0f172a");

    doc.fontSize(9).text(`Factura Nº ${numeroFactura}`, { continued: false });
    doc.text(
      `Timbrado: ${parsed.timbrado.dNumTim}  Est.: ${parsed.timbrado.dEst}  Exp.: ${parsed.timbrado.dPunExp}  Nro.: ${parsed.timbrado.dNumDoc}`
    );
    doc.text(`Fecha y hora de emisión (DE): ${parsed.dFeEmiDE}`);
    doc.moveDown(0.8);

    doc.fontSize(11).text("Emisor", { underline: true });
    doc.fontSize(9);
    doc.text(`${parsed.emisor.dNomEmi}`);
    doc.text(`RUC: ${parsed.emisor.dRucEm}-${parsed.emisor.dDVEmi}`);
    doc.text(`Dirección: ${parsed.emisor.dDirEmi}`);
    doc.text(`Tel.: ${parsed.emisor.dTelEmi}  Email: ${parsed.emisor.dEmailE}`);
    doc.moveDown(0.6);

    doc.fontSize(11).text("Receptor", { underline: true });
    doc.fontSize(9);
    doc.text(`${parsed.receptor.nombre}`);
    doc.text(`${parsed.receptor.docLabel}: ${parsed.receptor.docValue}`);
    if (parsed.receptor.direccion) doc.text(`Dirección: ${parsed.receptor.direccion}`);
    doc.moveDown(0.8);

    doc.fontSize(11).text("Detalle", { underline: true });
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const colDesc = left;
    const colCant = pageW - 48 - 220;
    const colPu = pageW - 48 - 150;
    const colTot = pageW - 48 - 70;

    doc.fontSize(8).fillColor("#64748b");
    doc.text("Descripción", colDesc, tableTop, { width: colCant - colDesc - 8 });
    doc.text("Cant.", colCant, tableTop, { width: 40, align: "right" });
    doc.text("P. unit.", colPu, tableTop, { width: 55, align: "right" });
    doc.text("Total", colTot, tableTop, { width: 60, align: "right" });
    doc.fillColor("#0f172a");
    let y = tableTop + 14;
    doc.moveTo(left, y - 4).lineTo(pageW - 48, y - 4).strokeColor("#e2e8f0").stroke();

    doc.fontSize(8);
    for (const row of parsed.items) {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = 48;
      }
      const desc = row.descripcion || "—";
      doc.text(desc, colDesc, y, { width: colCant - colDesc - 8, lineGap: 1 });
      doc.text(row.cantidad || "—", colCant, y, { width: 40, align: "right" });
      doc.text(formatMonto(row.precioUnit, parsed.monedaCodigo), colPu, y, { width: 55, align: "right" });
      doc.text(formatMonto(row.totalLinea, parsed.monedaCodigo), colTot, y, { width: 60, align: "right" });
      y += Math.max(22, doc.heightOfString(desc, { width: colCant - colDesc - 8 }) + 6);
    }

    doc.y = y + 8;
    doc.moveTo(left, doc.y).lineTo(pageW - 48, doc.y).strokeColor("#cbd5e1").stroke();
    doc.moveDown(0.5);

    doc.fontSize(10);
    doc.text(`Subtotal operación: ${formatMonto(parsed.totales.dTotOpe, parsed.monedaCodigo)}`);
    doc.text(`IVA: ${formatMonto(parsed.totales.dTotIVA, parsed.monedaCodigo)}`);
    doc.fontSize(12).text(`Total: ${formatMonto(parsed.totales.dTotGralOpe, parsed.monedaCodigo)}`, {
      continued: false,
    });
    if (parsed.monedaDescripcion) {
      doc.fontSize(8).fillColor("#64748b").text(`Moneda: ${parsed.monedaDescripcion} (${parsed.monedaCodigo})`);
      doc.fillColor("#0f172a");
    }

    doc.moveDown(1);
    doc.fontSize(8).text(`CDC: ${parsed.cdc}`, { width: pageW - 96 });
    if (dProtAut) {
      doc.text(`dProtAut (autorización SET): ${dProtAut}`);
    }

    doc.moveDown(0.8);
    const qrY = doc.y;
    doc.image(qrPng, left, qrY, { width: 100, height: 100 });
    doc.fontSize(7).fillColor("#64748b").text("Consulta QR e-kuatia / SET", left, qrY + 106, {
      width: 200,
    });
    doc.y = qrY + 130;
    doc.fillColor("#0f172a");

    doc.fontSize(7).fillColor("#94a3b8").text(
      "Generado con Neura ERP — representación gráfica del documento electrónico.",
      48,
      doc.page.height - 56,
      {
        align: "center",
        width: pageW - 96,
      }
    );

    doc.end();
  });
}
