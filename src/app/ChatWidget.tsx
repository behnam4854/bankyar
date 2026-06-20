"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

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
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => d.authenticated && setName(d.name))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages]);

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
      if (data.requiresOtp) setOtpFor(data.pendingTransferId);
    } catch {
      push("bot", "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>بانک‌یار</h1>
          <div className="sub">دستیار هوشمند بانکی</div>
        </div>
        {name ? (
          <span className="sub">خوش آمدید، {name}</span>
        ) : (
          <button className="btn ghost" onClick={() => setShowLogin(true)}>
            ورود
          </button>
        )}
      </div>

      <div className="chat" ref={chatRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="msg bot">در حال نوشتن…</div>}
      </div>

      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="پیام خود را بنویسید…"
        />
        <button className="btn" onClick={send} disabled={busy}>
          ارسال
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>ورود به حساب</h3>
        <input placeholder="شماره موبایل" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        <input type="password" placeholder="رمز عبور" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <div className="hint">نمونه: ۰۹۱۲۰۰۰۰۰۰۰ / رمز: ۱۲۳۴</div>
        <button className="btn" onClick={submit} disabled={busy}>
          ورود
        </button>
      </div>
    </div>
  );
}

function OtpModal({
  pendingTransferId,
  onClose,
  onResult,
}: {
  pendingTransferId: number;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>تأیید انتقال وجه</h3>
        <div className="hint">رمز یکبارمصرف پیامک‌شده را وارد کنید (در حالت توسعه در کنسول سرور چاپ می‌شود).</div>
        <input placeholder="رمز یکبارمصرف" value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={submit} disabled={busy}>
          تأیید
        </button>
      </div>
    </div>
  );
}
