"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Msg = { role: "user" | "bot"; text: string };

const GREETING =
  "سلام! من دستیار هوشمند بانک‌یار هستم. چطور می‌توانم کمکتان کنم؟ (مثلاً: موجودی حسابم چقدره؟)";

const SUGGESTIONS: { title: string; prompt: string; icon: ReactNode }[] = [
  { title: "موجودی حساب", prompt: "موجودی حسابم چقدره؟", icon: <WalletIcon /> },
  { title: "آخرین تراکنش‌ها", prompt: "آخرین تراکنش‌هایم را نشان بده", icon: <ListIcon /> },
  { title: "انتقال وجه", prompt: "می‌خواهم وجه انتقال دهم", icon: <TransferIcon /> },
  { title: "کارت گم‌شده", prompt: "کارتم را گم کرده‌ام، چه باید بکنم؟", icon: <CardIcon /> },
];

/* ---- Icons (consistent Lucide-style stroke set; no emoji as icons) ---- */
const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...ICON}>
      <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V5M9 3h6" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...ICON} style={{ transform: "scaleX(-1)" }}>
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
function ShieldCheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}>
      <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function UserIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...ICON}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
}
function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M12 5v14M5 12h14" /></svg>;
}
function AlertIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...ICON}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>;
}
function EyeIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOffIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6 0 10 7 10 7a18 18 0 0 1-2.16 3M6.6 6.6A18 18 0 0 0 2 11s4 7 10 7a10.9 10.9 0 0 0 3.4-.55M3 3l18 18" /></svg>;
}
function WalletIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6" /><circle cx="16.5" cy="12.5" r="1" /></svg>;
}
function ListIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
}
function TransferIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M17 3 21 7l-4 4M21 7H7M7 21l-4-4 4-4M3 17h14" /></svg>;
}
function CardIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
}

