"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, RefreshCw, AlertTriangle } from "lucide-react";

interface ByTagRow {
  tag_code: string;
  tag_label: string;
  n: number;
}

interface SnapshotRow {
  history_id: string;
  conversation_id: string;
  contact_id: string | null;
  tag_code: string;
  tag_label: string;
  phone_masked: string | null;
  contact_name: string | null;
  last_message_at: string | null;
  current_node_code: string | null;
  days_idle: number | null;
  purchase_condition: string | null;
  category: string | null;
  run_key: string | null;
  created_at: string | null;
}

interface SnapshotResponse {
  ok: boolean;
  error?: string;
  dry_run_only?: boolean;
  wrote_changes?: false;
  filters?: Record<string, unknown>;
  pagination?: { limit: number; offset: number; total: number };
  by_tag?: ByTagRow[];
  rows?: SnapshotRow[];
}

interface ConversationPreviewMessage {
  id: string;
  from_me: boolean;
  sender_type: string | null;
  message_type: string | null;
  content: string | null;
  created_at: string | null;
  whatsapp_delivery_status: string | null;
}

interface ConversationPreviewResponse {
  ok: boolean;
  error?: string;
  conversation?: {
    conversation_id: string;
    status: string | null;
    flow_status: string | null;
    flow_current_node: string | null;
    human_taken_over: boolean;
    last_message_at: string | null;
    hidden_by_tag: boolean;
    current_tag_id: string | null;
    contact: {
      contact_id: string | null;
      name: string | null;
      phone_masked: string | null;
    };
  };
  messages?: ConversationPreviewMessage[];
  message_count?: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

const TAG_COLOR: Record<string, string> = {
  compro_varias: "bg-emerald-700/30 text-emerald-200 ring-1 ring-emerald-500/40",
  compro_boleta: "bg-emerald-700/20 text-emerald-200 ring-1 ring-emerald-500/30",
  comprobante_pendiente: "bg-amber-700/30 text-amber-200 ring-1 ring-amber-500/40",
  datos_incompletos: "bg-slate-700/40 text-slate-200 ring-1 ring-slate-500/40",
  no_compro: "bg-rose-700/30 text-rose-200 ring-1 ring-rose-500/40",
};

function tagPillClass(code: string): string {
  return TAG_COLOR[code] ?? "bg-slate-700/30 text-slate-200 ring-1 ring-slate-500/30";
}

export default function EtiquetasClient() {
  // Filtros
  const [tagCode, setTagCode] = useState("");
  const [phone, setPhone] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentNode, setCurrentNode] = useState("");
  const [runKey, setRunKey] = useState("");

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Data
  const [byTag, setByTag] = useState<ByTagRow[]>([]);
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [modalConvId, setModalConvId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ConversationPreviewResponse | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (tagCode) sp.set("tag_code", tagCode);
    if (phone) sp.set("phone", phone);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    if (currentNode) sp.set("current_node_code", currentNode);
    if (runKey) sp.set("run_key", runKey);
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    return sp.toString();
  }, [tagCode, phone, dateFrom, dateTo, currentNode, runKey, limit, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/tags/snapshot?${queryString}`, { cache: "no-store" });
      const json: SnapshotResponse = await res.json();
      if (!json.ok) {
        setError(json.error || "Error al cargar");
        setRows([]);
        setByTag([]);
        setTotal(0);
        return;
      }
      setRows(json.rows ?? []);
      setByTag(json.by_tag ?? []);
      setTotal(json.pagination?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = useCallback(async (conversationId: string) => {
    setModalConvId(conversationId);
    setModalData(null);
    setModalError(null);
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/chat/tags/conversation-preview?conversation_id=${encodeURIComponent(conversationId)}&limit=50`,
        { cache: "no-store" }
      );
      const json: ConversationPreviewResponse = await res.json();
      if (!json.ok) {
        setModalError(json.error || "Error al cargar conversación");
      } else {
        setModalData(json);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setModalLoading(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setModalConvId(null);
    setModalData(null);
    setModalError(null);
  }, []);

  const resetFilters = useCallback(() => {
    setTagCode("");
    setPhone("");
    setDateFrom("");
    setDateTo("");
    setCurrentNode("");
    setRunKey("");
    setOffset(0);
  }, []);

