"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

/* ---- Icons (consistent Lucide-style stroke set; no emoji as icons) ---- */
const LogoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const BotIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V5M9 3h6" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" />
  </svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: "scaleX(-1)" }}>
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const ShieldCheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const AlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
  </svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6 0 10 7 10 7a18 18 0 0 1-2.16 3M6.6 6.6A18 18 0 0 0 2 11s4 7 10 7a10.9 10.9 0 0 0 3.4-.55M3 3l18 18" />
  </svg>
);

export default function ChatWidget() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "bot", text: "سلام! من دستیار هوشمند بانک‌یار هستم. چطور می‌توانم کمکتان کنم؟ (مثلاً: موجودی حسابم چقدره؟)" },
  ]);
  const [input, setInput] = useState("");
  const [convId, setConvId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const [showLogin, setShowLogin] = useState(false);
  const [otpFor, setOtpFor] = useState<number | null>(null);
  const [devOtp, setDevOtp] = useState<string | undefined>(undefined);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => d.authenticated && setName(d.name))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function push(role: Msg["role"], text: string) {
    setMessages((m) => [...m, { role, text }]);
  }

  async function send() {
    const text = input.trim();
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

  return (
    <>
      <header className="header">
        <div className="brand">
          <span className="brand-logo"><LogoIcon /></span>
          <div>
            <h1>بانک‌یار</h1>
            <div className="sub"><span className="dot-online" />دستیار هوشمند بانکی · آنلاین</div>
          </div>
        </div>
        {name ? (
          <span className="user-chip"><UserIcon />{name}</span>
        ) : (
          <button className="btn ghost" onClick={() => setShowLogin(true)}>ورود</button>
        )}
      </header>

      <div className="chat" ref={chatRef}>
        {messages.map((m, i) =>
          m.role === "bot" ? (
            <div className="row bot" key={i}>
              <span className="avatar"><BotIcon /></span>
              <div className="msg">{m.text}</div>
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
            <div className="msg" aria-label="در حال نوشتن">
              <span className="typing"><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="field">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="پیام خود را بنویسید…"
            aria-label="متن پیام"
          />
        </div>
        <button className="btn icon" onClick={send} disabled={busy} aria-label="ارسال پیام">
          <SendIcon />
        </button>
      </div>

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