export default function ChatWidget() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "bot", text: GREETING }]);
  const [input, setInput] = useState("");
  const [convId, setConvId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const [showLogin, setShowLogin] = useState(false);
  const [otpFor, setOtpFor] = useState<number | null>(null);
  const [devOtp, setDevOtp] = useState<string | undefined>(undefined);

  const chatRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const hasUserMsg = messages.some((m) => m.role === "user");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => d.authenticated && setName(d.name))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Auto-grow the composer textarea (island grows with content, capped).
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input, hasUserMsg]);

  function push(role: Msg["role"], text: string) {
    setMessages((m) => [...m, { role, text }]);
  }

  function newChat() {
    setMessages([{ role: "bot", text: GREETING }]);
    setConvId(null);
    setInput("");
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    push("user", text);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId }),
      });
      const data = await res.json();
      setConvId(data.conversationId ?? convId);
      push("bot", data.reply ?? "خطایی رخ داد.");
      if (data.requiresAuth) setShowLogin(true);
      if (data.requiresOtp) {
        setDevOtp(data.devOtp);
        setOtpFor(data.pendingTransferId);
      }
    } catch {
      push("bot", "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  // The "island" composer — a floating rounded card, reused in the welcome
  // (centered) and chatting (pinned bottom) states.
  const composer = (
    <div className="composer">
      <div className="composer-island">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="پیام خود را بنویسید…"
          aria-label="متن پیام"
          rows={1}
        />
        <div className="composer-bar">
          <span className="composer-hint" />
          <button
            className="send-btn"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="ارسال پیام"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="header">
        <div className="brand">
          <span className="brand-logo"><LogoIcon /></span>
          <div className="brand-text">
            <h1>بانک‌یار</h1>
            <span className="brand-sub"><span className="dot-online" />دستیار هوشمند بانکی · آنلاین</span>
          </div>
        </div>
        <div className="header-actions">
          {hasUserMsg && (
            <button className="icon-btn" onClick={newChat} aria-label="گفتگوی جدید" title="گفتگوی جدید">
              <PlusIcon />
            </button>
          )}
          {name ? (
            <span className="user-chip"><UserIcon />{name}</span>
          ) : (
            <button className="btn ghost" onClick={() => setShowLogin(true)}>ورود</button>
          )}
        </div>
      </header>

      {!hasUserMsg ? (
        <div className="welcome">
          <div className="welcome-inner">
            <span className="welcome-logo"><LogoIcon size={32} /></span>
            <h2 className="welcome-title">سلام{name ? ` ${name}` : ""}، من بانک‌یار هستم</h2>
            <p className="welcome-sub">چطور می‌توانم امروز کمکتان کنم؟</p>

            {composer}

            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s.prompt} className="suggestion" onClick={() => send(s.prompt)} disabled={busy}>
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-title">{s.title}</span>
                  <span className="suggestion-prompt">{s.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="chat" ref={chatRef}>
            <div className="chat-inner">
              {messages.map((m, i) =>
                m.role === "bot" ? (
                  <div className="row bot" key={i}>
                    <span className="avatar"><BotIcon /></span>
                    <div className="bubble">
                      <div className="bubble-name">بانک‌یار</div>
                      <div className="msg">{m.text}</div>
                    </div>
                  </div>
                ) : (
                  <div className="row user" key={i}>
                    <div className="msg">{m.text}</div>
                  </div>
                ),
              )}
              {busy && (
                <div className="row bot">
                  <span className="avatar"><BotIcon /></span>
                  <div className="bubble">
                    <div className="bubble-name">بانک‌یار</div>
                    <div className="msg" aria-label="در حال نوشتن">
                      <span className="typing"><span /><span /><span /></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {composer}
        </>
      )}

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={(n) => {
            setName(n);
            setShowLogin(false);
            push("bot", `${n} عزیز، خوش آمدید. اکنون می‌توانید درخواست خود را دوباره بفرمایید.`);
          }}
        />
      )}

      {otpFor !== null && (
        <OtpModal
          pendingTransferId={otpFor}
          devOtp={devOtp}
          onClose={() => setOtpFor(null)}
          onResult={(text) => {
            setOtpFor(null);
            push("bot", text);
          }}
        />
      )}
    </>
  );
}

function LoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (name: string) => void }) {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, password }),
      });
      const data = await res.json();
      if (res.ok) onSuccess(data.name);
      else setError(data.error ?? "ورود ناموفق بود.");
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="ورود به حساب">
        <div className="modal-head">
          <h3>ورود به حساب</h3>
          <button className="icon-btn" onClick={onClose} aria-label="بستن"><CloseIcon /></button>
        </div>

        <label className="field-label" htmlFor="lg-mobile">شماره موبایل</label>
        <input id="lg-mobile" className="input" inputMode="numeric" autoComplete="username"
          placeholder="۰۹۱۲۰۰۰۰۰۰۰" value={mobile} onChange={(e) => setMobile(e.target.value)} />

        <label className="field-label" htmlFor="lg-pass">رمز عبور</label>
        <div className="input-wrap">
          <input id="lg-pass" className="input" type={showPw ? "text" : "password"} autoComplete="current-password"
            placeholder="رمز عبور" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button type="button" className="toggle" onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "پنهان کردن رمز" : "نمایش رمز"}>
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error && <div className="error" role="alert"><AlertIcon />{error}</div>}
        <div className="hint">نمونه: ۰۹۱۲۰۰۰۰۰۰۰ / رمز: ۱۲۳۴</div>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? "در حال ورود…" : "ورود"}</button>
      </div>
    </div>
  );
}

function OtpModal({
  pendingTransferId,
  devOtp,
  onClose,
  onResult,
}: {
  pendingTransferId: number;
  devOtp?: string;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoIn, setAutoIn] = useState<number | null>(devOtp ? 5 : null);

  // Dev/testing convenience: after 5s, auto-fill the OTP that the server returned
  // (since there's no real SMS in dev). Shows a small countdown first.
  useEffect(() => {
    if (!devOtp) return;
    const interval = setInterval(() => setAutoIn((n) => (n && n > 1 ? n - 1 : 0)), 1000);
    const timer = setTimeout(() => {
      setCode(devOtp);
      setAutoIn(null);
    }, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [devOtp]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingTransferId, code }),
      });
      const data = await res.json();
      if (data.ok) onResult(data.reply);
      else setError(data.reply ?? "تأیید ناموفق بود.");
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="تأیید انتقال وجه">
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="modal-icon"><ShieldCheckIcon /></span>
            <h3>تأیید انتقال وجه</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="بستن"><CloseIcon /></button>
        </div>

        <div className={`hint${autoIn !== null ? " accent" : ""}`}>
          {autoIn !== null
            ? `رمز یکبارمصرف تا ${autoIn} ثانیه دیگر به‌صورت خودکار وارد می‌شود (حالت آزمایشی)…`
            : "رمز یکبارمصرف پیامک‌شده را وارد کنید."}
        </div>
        <input className="input" inputMode="numeric" autoComplete="one-time-code"
          placeholder="رمز یکبارمصرف" value={code}
          onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {error && <div className="error" role="alert"><AlertIcon />{error}</div>}
        <button className="btn" onClick={submit} disabled={busy}>{busy ? "در حال تأیید…" : "تأیید و انتقال"}</button>
      </div>
    </div>
  );
}