  const grandTotal = useMemo(() => byTag.reduce((acc, r) => acc + r.n, 0), [byTag]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Etiquetas Automáticas</h1>
          <p className="text-sm text-slate-400 mt-1">
            Visualización read-only del snapshot shadow. La configuración de
            reglas vive en Configuración → Canales → WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-amber-900/30 ring-1 ring-amber-500/30 px-3 py-2 text-amber-200 text-xs">
          <AlertTriangle size={14} />
          <span>Modo shadow/read-only. No oculta conversaciones.</span>
        </div>
      </header>

      {/* Cards por etiqueta */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="rounded-md bg-slate-900 ring-1 ring-slate-700 p-3">
          <div className="text-xs text-slate-400">Total snapshot</div>
          <div className="text-2xl font-semibold mt-1">{grandTotal.toLocaleString("es-PY")}</div>
        </div>
        {byTag.map((t) => (
          <button
            key={t.tag_code}
            onClick={() => { setTagCode(t.tag_code === tagCode ? "" : t.tag_code); setOffset(0); }}
            className={`rounded-md p-3 text-left transition ring-1 ${
              tagCode === t.tag_code
                ? "bg-slate-800 ring-emerald-500/60"
                : "bg-slate-900 ring-slate-700 hover:ring-slate-500"
            }`}
            type="button"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400">{t.tag_label || t.tag_code}</div>
            <div className="text-2xl font-semibold mt-1">{t.n.toLocaleString("es-PY")}</div>
            <div className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] ${tagPillClass(t.tag_code)}`}>
              {t.tag_code}
            </div>
          </button>
        ))}
      </section>

      {/* Filtros */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Etiqueta</label>
          <select
            value={tagCode}
            onChange={(e) => { setTagCode(e.target.value); setOffset(0); }}
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {byTag.map((t) => (
              <option key={t.tag_code} value={t.tag_code}>{t.tag_label || t.tag_code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Teléfono (parcial)</label>
          <input
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setOffset(0); }}
            placeholder="ej. 280911"
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nodo actual</label>
          <input
            value={currentNode}
            onChange={(e) => { setCurrentNode(e.target.value); setOffset(0); }}
            placeholder="ej. compra_realizada"
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">run_key</label>
          <input
            value={runKey}
            onChange={(e) => { setRunKey(e.target.value); setOffset(0); }}
            placeholder="opcional"
            className="w-full rounded-md bg-slate-900 ring-1 ring-slate-700 px-2 py-1.5 text-sm font-mono"
          />
        </div>
      </section>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-sm"
          type="button"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recargar
        </button>
        <button
          onClick={resetFilters}
          className="rounded-md bg-slate-800 hover:bg-slate-700 ring-1 ring-slate-700 px-3 py-1.5 text-sm"
          type="button"
        >
          Limpiar filtros
        </button>
        <div className="ml-auto text-xs text-slate-400">
          {loading ? "Cargando…" : `Mostrando ${rows.length} de ${total.toLocaleString("es-PY")}`}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-900/30 ring-1 ring-rose-500/40 p-3 mb-3 text-sm text-rose-200">{error}</div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md ring-1 ring-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Etiqueta</th>
              <th className="text-left px-3 py-2">Contacto</th>
              <th className="text-left px-3 py-2">Teléfono</th>
              <th className="text-left px-3 py-2">Nodo</th>
              <th className="text-left px-3 py-2">Días inactivo</th>
              <th className="text-left px-3 py-2">Último msg</th>
              <th className="text-left px-3 py-2">Snapshot</th>
              <th className="text-right px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Sin resultados.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.history_id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${tagPillClass(r.tag_code)}`}>
                    {r.tag_label || r.tag_code}
                  </span>
                </td>
                <td className="px-3 py-2">{r.contact_name || <span className="text-slate-500">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.phone_masked || "—"}</td>
                <td className="px-3 py-2 text-slate-300">{r.current_node_code || "—"}</td>
                <td className="px-3 py-2">{r.days_idle != null ? `${r.days_idle}d` : "—"}</td>
                <td className="px-3 py-2 text-slate-400">{formatDate(r.last_message_at)}</td>
                <td className="px-3 py-2 text-slate-400">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => openModal(r.conversation_id)}
                    className="inline-flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 ring-1 ring-slate-700 p-1.5"
                    title="Ver últimos mensajes"
                  >
                    <Search size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación simple */}
      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
        <span>Offset: {offset}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset(offset + limit)}
            className="rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Modal */}
      {modalConvId && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-slate-900 ring-1 ring-slate-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 p-4 border-b border-slate-800">
              <div>
                <div className="text-sm font-semibold">
                  {modalData?.conversation?.contact?.name || "Conversación"}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {modalData?.conversation?.contact?.phone_masked || modalConvId.slice(0, 8)}
                  {modalData?.conversation?.flow_current_node ? ` · nodo: ${modalData.conversation.flow_current_node}` : ""}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md bg-slate-800 hover:bg-slate-700 p-1.5"
                type="button"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {modalLoading && <div className="text-center text-slate-400 text-sm">Cargando últimos 50 mensajes…</div>}
              {modalError && (
                <div className="rounded-md bg-rose-900/30 ring-1 ring-rose-500/40 p-3 text-sm text-rose-200">
                  {modalError}
                </div>
              )}
              {modalData?.messages?.length === 0 && !modalLoading && (
                <div className="text-center text-slate-500 text-sm">Sin mensajes.</div>
              )}
              {modalData?.messages?.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    m.from_me
                      ? "ml-auto bg-emerald-700/30 ring-1 ring-emerald-500/40"
                      : "mr-auto bg-slate-800 ring-1 ring-slate-700"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                    {m.from_me ? "Saliente" : "Entrante"} · {m.message_type || "text"}
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {m.content || <span className="text-slate-500 italic">(sin contenido)</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{formatDate(m.created_at)}</div>
                </div>
              ))}
            </div>
            <footer className="p-3 border-t border-slate-800 text-[11px] text-slate-500">
              Vista read-only. No envía mensajes ni modifica el chat.
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
