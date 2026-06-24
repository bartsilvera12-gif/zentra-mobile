"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Camera,
  CheckCheck,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import {
  markMobileConversationRead,
  sendMobileMedia,
  sendMobileMessage,
  useMobileInbox,
  useMobileMessages,
  type MobileChatConversation,
  type MobileChatMessage,
} from "@/shared/hooks/useChatMobile";
import {
  getNotificationPermission,
  requestNotificationPermission,
  useChatNotifications,
} from "@/shared/hooks/useChatNotifications";

/**
 * Conversaciones — UI mobile nativa, estilo WhatsApp.
 *
 * Una sola ruta (`?id=X` cambia entre lista y chat) para preservar el back-stack
 * del browser/PWA. La pantalla del chat se monta con un slide horizontal sutil.
 */

// ── Paleta Neura (toma del sidebar y primary del ERP) ───────────────────────
const WA = {
  headerBg: "#0B3A3D",      // var(--zentra-sidebar) — teal corporativo
  headerAccent: "#7DCFD2",  // var(--zentra-sidebar-accent) — mint para hover sutil
  tickBlue: "#0EA5E9",      // var(--primary) — check leído en azul de marca
  sentBg: "#E0F2FE",        // var(--primary-light) — burbuja propia en azul claro
  recvBg: "#FFFFFF",        // recibida en blanco puro
  chatBg: "#F8FAFC",        // var(--background) — fondo slate-50
  accent: "#0EA5E9",        // var(--primary) — FAB enviar / badge no leído
  accentHover: "#0284C7",   // var(--primary-hover)
  textMain: "#0F172A",      // var(--foreground)
  textMuted: "#475569",     // var(--foreground-muted)
  divider: "#E2E8F0",       // var(--border)
};

