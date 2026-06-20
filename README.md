# بانک‌یار (BankYar) — Persian AI Banking Assistant (MVP)

An AI customer-service chatbot for an Iranian bank. Persian-first (RTL),
sanction-aware (LLM access via a **domestic gateway**, swappable by config),
and built so the LLM **never moves money directly** — it routes to a
deterministic, audited banking tool layer gated by step-up OTP.

> Reference model: Bank Tejarat (تجارت). See `bankyar-project-charter.md` for
> the full analysis, objectives, and roadmap.

## What the MVP does
- **FAQ (RAG):** answers common Persian banking questions grounded in an
  approved knowledge base (ساعت کاری، رمز پویا، مسدودی کارت، شبا، …).
- **Authenticated read:** account balance and recent transactions.
- **Transactional:** card-to-card / IBAN transfer **behind OTP** (رمز پویا
  style) with confirmation, limit checks, idempotency, and an audit trail.
- **Human handoff** and on-topic **guardrails** + **PII redaction**.

It runs with **zero external services**: with no LLM/SMS keys it falls back to
keyword intent classification, extractive FAQ answers, and console-printed OTP
codes — so you can try the full flow immediately.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Prisma (+ SQLite dev /
Postgres+pgvector prod) · decimal.js · zod · signed-cookie session + scrypt.
LLM via an OpenAI-compatible **domestic gateway**; OTP via an Iranian SMS
provider (Kavenegar / SMS.ir / Ghasedak).

## Getting started
```bash
cp .env.example .env        # works as-is for local dev
npm install                 # runs prisma generate
npm run db:push             # create SQLite schema
npm run db:seed             # demo customer + Persian FAQ
npm run dev                 # http://localhost:3000
```
Demo login → mobile `09120000000`, password `1234`.

Try in the chat:
- «ساعت کاری شعب چنده؟» → grounded FAQ answer
- «موجودی حسابم چقدره؟» → prompts login, then shows balance
- «۵۰۰ هزار تومان به ۶۰۳۷۹۹۱۱۱۱۱۱۱۱۱۱ منتقل کن» → OTP modal → transfer
  (the OTP is printed to the server console in dev)

## Going to production
1. Set `provider = "postgresql"` in `prisma/schema.prisma`, add a `pgvector`
   embedding column to `KbChunk`, and replace lexical search in
   `src/lib/agent/rag.ts` with semantic retrieval.
2. Set real `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` (domestic gateway) and a
   strong `SESSION_SECRET`.
3. Implement the chosen SMS provider in `src/lib/sms/provider.ts`.
4. Replace the mock account logic in `src/lib/banking/tools.ts` with the real
   core-banking adapter (keep the same validate → confirm → OTP → execute →
   audit contract).
5. Deploy to **domestic hosting** (Liara / ArvanCloud) — not Vercel — for
   data residency.

## Architecture
```
UI (RTL) → /api/chat → orchestrator
  normalize → guardrails → intent → { faq(RAG) | balance | transactions
                                      | transfer→OTP | human } → guardrails → audit
```
Key files: `src/lib/agent/orchestrator.ts`, `src/lib/agent/{guardrails,intent,rag}.ts`,
`src/lib/banking/tools.ts`, `src/lib/auth/{session,otp,password}.ts`,
`src/lib/llm/provider.ts`, `src/lib/text/persian.ts`.

## Security notes
- The LLM only classifies/answers; it cannot execute transfers.
- Transfers: validated (zod) → user-confirmed → OTP step-up → executed in a DB
  transaction → audited. Idempotency keys prevent double-spend.
- PII (card PAN, IBAN/شبا, national id) is redacted before logging.
- This MVP uses mock balances; do not connect to real accounts without the
  production hardening above and a security/compliance review.
