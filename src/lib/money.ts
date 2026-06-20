// Exact IRR money math on decimal strings (no float drift).
import Decimal from "decimal.js";

export function toDecimal(v: string | number): Decimal {
  return new Decimal(v || 0);
}

export function add(a: string, b: string): string {
  return new Decimal(a).plus(b).toFixed();
}

export function sub(a: string, b: string): string {
  return new Decimal(a).minus(b).toFixed();
}

export function gte(a: string, b: string): boolean {
  return new Decimal(a).gte(b);
}

export function isPositive(a: string): boolean {
  return new Decimal(a).gt(0);
}

// Format IRR with Persian digits and thousands separators, e.g. "۱٬۲۰۰٬۰۰۰ ریال".
export function formatIRR(v: string): string {
  const grouped = new Decimal(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return `${toPersianDigits(grouped)} ریال`;
}

export function toPersianDigits(s: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return s.replace(/\d/g, (d) => fa[Number(d)]);
}