export default function ConversacionesMobile() {
  const sp = useSearchParams();
  const router = useRouter();
  const selectedId = sp.get("id");

  // Hook de notificaciones. Comparte SWR key con InboxScreen — no duplica fetch.
  const { conversations } = useMobileInbox();
  useChatNotifications({ conversations, activeConversationId: selectedId });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className={`absolute inset-0 transition-transform duration-200 ease-out ${
          selectedId ? "-translate-x-4 opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
        }`}
      >
        <InboxScreen />
      </div>
      <div
        className={`absolute inset-0 transition-transform duration-200 ease-out ${
          selectedId ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
        }`}
      >
        {selectedId ? (
          <ChatScreen
            conversationId={selectedId}
            onBack={() => router.push("/dashboard/conversaciones")}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Inbox ───────────────────────────────────────────────────────────────────

function InboxScreen() {
  const { conversations, isLoading, error } = useMobileInbox();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setNotifPerm(getNotificationPermission());
  }, []);

  const askNotif = useCallback(async () => {
    const next = await requestNotificationPermission();
    setNotifPerm(next);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const nombre = (c.contact_nombre ?? c.contact_telefono ?? "").toLowerCase();
      const preview = (c.last_message_preview ?? "").toLowerCase();
      return nombre.includes(q) || preview.includes(q);
    });
  }, [conversations, query]);

  return (
    <section className="flex h-full flex-col bg-white">
      {/* Header */}
      <header
        className="shrink-0 text-white"
        style={{
          background: WA.headerBg,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {searchOpen ? (
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              aria-label="Cerrar búsqueda"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="flex-1 bg-transparent px-2 text-base text-white placeholder:text-white/60 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 active:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3">
            <h1 className="text-[22px] font-semibold tracking-tight">Chats</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/95 active:bg-white/10"
              >
                <Search className="h-5 w-5" />
              </button>
              {notifPerm !== "unsupported" ? (
                <button
                  type="button"
                  onClick={notifPerm === "granted" ? undefined : askNotif}
                  aria-label={
                    notifPerm === "granted"
                      ? "Notificaciones activadas"
                      : notifPerm === "denied"
                        ? "Notificaciones bloqueadas en el navegador"
                        : "Activar notificaciones"
                  }
                  title={
                    notifPerm === "granted"
                      ? "Notificaciones activadas"
                      : notifPerm === "denied"
                        ? "Permiso denegado — habilitalo desde la configuración del navegador"
                        : "Activar notificaciones"
                  }
                  className={`flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10 ${
                    notifPerm === "granted" ? "text-white/95" : "text-white/70"
                  }`}
                >
                  {notifPerm === "denied" ? (
                    <BellOff className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo cargar el inbox.
          </div>
        ) : isLoading && conversations.length === 0 ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyInbox hayBusqueda={!!query.trim()} />
        ) : (
          <ul className="divide-y divide-[color:var(--wa-divider)] [--wa-divider:#E9EDEF]">
            {filtered.map((c) => (
              <ConversationRow key={c.id} conv={c} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConversationRow({ conv }: { conv: MobileChatConversation }) {
  const nombre =
    conv.contact_nombre?.trim() || conv.contact_telefono?.trim() || "Sin contacto";
  const unread = conv.unread_count > 0;
  const avatarColor = colorFromString(nombre);
  const inicial = nombre.charAt(0).toUpperCase();

  return (
    <li>
      <Link
        href={`/dashboard/conversaciones?id=${encodeURIComponent(conv.id)}`}
        prefetch={false}
        scroll={false}
        className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-100"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
          style={{ background: avatarColor }}
          aria-hidden
        >
          {inicial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className="truncate text-[16px] leading-tight"
              style={{
                color: WA.textMain,
                fontWeight: unread ? 600 : 500,
              }}
            >
              {nombre}
            </p>
            {conv.last_message_at ? (
              <span
                className="shrink-0 text-[12px] tabular-nums"
                style={{
                  color: unread ? WA.accent : WA.textMuted,
                  fontWeight: unread ? 600 : 400,
                }}
              >
                {formatRelative(conv.last_message_at)}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className="truncate text-[14px] leading-snug"
              style={{ color: unread ? WA.textMain : WA.textMuted }}
            >
              {conv.last_message_preview ?? (
                <span className="italic text-slate-400">Sin mensajes</span>
              )}
            </p>
            {unread ? (
              <span
                aria-label={`${conv.unread_count} sin leer`}
                className="ml-2 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                style={{ background: WA.accent }}
              >
                {conv.unread_count > 99 ? "99+" : conv.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

// ── Chat ────────────────────────────────────────────────────────────────────

function ChatScreen({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { messages, isLoading, mutate } = useMobileMessages(conversationId);
  const { conversations, mutate: mutateInbox } = useMobileInbox();
  const swr = useSWRConfig();
  const conv = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  // Marca como leído al entrar al chat. (a) Update optimista del cache del inbox
  // para que el badge desaparezca al instante; (b) llamada al server action que
  // pone unread_count=0 en la DB; (c) re-revalidación silenciosa por si la DB
  // devuelve otro valor.
  useEffect(() => {
    if (!conversationId) return;
    const clearLocally = (data: { conversations: MobileChatConversation[] } | undefined) => {
      if (!data) return data;
      const updated = data.conversations.map((c) =>
        c.id === conversationId && (c.unread_count ?? 0) > 0
          ? { ...c, unread_count: 0 }
          : c
      );
      return { conversations: updated };
    };
    // Pisamos ambos cache-keys (open vs all) sin revalidar — UI inmediata.
    swr.mutate("chat:mobile-inbox:1", clearLocally, { revalidate: false });
    swr.mutate("chat:mobile-inbox:0", clearLocally, { revalidate: false });
    // Persistir en backend. Si falla, re-revalidamos para sincronizar.
    void markMobileConversationRead(conversationId).then((res) => {
      if (!res.ok) void mutateInbox();
    });
  }, [conversationId, swr, mutateInbox]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // File pickers ocultos: uno general (paperclip) y uno para cámara (capture).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Picker de emojis.
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Estado de grabación de audio.
  const [recording, setRecording] = useState<{
    state: "idle" | "recording";
    startedAt: number;
    elapsedSec: number;
  }>({ state: "idle", startedAt: 0, elapsedSec: 0 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recCancelledRef = useRef(false);

  // Auto-scroll al fondo cuando llegan mensajes nuevos.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Auto-resize del textarea (1–5 líneas).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
  }, [text]);

  // Tick del cronómetro mientras se graba.
  useEffect(() => {
    if (recording.state !== "recording") return;
    const id = setInterval(() => {
      setRecording((r) =>
        r.state === "recording"
          ? { ...r, elapsedSec: Math.floor((Date.now() - r.startedAt) / 1000) }
          : r
      );
    }, 250);
    return () => clearInterval(id);
  }, [recording.state]);

  // Cleanup defensivo si el componente desmonta mientras se graba.
  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Inserta un emoji en la posición actual del cursor del textarea.
  const insertEmoji = useCallback((emoji: string) => {
    const ta = taRef.current;
    setText((prev) => {
      if (!ta) return prev + emoji;
      const start = ta.selectionStart ?? prev.length;
      const end = ta.selectionEnd ?? prev.length;
      return prev.slice(0, start) + emoji + prev.slice(end);
    });
    requestAnimationFrame(() => {
      if (!ta) return;
      const newPos = (ta.selectionStart ?? 0) + emoji.length;
      ta.focus();
      try { ta.setSelectionRange(newPos, newPos); } catch { /* ignore */ }
    });
  }, []);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    const res = await sendMobileMessage({ conversationId, text: t });
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar.");
    } else {
      setText("");
      await mutate();
    }
    setSending(false);
  }, [text, sending, conversationId, mutate]);

  const sendFile = useCallback(
    async (file: File) => {
      if (sending) return;
      const maxMb = 15;
      if (file.size > maxMb * 1024 * 1024) {
        setError(`El archivo supera ${maxMb} MB.`);
        return;
      }
      setSending(true);
      setError(null);
      const res = await sendMobileMedia({ conversationId, file });
      if (!res.ok) {
        setError(res.error ?? "No se pudo enviar el archivo.");
      } else {
        await mutate();
      }
      setSending(false);
    },
    [conversationId, sending, mutate]
  );

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = ""; // permitir re-seleccionar el mismo archivo
      if (f) void sendFile(f);
    },
    [sendFile]
  );

  const startRecording = useCallback(async () => {
    if (recording.state === "recording" || sending) return;
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no soporta grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      recCancelledRef.current = false;
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        const tracks = recStreamRef.current?.getTracks() ?? [];
        tracks.forEach((t) => t.stop());
        recStreamRef.current = null;
        recorderRef.current = null;
        if (recCancelledRef.current || recChunksRef.current.length === 0) {
          setRecording({ state: "idle", startedAt: 0, elapsedSec: 0 });
          return;
        }
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(recChunksRef.current, { type });
        const ext = guessAudioExt(type);
        const filename = `audio-${Date.now()}.${ext}`;
        setRecording({ state: "idle", startedAt: 0, elapsedSec: 0 });
        await sendFile(new File([blob], filename, { type }));
      };
      recorderRef.current = mr;
      recStreamRef.current = stream;
      setRecording({ state: "recording", startedAt: Date.now(), elapsedSec: 0 });
      mr.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo acceder al micrófono.");
    }
  }, [recording.state, sending, sendFile]);

  const stopAndSendRecording = useCallback(() => {
    if (recording.state !== "recording") return;
    recCancelledRef.current = false;
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }, [recording.state]);

  const cancelRecording = useCallback(() => {
    if (recording.state !== "recording") return;
    recCancelledRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }, [recording.state]);

  const nombre =
    conv?.contact_nombre?.trim() || conv?.contact_telefono?.trim() || "Conversación";
  const avatarColor = colorFromString(nombre);
  const inicial = nombre.charAt(0).toUpperCase();
  const hasText = text.trim().length > 0;

  // Mensajes agrupados por día (separadores tipo WhatsApp).
  const grouped = useMemo(() => groupByDay(messages), [messages]);

  return (
    <section className="flex h-full flex-col" style={{ background: WA.chatBg }}>
      {/* Header chat — minimal: back + avatar + nombre/estado. Sin iconos de
          videollamada/llamada/menú (ruido visual sin función real). */}
      <header
        className="shrink-0 text-white"
        style={{
          background: WA.headerBg,
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center gap-2 px-1 py-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/95 transition-colors active:bg-white/10"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ring-2 ring-white/15"
              style={{ background: avatarColor }}
              aria-hidden
            >
              {inicial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15.5px] font-semibold leading-tight tracking-tight">
                {nombre}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-tight text-white/70">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: "#4ADE80" }}
                />
                {conv?.channel_name ?? "Conversación"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2.5 py-3"
        style={{
          backgroundColor: WA.chatBg,
          backgroundImage: CHAT_PATTERN,
          backgroundRepeat: "repeat",
          backgroundSize: "360px 360px",
        }}
      >
        {isLoading && messages.length === 0 ? (
          <SkeletonBubbles />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-xl bg-white/80 px-3 py-1.5 text-[12px] text-slate-500 shadow-sm">
              Sin mensajes todavía
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {grouped.map((item, i) =>
              item.type === "day" ? (
                <li key={`d-${i}`} className="my-2 flex justify-center">
                  <span
                    className="rounded-md px-2.5 py-1 text-[11.5px] font-medium shadow-sm"
                    style={{ background: "#FFFFFF", color: WA.textMuted, border: `1px solid ${WA.divider}` }}
                  >
                    {item.label}
                  </span>
                </li>
              ) : (
                <MessageBubble key={item.message.id} message={item.message} />
              )
            )}
          </ul>
        )}
      </div>

      {/* Error envío */}
      {error ? (
        <div
          className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* Composer */}
      <div
        className="shrink-0"
        style={{
          background: WA.chatBg,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {/* Picker de emojis (toggleable arriba del composer). */}
        {emojiOpen ? (
          <EmojiPicker
            onSelect={(e) => insertEmoji(e)}
            onClose={() => setEmojiOpen(false)}
          />
        ) : null}

        {/* Inputs file ocultos (uno general, otro con captura de cámara). */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/*"
          onChange={onPickFile}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={onPickFile}
        />

        {recording.state === "recording" ? (
          <RecordingBar
            elapsedSec={recording.elapsedSec}
            onCancel={cancelRecording}
            onSend={stopAndSendRecording}
          />
        ) : (
          <div className="flex items-end gap-1.5 px-2 pt-1.5">
            <div className="flex min-w-0 flex-1 items-end gap-1 rounded-3xl bg-white px-2 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                aria-label={emojiOpen ? "Cerrar emojis" : "Abrir emojis"}
                aria-expanded={emojiOpen}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-slate-100 ${
                  emojiOpen ? "text-[#0EA5E9]" : "text-[#54656F]"
                }`}
              >
                <Smile className="h-[22px] w-[22px]" />
              </button>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={sending ? "Enviando…" : "Mensaje"}
                disabled={sending}
                className="min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[16px] leading-[22px] text-[#111B21] placeholder:text-[#667781] focus:outline-none disabled:opacity-60"
                style={{ maxHeight: 22 * 5 }}
              />
              {!hasText ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    aria-label="Adjuntar archivo"
                    title="Adjuntar archivo"
                    className="flex h-9 w-9 shrink-0 -rotate-45 items-center justify-center rounded-full text-[#54656F] active:bg-slate-100 disabled:opacity-50"
                  >
                    <Paperclip className="h-[22px] w-[22px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={sending}
                    aria-label="Tomar foto"
                    title="Tomar foto"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#54656F] active:bg-slate-100 disabled:opacity-50"
                  >
                    <Camera className="h-[22px] w-[22px]" />
                  </button>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={hasText ? () => void send() : () => void startRecording()}
              disabled={sending}
              aria-label={hasText ? "Enviar" : "Grabar audio"}
              title={hasText ? "Enviar" : "Grabar audio"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: WA.accent }}
            >
              {hasText ? (
                <Send className="h-[20px] w-[20px] translate-x-[1px]" />
              ) : (
                <MicIcon />
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Emoji picker (custom liviano, sin libs) ─────────────────────────────────

const EMOJI_CATEGORIES: Array<{ key: string; label: string; icon: string; list: string[] }> = [
  {
    key: "smileys",
    label: "Caras",
    icon: "😀",
    list: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃",
      "😉","😊","😇","🥰","😍","🤩","😘","😗","😋","😜",
      "🤪","😎","🥳","😏","😒","😞","😔","😟","😕","🙁",
      "☹️","😣","😖","😫","😩","😢","😭","😤","😠","😡",
      "🤬","🤔","🤨","😐","😑","😶","🙄","😬","🤥","😪",
      "😴","🤤","🤒","🤕","🤧","🥵","🥶","😵","🤯","🤠",
      "🥺","🤗","🤭","🤫","🫡","🫥","🫠","😮","😯","😲",
    ],
  },
  {
    key: "gestures",
    label: "Gestos",
    icon: "👍",
    list: [
      "👍","👎","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘",
      "🤙","🫵","👈","👉","👆","🖕","👇","☝️","👋","🤚",
      "🖐️","✋","🖖","🫱","🫲","🫳","🫴","👏","🙌","👐",
      "🤲","🤝","🙏","💪","🫵","👀","👁️","👅","👄","🦴",
    ],
  },
  {
    key: "hearts",
    label: "Amor",
    icon: "❤️",
    list: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️",
      "💌","💋","🌹","🌷","💐","🥀","🌺","🌸","💍","💎",
    ],
  },
  {
    key: "animals",
    label: "Animales",
    icon: "🐶",
    list: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆",
      "🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋",
      "🐌","🐞","🐢","🐍","🦎","🐙","🦑","🦀","🐠","🐟",
      "🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🐘",
    ],
  },
  {
    key: "food",
    label: "Comida",
    icon: "🍔",
    list: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒",
      "🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬",
      "🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯",
      "🍞","🥖","🧀","🥚","🍳","🥞","🥓","🥩","🍗","🍖",
      "🌭","🍔","🍟","🍕","🥪","🌮","🌯","🥗","🍣","🍦",
      "🍩","🎂","🍰","🍫","🍬","🍿","☕","🍵","🥤","🧋",
      "🍺","🍻","🍷","🍸","🍹","🧉","🍾","🥂","🥃","🍶",
    ],
  },
  {
    key: "objects",
    label: "Varios",
    icon: "🎉",
    list: [
      "🎉","🎊","🎁","🎈","🎀","🎂","🥳","🪅","✨","⭐",
      "🌟","💫","⚡","🔥","💯","💥","💢","💦","💤","💨",
      "⚽","🏀","🏈","⚾","🎾","🏐","🏉","🥎","🏓","🏸",
      "📱","💻","⌚","📷","📹","🎥","🎬","🎵","🎶","🎤",
      "⏰","🔔","🔕","💡","🕯️","🪔","🔑","🔒","🔓","💰",
      "💵","💳","🧾","📌","📍","📎","🖇️","📏","📐","✂️",
      "✅","❌","⚠️","❗","❓","💯","🆗","🆕","🔝","🆒",
    ],
  },
];

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0].key);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape o click afuera del picker.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) {
        // Ignorar clicks en el propio botón Smile — su handler cierra/abre solo.
        const btn = (target as Element).closest?.('button[aria-label*="emojis"]');
        if (!btn) onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const current = EMOJI_CATEGORIES.find((c) => c.key === tab) ?? EMOJI_CATEGORIES[0];

  return (
    <div
      ref={containerRef}
      className="border-t border-slate-200 bg-white"
      style={{ animation: "slideUp 140ms ease-out" }}
    >
      {/* Grid scroll */}
      <div className="max-h-[240px] overflow-y-auto overscroll-y-contain px-2 py-2">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
        >
          {current.list.map((emoji, i) => (
            <button
              key={`${current.key}-${i}-${emoji}`}
              type="button"
              onClick={() => onSelect(emoji)}
              className="flex h-9 w-full items-center justify-center rounded-md text-[22px] leading-none active:bg-slate-100"
              aria-label={`Insertar ${emoji}`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Tabs categorías */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-1 py-1">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setTab(c.key)}
            aria-label={c.label}
            aria-pressed={tab === c.key}
            className={`flex h-9 flex-1 items-center justify-center rounded-md text-[18px] leading-none transition-colors ${
              tab === c.key ? "bg-white shadow-sm" : "active:bg-white/60"
            }`}
          >
            <span style={{ opacity: tab === c.key ? 1 : 0.7 }}>{c.icon}</span>
          </button>
        ))}
      </div>
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function RecordingBar({
  elapsedSec,
  onCancel,
  onSend,
}: {
  elapsedSec: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 px-2 pt-1.5">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar grabación"
        title="Cancelar"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 active:bg-red-50"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-center gap-2 rounded-3xl bg-white px-3 py-2 shadow-sm">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
          style={{ background: "#DC2626" }}
        />
        <span className="text-[14px] font-medium tabular-nums" style={{ color: WA.textMain }}>
          {mm}:{ss}
        </span>
        <span className="ml-2 truncate text-[13px]" style={{ color: WA.textMuted }}>
          Grabando audio…
        </span>
      </div>
      <button
        type="button"
        onClick={onSend}
        aria-label="Enviar audio"
        title="Enviar audio"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95"
        style={{ background: WA.accent }}
      >
        <Send className="h-[20px] w-[20px] translate-x-[1px]" />
      </button>
    </div>
  );
}

// Selecciona el primer MIME de audio que el navegador soporte. Empieza por opus
// (mejor compresión y soportado en Android/Chrome/Firefox), cae a mp4/aac en
// Safari iOS y, en último caso, deja que el navegador decida.
function pickAudioMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* ignore */ }
  }
  return null;
}

function guessAudioExt(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  return "bin";
}

function MessageBubble({ message }: { message: MobileChatMessage }) {
  const fromMe = message.from_me;
  const ts = formatHora(message.created_at);
  const kind = (message.message_type || "text").toLowerCase();
  const isText = kind === "text" || !message.message_type;
  const content = message.content ?? "";
  const mediaUrl = extractMediaUrl(message);
  const showImage = (kind === "image" || kind === "sticker") && !!mediaUrl;

  return (
    <li
      className={`flex ${fromMe ? "justify-end" : "justify-start"} px-0.5`}
    >
      <div
        className={`relative max-w-[82%] overflow-hidden rounded-lg shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
          fromMe ? "wa-tail-right" : "wa-tail-left"
        }`}
        style={{
          background: fromMe ? WA.sentBg : WA.recvBg,
          color: WA.textMain,
        }}
      >
        {showImage ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl!}
              alt={content || "Imagen"}
              className="block max-h-72 w-full bg-slate-100 object-cover"
              loading="lazy"
            />
            {content && content !== "[imagen]" ? (
              <p className="px-2 pb-1 pt-1.5 pr-[60px] text-[14.5px] leading-[19px]">
                {content}
              </p>
            ) : (
              <div className="h-5" />
            )}
          </div>
        ) : isText ? (
          <p className="whitespace-pre-wrap break-words px-2 pb-1 pt-1.5 pr-[60px] text-[14.5px] leading-[19px]">
            {content}
          </p>
        ) : (
          <p
            className="px-2 pb-1 pt-1.5 pr-[60px] text-[14.5px] italic"
            style={{ color: WA.textMuted }}
          >
            {labelForMediaKind(kind)} {content && content !== `[${kind}]` ? content : ""}
          </p>
        )}
        <span
          className="absolute bottom-[3px] right-[8px] flex items-center gap-0.5 text-[11px]"
          style={{
            color: WA.textMuted,
            textShadow: showImage ? "0 0 4px rgba(255,255,255,0.9)" : undefined,
          }}
        >
          {ts}
          {fromMe ? (
            <CheckCheck className="h-[14px] w-[14px]" style={{ color: WA.tickBlue }} />
          ) : null}
        </span>
      </div>
      <BubbleTailStyles />
    </li>
  );
}

/** Extrae un URL de media del `raw_payload` cuando el webhook ya lo guardó. */
function extractMediaUrl(m: MobileChatMessage): string | null {
  const p = m.raw_payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object") return null;
  // Candidatas comunes según cómo Meta/WhatsApp pueblan el payload:
  const candidates = [
    (p as { media_url?: unknown }).media_url,
    (p as { url?: unknown }).url,
    ((p as { image?: { url?: unknown } }).image ?? {}).url,
    ((p as { sticker?: { url?: unknown } }).sticker ?? {}).url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

function labelForMediaKind(kind: string): string {
  switch (kind) {
    case "image": return "📷 Imagen";
    case "video": return "🎬 Video";
    case "audio": return "🎙️ Audio";
    case "document": return "📎 Documento";
    case "sticker": return "🌟 Sticker";
    case "location": return "📍 Ubicación";
    default: return `[${kind}]`;
  }
}

// Estilos globales para las "colas" de las burbujas. Inyectados una sola vez
// gracias a una clave estática — Next deduplica.
function BubbleTailStyles() {
  return (
    <style jsx global>{`
      .wa-tail-right::after,
      .wa-tail-left::after {
        content: "";
        position: absolute;
        bottom: 0;
        width: 8px;
        height: 13px;
        background-repeat: no-repeat;
      }
      .wa-tail-right::after {
        right: -7px;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 13'><path d='M0,0 L8,0 L0,13 Z' fill='%23E0F2FE'/></svg>");
      }
      .wa-tail-left::after {
        left: -7px;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 13'><path d='M8,0 L0,0 L8,13 Z' fill='%23FFFFFF'/></svg>");
      }
    `}</style>
  );
}

// ── Estados vacíos / skeletons ──────────────────────────────────────────────

function EmptyInbox({ hayBusqueda }: { hayBusqueda: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <MessageCircle className="h-8 w-8 text-slate-400" />
      </div>
      <p className="mt-4 text-[15px] font-semibold text-slate-800">
        {hayBusqueda ? "Sin resultados" : "Sin conversaciones"}
      </p>
      <p className="mt-1 text-[13px] text-slate-500">
        {hayBusqueda
          ? "Probá con otro nombre o número."
          : "Cuando llegue un mensaje nuevo lo vas a ver acá."}
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SkeletonBubbles() {
  return (
    <ul className="space-y-2">
      {[0, 1, 0, 1, 1, 0].map((side, i) => (
        <li key={i} className={`flex ${side === 0 ? "justify-start" : "justify-end"}`}>
          <div
            className="h-8 animate-pulse rounded-lg"
            style={{
              width: 90 + ((i * 37) % 130),
              background: side === 0 ? "rgba(255,255,255,0.7)" : "rgba(224,242,254,0.8)",
            }}
          />
        </li>
      ))}
    </ul>
  );
}

// ── Icono micrófono custom (más fiel a WhatsApp que el de lucide) ────────────

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isYesterday) return "ayer";

  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return d.toLocaleDateString("es-PY", { weekday: "short" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    "es-PY",
    sameYear
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "2-digit" }
  );
}

function formatHora(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function colorFromString(s: string): string {
  // Paleta tonal alineada con Neura: variaciones de teal/azul/slate del sidebar
  // y el primary, sin rainbow saturado.
  const PALETTE = [
    "#0B3A3D", "#104A4E", "#0F766E", "#0E7490", "#0369A1",
    "#0284C7", "#0EA5E9", "#1E3A8A", "#334155", "#475569",
    "#7DCFD2", "#14B8A6", "#0891B2", "#1D4ED8", "#64748B",
  ];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type GroupItem =
  | { type: "day"; label: string }
  | { type: "msg"; message: MobileChatMessage };

function groupByDay(messages: MobileChatMessage[]): GroupItem[] {
  const out: GroupItem[] = [];
  let lastKey = "";
  for (const m of messages) {
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) {
      out.push({ type: "msg", message: m });
      continue;
    }
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (key !== lastKey) {
      out.push({ type: "day", label: dayLabel(d) });
      lastKey = key;
    }
    out.push({ type: "msg", message: m });
  }
  return out;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "HOY";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isY =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isY) return "AYER";
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff < 7) {
    return d.toLocaleDateString("es-PY", { weekday: "long" }).toUpperCase();
  }
  return d
    .toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();
}

// Patrón sutil de fondo del chat (puntos diagonales muy suaves) — data URI inline
// para no depender de un asset y no agregar request HTTP.
const CHAT_PATTERN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='%23000000' fill-opacity='0.03'><circle cx='15' cy='15' r='1.2'/><circle cx='60' cy='40' r='1.2'/><circle cx='120' cy='25' r='1.2'/><circle cx='165' cy='70' r='1.2'/><circle cx='40' cy='95' r='1.2'/><circle cx='95' cy='115' r='1.2'/><circle cx='140' cy='140' r='1.2'/><circle cx='25' cy='160' r='1.2'/><circle cx='75' cy='170' r='1.2'/></g></svg>\")";

