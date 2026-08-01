"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, ImagePlus, SendHorizonal, X, GraduationCap, Loader2 } from "lucide-react";
import { adminFetch, AdminAuthError } from "@/lib/quant/adminFetch";
import { qtInputClass, qtInputStyle } from "./QtDialog";

/** File -> raw base64 (no data: prefix) for the JSON transport */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read image"));
    r.readAsDataURL(file);
  });
}

interface MentorMessage {
  id: string;
  role: "user" | "model";
  text: string;
  imageUrl?: string; // object URL for the user's attached screenshot
  error?: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function AiMentor() {
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<File | null>(null);
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const attach = useCallback((file: File | null) => {
    if (!file || !ACCEPTED.includes(file.type)) return;
    setAttached(file);
    setAttachedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const clearAttachment = () => {
    if (attachedUrl) URL.revokeObjectURL(attachedUrl);
    setAttached(null);
    setAttachedUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;

    const userMsg: MentorMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt,
      imageUrl: attachedUrl ?? undefined,
    };
    const historyPayload = messages
      .filter((m) => !m.error)
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((m) => [...m, userMsg]);
    setInput("");
    const fileToSend = attached;
    setAttached(null); // keep the object URL alive for the bubble; only detach the file
    if (fileRef.current) fileRef.current.value = "";
    setAttachedUrl(null);
    setBusy(true);

    try {
      const body: Record<string, unknown> = { prompt, history: historyPayload };
      if (fileToSend) {
        body.image_b64 = await fileToBase64(fileToSend);
        body.image_mime = fileToSend.type;
      }
      // JSON transport (no multipart): adminFetch handles the key prompt,
      // X-Admin-Key header, and 401/403 vault auto-clear.
      const res = await adminFetch("/api/mentor/chat", body);
      const j = await res.json();
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "model", text: String(j.reply ?? "") }]);
    } catch (e) {
      const text =
        e instanceof AdminAuthError ? (e as Error).message : (e as Error).message || "Mentor unreachable";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "model", text, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    attach(e.dataTransfer.files?.[0] ?? null);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files ?? [])[0];
    if (file) attach(file);
  };

  return (
    <div
      className="qt-card flex flex-col max-w-3xl mx-auto w-full h-[calc(100dvh-var(--qt-statusbar-h)-var(--qt-nav-h)-48px)] md:h-[calc(100dvh-var(--qt-statusbar-h)-64px)] overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={dragOver ? { borderColor: "var(--qt-accent)" } : undefined}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--qt-border)", background: "var(--qt-surface-2)" }}
      >
        <span className="qt-label flex items-center gap-1.5" style={{ color: "var(--qt-text)" }}>
          <GraduationCap size={13} style={{ color: "var(--qt-accent)" }} /> Nexus Quant AI Mentor
        </span>
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
          gemini-2.0-flash · brutal mode
        </span>
      </header>

      {/* Message history */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-6">
            <Bot size={20} style={{ color: "var(--qt-text-faint)" }} />
            <p className="qt-num text-[11px] font-bold" style={{ color: "var(--qt-text-muted)" }}>
              Drop a chart screenshot and defend your idea.
            </p>
            <p className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
              The Mentor is instructed to disagree, find flaws, and propose better structure —
              it will not validate you. Paste (Ctrl+V), drop, or attach PNG/JPEG/WebP.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3.5 py-2.5"
              style={{
                background: m.error
                  ? "rgb(244 63 94 / 0.10)"
                  : m.role === "user"
                    ? "color-mix(in srgb, var(--qt-accent) 12%, var(--qt-surface-2))"
                    : "var(--qt-surface-2)",
                border: `1px solid ${m.error ? "var(--qt-short)" : m.role === "user" ? "var(--qt-accent-dim)" : "var(--qt-border-strong)"}`,
              }}
            >
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.imageUrl}
                  alt="Attached chart"
                  className="rounded-lg mb-2 max-h-56 w-auto"
                  style={{ border: "1px solid var(--qt-border)" }}
                />
              )}
              {m.role === "model" && !m.error ? (
                <div
                  className="text-[12px] leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:pl-4 [&_li]:list-disc [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:font-bold [&_code]:qt-num [&_code]:text-[11px] [&_code]:px-1 [&_code]:rounded [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold"
                  style={{ color: "var(--qt-text)", fontFamily: "var(--qt-font-ui)" }}
                >
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              ) : (
                <p
                  className="text-[12px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: m.error ? "var(--qt-short)" : "var(--qt-text)" }}
                >
                  {m.text}
                </p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 px-1">
            <Loader2 size={13} className="animate-spin" style={{ color: "var(--qt-accent)" }} />
            <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
              Mentor is tearing it apart…
            </span>
          </div>
        )}
      </div>

      {/* Composer */}
      <footer className="shrink-0 px-3 py-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--qt-border)" }}>
        {attachedUrl && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachedUrl}
              alt="Screenshot preview"
              className="h-14 w-auto rounded-md"
              style={{ border: "1px solid var(--qt-accent-dim)" }}
            />
            <button
              onClick={clearAttachment}
              aria-label="Remove attachment"
              className="p-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
              style={{ color: "var(--qt-text-muted)", border: "1px solid var(--qt-border-strong)" }}
            >
              <X size={12} />
            </button>
            <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
              {attached?.name}
            </span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => attach(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Attach chart screenshot"
            className="p-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] shrink-0"
            style={{ border: "1px solid var(--qt-border-strong)", color: "var(--qt-text-muted)" }}
          >
            <ImagePlus size={15} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Defend your setup… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className={`${qtInputClass} resize-none flex-1`}
            style={qtInputStyle}
          />

          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send to Mentor"
            className="p-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] disabled:opacity-40 shrink-0"
            style={{
              background: "var(--qt-accent-dim)",
              border: "1px solid var(--qt-accent)",
              color: "var(--qt-text)",
            }}
          >
            <SendHorizonal size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
}
