/**
 * Cliente técnico: envío de lote asíncrono a SIFEN TEST (recibe-lote).
 *
 * Alineado al binding oficial `rEnvioLote` / `rResEnviLoteDe`
 * (namespace http://ekuatia.set.gov.py/sifen/xsd), mismo criterio que la lib
 * de referencia Python `sifen` (kmee): `xDE` = Base64 del XML del lote en UTF-8.
 *
 * TLS mutuo: certificado/clave en PEM extraídos del .p12 de la empresa (igual que firma).
 */
import * as https from "node:https";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";
import type { AmbienteSifen } from "./types";
import { extractKeyAndCertFromP12 } from "./sign-xml";

const SIFEN_NS = "http://ekuatia.set.gov.py/sifen/xsd";
const SOAP_ENV = "http://www.w3.org/2003/05/soap-envelope";

/** URL del servicio (no la URL del WSDL con ?wsdl). */
export const SIFEN_TEST_RECEP_LOTE_SERVICE_URL =
  "https://sifen-test.set.gov.py/de/ws/async/recibe-lote";

/** SOAP 1.2: acción sugerida (algunos stacks la ignoran). */
const SOAP_ACTION_RECEP_LOTE =
  "http://ekuatia.set.gov.py/sifen/xsd/SiRecepLoteDE/recepcionLote";

export interface EmpresaConfigEnvioLoteTest {
  /** Solo se usa `test` en esta función. */
  ambiente?: AmbienteSifen;
  certificadoP12: Buffer;
  certificadoPassword: string;
}

export interface EnviarLoteSifenTestParams {
  xmlFirmado: string;
  empresaConfig: EmpresaConfigEnvioLoteTest;
  /** Trazabilidad local; no se envía en el SOAP. */
  facturaElectronicaId?: string;
  /** Identificador de control de envío (dId). Si no se indica, se genera. */
  dId?: number;
  /**
   * Si true, envuelve el XML firmado en `<rLoteDE xmlns="...">...</rLoteDE>` con `<?xml encoding="UTF-8"?>`.
   * El endpoint `enviar-test` lo activa; sin envoltorio se envía solo `<rDE>...</rDE>` (sin prolog), lo que a veces provoca 0160 en SET.
   */
  envoltorioRloteDe?: boolean;
  /**
   * Si true, aplica gzip al UTF-8 del lote antes del Base64.
   * Por defecto false (mismo criterio que `sifen` PyPI).
   */
  comprimirLoteGzip?: boolean;
}

export interface RecibeLoteRespuestaParsed {
  dCodRes: string | null;
  dMsgRes: string | null;
  dProtConsLote: string | null;
  dFecProc: string | null;
  dTpoProces: number | null;
  /** true si el lote fue recibido / encolado (código oficial 0300). */
  loteRecibido: boolean;
  /** true si no fue encolado (código oficial 0301). */
  loteNoEncolado: boolean;
  httpStatus: number;
  cuerpoSoapCrudo: string;
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\uFEFF?/, "").replace(/^<\?xml[^?]*\?>\s*/i, "").trim();
}

