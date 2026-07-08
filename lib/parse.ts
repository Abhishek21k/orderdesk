// Field parsers for the messy legacy export. Each returns null on failure so
// the importer can reject-and-count rather than throw.

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Returns an ISO YYYY-MM-DD string, or null if unparseable.
// Handles ISO 2026-03-14, US 03/14/2026 (always MM/DD/YYYY), and 14 Mar 2026.
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return isValidYmd(m[1], m[2], m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;

  // US slash MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return isValidYmd(m[3], mm, dd) ? `${m[3]}-${mm}-${dd}` : null;
  }

  // DD Mon YYYY
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mm) return null;
    const dd = m[1].padStart(2, "0");
    return isValidYmd(m[3], mm, dd) ? `${m[3]}-${mm}-${dd}` : null;
  }

  return null;
}

function isValidYmd(y: string, mm: string, dd: string): boolean {
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dim = new Date(Number(y), month, 0).getDate();
  return day <= dim;
}

// Strip $, commas, spaces; return integer cents (may be negative). null if empty
// or non-numeric. Rounds half-up to the cent in case of stray extra digits.
export function parseAmountCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const neg = cleaned.startsWith("-");
  const abs = neg ? cleaned.slice(1) : cleaned;
  const [intPart, fracRaw = ""] = abs.split(".");
  const frac = (fracRaw + "00").slice(0, 3); // two cents digits + one for rounding
  let cents = Number(intPart) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1; // half-up on sub-cent
  return neg ? -cents : cents;
}
