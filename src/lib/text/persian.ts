// Persian text normalization + helpers.
// Iranian banking text mixes Arabic/Persian letters, ZWNJ, and Persian/ASCII
// digits; normalizing makes intent matching and retrieval far more reliable.

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnglishDigits(input: string): string {
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out
      .replace(new RegExp(PERSIAN_DIGITS[i], "g"), String(i))
      .replace(new RegExp(ARABIC_DIGITS[i], "g"), String(i));
  }
  return out;
}

export function normalizePersian(input: string): string {
  return toEnglishDigits(input)
    .replace(/ي/g, "ی") // Arabic yeh ي -> Persian ye ی
    .replace(/ك/g, "ک") // Arabic kaf ك -> Persian ke ک
    .replace(/‌/g, " ") // ZWNJ (نیم‌فاصله) -> space
    .replace(/[ً-ٰٟ]/g, "") // strip harakat/diacritics
    .replace(/\s+/g, " ")
    .trim();
}

export type DestinationType = "iban" | "card";

// Detect a 16-digit card number even when grouped with spaces/dashes
// (e.g. "6037-9911-1111-1111" or "6037 9911 1111 1111").
const CARD_RE = /(?:\d[ -]?){15}\d/;

// Pull the first amount (in Toman or Rial) and a destination card/IBAN from text.
export function extractTransferParams(raw: string): {
  amount?: string; // normalized to IRR (rial)
  destination?: string;
  destinationType?: DestinationType;
} {
  const t = toEnglishDigits(raw);

  // Destination: IBAN (شبا) = IR + 24 digits, or a 16-digit card number.
  const iban = t.match(/IR\d{24}/i)?.[0];
  const cardRaw = !iban ? t.match(CARD_RE)?.[0] : undefined;
  const card = cardRaw?.replace(/[ -]/g, "");
  const destination = iban ?? card;
  const destinationType: DestinationType | undefined = iban ? "iban" : card ? "card" : undefined;

  // Strip the destination digits from the text BEFORE reading the amount, so we
  // never mistake the card/IBAN number for the amount.
  let amountText = t;
  if (iban) amountText = amountText.replace(iban, " ");
  if (cardRaw) amountText = amountText.replace(cardRaw, " ");

  // amount: a number optionally followed by a scale and unit.
  let amount: string | undefined;
  const m = amountText.match(/(\d[\d,]*)\s*(میلیارد|میلیون|هزار)?\s*(تومان|تومن|ریال)?/);
  if (m) {
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2] === "هزار") n *= 1_000;
    else if (m[2] === "میلیون") n *= 1_000_000;
    else if (m[2] === "میلیارد") n *= 1_000_000_000;
    // Default unit in everyday Iranian speech is Toman; convert to Rial.
    if (m[3] !== "ریال") n *= 10; // Toman -> Rial
    if (n > 0) amount = String(n);
  }

  return { amount, destination, destinationType };
}

// Quick check: does the text contain a transfer destination (card or IBAN)?
// Used by intent detection so "۲۰۰ تومان به ۶۰۳۷…" routes to transfer even
// without an explicit verb like «بفرست».
export function hasTransferDestination(raw: string): boolean {
  const stripped = toEnglishDigits(raw).replace(/[ -]/g, "");
  return /IR\d{24}/i.test(stripped) || /\d{16}/.test(stripped);
}

// Detect which of the customer's OWN accounts is the transfer DESTINATION,
// e.g. "به حساب پس‌اندازم" / "از پس‌اندازم به جاری". Direction-aware: words like
// به/تو/توی/داخل mark the destination, از marks the source (so the destination
// is the other account). Returns the destination type, or null if unclear.
export function parseSelfAccount(raw: string): "savings" | "current" | null {
  const t = normalizePersian(raw);
  const acct = (s: string): "savings" | "current" => (/جاری/.test(s) ? "current" : "savings");
  const ACC = "(پس ?انداز|پسنداز|جاری)";

  const hasSavings = /(پس ?انداز|پسنداز)/.test(t);
  const hasCurrent = /جاری/.test(t);
  if (!hasSavings && !hasCurrent) return null;

  // 1. Explicit destination marker wins.
  const dest = t.match(new RegExp(`(?:به|تو|توی|داخل)\\s*(?:حساب\\s*)?${ACC}`));
  if (dest) return acct(dest[1]);

  // 2. Only a source given ("از ... ") → destination is the OTHER account
  //    (only when both account types exist; here there are exactly two).
  const src = t.match(new RegExp(`از\\s*(?:حساب\\s*)?${ACC}`));
  if (src) {
    if (hasSavings && hasCurrent) return acct(src[1]) === "current" ? "savings" : "current";
    return null; // source known, destination unknown → let the dialog ask
  }

  // 3. A single account named with no direction → treat it as the destination.
  if (hasSavings !== hasCurrent) return hasSavings ? "savings" : "current";
  return null; // both named, no direction → ambiguous, ask
}

// Detect the SOURCE account the user wants to pay FROM, e.g. "از حساب پس‌اندازم".
// Returns the account type, or null if not specified.
export function parseSourceAccount(raw: string): "savings" | "current" | null {
  const t = normalizePersian(raw);
  const m = t.match(/از\s*(?:حساب\s*)?(پس ?انداز|پسنداز|جاری)/);
  if (!m) return null;
  return /جاری/.test(m[1]) ? "current" : "savings";
}
