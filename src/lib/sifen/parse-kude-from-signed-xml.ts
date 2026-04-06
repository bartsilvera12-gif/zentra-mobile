/**
 * Extrae datos legibles del rDE firmado (SIFEN v150) para armar el KuDE en PDF.
 * Solo lectura del XML; no altera firma ni envío SET.
 */
import { DOMParser } from "@xmldom/xmldom";
import type { Document, Element as XmlElement } from "@xmldom/xmldom";
import { SIFEN_EKUATIA_TARGET_NS } from "./sifen-xsi-schema-location";

const NS = SIFEN_EKUATIA_TARGET_NS;

export type KudeItemRow = {
  descripcion: string;
  cantidad: string;
  precioUnit: string;
  totalLinea: string;
};

export type KudeParsedFromXml = {
  cdc: string;
  dFeEmiDE: string;
  /** URL completa del QR (dCarQR) si existe en XML. */
  dCarQR: string | null;
  monedaCodigo: string;
  monedaDescripcion: string;
  timbrado: {
    dNumTim: string;
    dEst: string;
    dPunExp: string;
    dNumDoc: string;
  };
  emisor: {
    dRucEm: string;
    dDVEmi: string;
    dNomEmi: string;
    dDirEmi: string;
    dTelEmi: string;
    dEmailE: string;
  };
  receptor: {
    nombre: string;
    docLabel: string;
    docValue: string;
    direccion: string;
  };
  totales: {
    dTotGralOpe: string;
    dTotIVA: string;
    dTotOpe: string;
  };
  items: KudeItemRow[];
};

function textOf(el: XmlElement | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

function firstNs(parent: XmlElement | undefined, tag: string): XmlElement | undefined {
  if (!parent) return undefined;
  return parent.getElementsByTagNameNS(NS, tag)[0] as XmlElement | undefined;
}

function parseRdeRoot(doc: Document): XmlElement {
  const rde =
    (doc.getElementsByTagNameNS(NS, "rDE")[0] as XmlElement | undefined) ??
    (doc.documentElement?.localName === "rDE" ? (doc.documentElement as XmlElement) : undefined);
  if (!rde) throw new Error("rDE no encontrado");
  return rde;
}

/**
 * Parsea XML UTF-8 del documento firmado (incluye ds:Signature y opcionalmente gCamFuFD).
 */
export function parseKudeFromSignedRdeXml(xmlUtf8: string): KudeParsedFromXml {
  const doc = new DOMParser().parseFromString(xmlUtf8, "application/xml");
  const parseErr = doc.getElementsByTagName("parsererror")[0];
  if (parseErr) throw new Error("XML inválido (parsererror)");

  const rde = parseRdeRoot(doc);
  const de = firstNs(rde, "DE");
  if (!de) throw new Error("DE no encontrado");

  const idDe = de.getAttribute("Id")?.trim();
  if (!idDe) throw new Error("DE sin atributo Id (CDC)");
  const cdc = idDe;

  const gCamFuFD = firstNs(rde, "gCamFuFD");
  const dCarEl = gCamFuFD ? firstNs(gCamFuFD, "dCarQR") : undefined;
  const dCarQR = dCarEl ? textOf(dCarEl) : null;

  const gDatGralOpe = firstNs(de, "gDatGralOpe");
  if (!gDatGralOpe) throw new Error("gDatGralOpe no encontrado");
  const dFeEmiDE = textOf(firstNs(gDatGralOpe, "dFeEmiDE"));

  const gOpeCom = firstNs(gDatGralOpe, "gOpeCom");
  const monedaCodigo = gOpeCom ? textOf(firstNs(gOpeCom, "cMoneOpe")) || "PYG" : "PYG";
  const monedaDescripcion = gOpeCom ? textOf(firstNs(gOpeCom, "dDesMoneOpe")) : "";

  const gEmis = firstNs(gDatGralOpe, "gEmis");
  if (!gEmis) throw new Error("gEmis no encontrado");
  const emisor = {
    dRucEm: textOf(firstNs(gEmis, "dRucEm")),
    dDVEmi: textOf(firstNs(gEmis, "dDVEmi")),
    dNomEmi: textOf(firstNs(gEmis, "dNomEmi")),
    dDirEmi: textOf(firstNs(gEmis, "dDirEmi")),
    dTelEmi: textOf(firstNs(gEmis, "dTelEmi")),
    dEmailE: textOf(firstNs(gEmis, "dEmailE")),
  };

  const gDatRec = firstNs(gDatGralOpe, "gDatRec");
  if (!gDatRec) throw new Error("gDatRec no encontrado");
  const iNatRec = textOf(firstNs(gDatRec, "iNatRec"));
  let docLabel = "";
  let docValue = "";
  if (iNatRec === "1") {
    docLabel = "RUC";
    const ruc = textOf(firstNs(gDatRec, "dRucRec"));
    const dv = textOf(firstNs(gDatRec, "dDVRec"));
    docValue = dv ? `${ruc}-${dv}` : ruc;
  } else {
    docLabel = textOf(firstNs(gDatRec, "dDTipIDRec")) || "Documento";
    docValue = textOf(firstNs(gDatRec, "dNumIDRec"));
  }
  const receptor = {
    nombre: textOf(firstNs(gDatRec, "dNomRec")),
    docLabel,
    docValue,
    direccion: textOf(firstNs(gDatRec, "dDirRec")),
  };

  const gTimb = firstNs(de, "gTimb");
  if (!gTimb) throw new Error("gTimb no encontrado");
  const timbrado = {
    dNumTim: textOf(firstNs(gTimb, "dNumTim")),
    dEst: textOf(firstNs(gTimb, "dEst")),
    dPunExp: textOf(firstNs(gTimb, "dPunExp")),
    dNumDoc: textOf(firstNs(gTimb, "dNumDoc")),
  };

  const gTotSub = firstNs(de, "gTotSub");
  if (!gTotSub) throw new Error("gTotSub no encontrado");
  const totales = {
    dTotGralOpe: textOf(firstNs(gTotSub, "dTotGralOpe")) || "0",
    dTotIVA: textOf(firstNs(gTotSub, "dTotIVA")) || "0",
    dTotOpe: textOf(firstNs(gTotSub, "dTotOpe")) || "0",
  };

  const gDtipDE = firstNs(de, "gDtipDE");
  const items: KudeItemRow[] = [];
  if (gDtipDE) {
    const nodes = gDtipDE.getElementsByTagNameNS(NS, "gCamItem");
    for (let i = 0; i < nodes.length; i++) {
      const it = nodes[i] as XmlElement;
      const descripcion = textOf(firstNs(it, "dDesProSer"));
      const cantidad = textOf(firstNs(it, "dCantProSer"));
      const gVi = firstNs(it, "gValorItem");
      const precioUnit = textOf(firstNs(gVi ?? it, "dPUniProSer"));
      const gVr = gVi ? firstNs(gVi, "gValorRestaItem") : undefined;
      const totalLinea = textOf(firstNs(gVr ?? gVi ?? it, "dTotOpeItem"));
      items.push({ descripcion, cantidad, precioUnit, totalLinea });
    }
  }

  return {
    cdc,
    dFeEmiDE,
    dCarQR: dCarQR && dCarQR.length > 0 ? dCarQR : null,
    monedaCodigo,
    monedaDescripcion,
    timbrado,
    emisor,
    receptor,
    totales,
    items,
  };
}

/** URL de consulta mínima si el XML no trae `dCarQR` (especificación solicitada). */
export function kudeFallbackQrUrl(cdc: string): string {
  const id = encodeURIComponent(cdc);
  return `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&id=${id}`;
}