function construirXmlLoteRloteDe(xmlFirmado: string): string {
  const inner = stripXmlDeclaration(xmlFirmado);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rLoteDE xmlns="${SIFEN_NS}">\n${inner}\n</rLoteDE>\n`
  );
}

function generarDId(): number {
  const mod = BigInt("999999999999999");
  let n = Number(BigInt(Date.now()) % mod);
  if (!Number.isFinite(n) || n < 1) n = 1;
  return n;
}

function bytesParaXdeBase64(xmlLoteUtf8: string, comprimirGzip: boolean): string {
  let buf = Buffer.from(xmlLoteUtf8, "utf-8");
  if (comprimirGzip) buf = gzipSync(buf);
  return buf.toString("base64");
}

function construirSoapRecibeLote(dId: number, xdeBase64: string): string {
  const xdeEscapado = xdeBase64.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${SOAP_ENV}" xmlns:xsd="${SIFEN_NS}">` +
    `<soap12:Header/>` +
    `<soap12:Body>` +
    `<xsd:rEnvioLote>` +
    `<xsd:dId>${dId}</xsd:dId>` +
    `<xsd:xDE>${xdeEscapado}</xsd:xDE>` +
    `</xsd:rEnvioLote>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

/** Extrae texto de un elemento hoja en respuesta SOAP (prefijo opcional). */
function extraerTextoElemento(xml: string, local: string): string | null {
  const re = new RegExp(
    `<(?:[^\\s/>:]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[^\\s/>:]+:)?${local}\\b[^>]*>`,
    "i"
  );
  const m = xml.match(re);
  if (!m?.[1]) return null;
  const inner = m[1].replace(/<[^>]+>/g, "").trim();
  return inner.length > 0 ? inner : null;
}

function parsearRespuestaRecibeLote(xml: string): Omit<
  RecibeLoteRespuestaParsed,
  "httpStatus" | "loteRecibido" | "loteNoEncolado"
> {
  if (/<parsererror\b/i.test(xml) || /<faultstring>/i.test(xml)) {
    const fault = extraerTextoElemento(xml, "faultstring");
    return {
      dCodRes: null,
      dMsgRes: fault ?? "Respuesta SOAP no parseable o Fault",
      dProtConsLote: null,
      dFecProc: null,
      dTpoProces: null,
      cuerpoSoapCrudo: xml,
    };
  }

  const dCodRes = extraerTextoElemento(xml, "dCodRes");
  const dTpoStr = extraerTextoElemento(xml, "dTpoProces");
  let dTpoProces: number | null = null;
  if (dTpoStr != null && dTpoStr !== "") {
    const n = Number(dTpoStr);
    dTpoProces = Number.isFinite(n) ? n : null;
  }

  return {
    dCodRes,
    dMsgRes: extraerTextoElemento(xml, "dMsgRes"),
    dProtConsLote: extraerTextoElemento(xml, "dProtConsLote"),
    dFecProc: extraerTextoElemento(xml, "dFecProc"),
    dTpoProces,
    cuerpoSoapCrudo: xml,
  };
}

function postHttpsMtls(
  urlStr: string,
  body: string,
  certPem: string,
  keyPem: string
): Promise<{ status: number; body: string }> {
  const url = new URL(urlStr);
  const port = url.port ? Number(url.port) : 443;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        cert: certPem,
        key: keyPem,
        rejectUnauthorized: true,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${SOAP_ACTION_RECEP_LOTE}"`,
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (ch) => chunks.push(ch as Buffer));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.write(body, "utf8");
    req.end();
  });
}

/**
 * Envía un DE firmado en lote de un solo documento al ambiente de pruebas SIFEN (recibe-lote).
 * Requiere certificado de cliente válido para el TEST (mismo .p12 que para firmar).
 */
export async function enviarLoteSifenTest(
  params: EnviarLoteSifenTestParams
): Promise<RecibeLoteRespuestaParsed> {
  const ambiente = params.empresaConfig.ambiente ?? "test";
  if (ambiente !== "test") {
    throw new Error(
      "enviarLoteSifenTest solo opera contra SIFEN TEST; para producción habrá que usar otra URL y revisar políticas."
    );
  }

  const dId = params.dId ?? generarDId();
  const envoltorio = params.envoltorioRloteDe === true;
  const xmlLote = envoltorio
    ? construirXmlLoteRloteDe(params.xmlFirmado)
    : stripXmlDeclaration(params.xmlFirmado);

  if (process.env.SIFEN_DEBUG_LOTE_XML === "1") {
    const head = xmlLote.slice(0, 4000);
    const tail = xmlLote.length > 4000 ? xmlLote.slice(-800) : "";
    console.info(
      `[SIFEN_DEBUG_LOTE_XML] bytes_utf8=${Buffer.byteLength(xmlLote, "utf8")} chars=${xmlLote.length} envoltorio_rLoteDE=${envoltorio}\n--- head ---\n${head}\n--- tail ---\n${tail}`
    );
  }

  const xde = bytesParaXdeBase64(xmlLote, params.comprimirLoteGzip === true);
  const soap = construirSoapRecibeLote(dId, xde);

  const { privateKeyPem, certificatePem } = extractKeyAndCertFromP12(
    params.empresaConfig.certificadoP12,
    params.empresaConfig.certificadoPassword
  );

  let httpStatus: number;
  let cuerpo: string;
  try {
    const res = await postHttpsMtls(
      SIFEN_TEST_RECEP_LOTE_SERVICE_URL,
      soap,
      certificatePem,
      privateKeyPem
    );
    httpStatus = res.status;
    cuerpo = res.body;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Fallo HTTPS/mTLS contra SIFEN TEST: ${msg}`);
  }

  const parsed = parsearRespuestaRecibeLote(cuerpo);
  const code = parsed.dCodRes?.trim() ?? "";

  return {
    ...parsed,
    httpStatus,
    loteRecibido: code === "0300",
    loteNoEncolado: code === "0301",
    cuerpoSoapCrudo: cuerpo,
  };
}
