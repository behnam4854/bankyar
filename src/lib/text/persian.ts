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

// Pull the first amount (in Toman or Rial) and a destination card/IBAN from text.
export function extractTransferParams(raw: string): {
  amount?: string; // normalized to IRR (rial)
  destination?: string;
} {
  const t = toEnglishDigits(raw);

  // IBAN (شبا): IR + 24 digits
  const iban = t.match(/IR\d{24}/i)?.[0];
  // 16-digit card number (allow spaces/dashes)
  const card = t.replace(/[\s-]/g, "").match(/\b\d{16}\b/)?.[0];

  // amount: a number optionally followed by تومان/هزار/میلیون
  let amount: string | undefined;
  const m = t.match(/(\d[\d,]*)\s*(میلیون|هزار)?\s*(تومان|تومن|ریال)?/);
  if (m) {
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2] === "هزار") n *= 1_000;
    if (m[2] === "میلیون") n *= 1_000_000;
    // Default unit in everyday Iranian speech is Toman; convert to Rial.
    const unit = m[3];
    if (unit !== "ریال") n *= 10; // Toman -> Rial
    if (n > 0) amount = String(n);
  }

  return { amount, destination: iban ?? card };
}
