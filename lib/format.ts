import { UNAVAILABLE } from "@/lib/types";
import type { SearchOrigin } from "@/lib/types";

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
  guam: "GU", "american samoa": "AS", "u.s. virgin islands": "VI", "virgin islands": "VI",
  "northern mariana islands": "MP",
};

const ACRONYMS = new Set(["AIDS", "CVS", "NYC", "USA", "HHS", "LLC", "INC", "PLLC", "DDS", "MD", "RX", "VA", "PO", "NW", "NE", "SW", "SE", "APT", "STE"]);

export const US_ABBREVIATIONS = new Set(Object.values(US_STATE_NAMES));

export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function show(value: string | null | undefined): string {
  return textOrNull(value ?? null) ?? UNAVAILABLE;
}

export function publishedText(value: string | null | undefined): string | null {
  const raw = textOrNull(value ?? null);
  if (!raw) return null;
  if (raw !== raw.toUpperCase()) return raw;
  return raw.toLowerCase().replace(/\b([a-z][a-z0-9']*)/g, (word) => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

export function stateAbbreviation(value: string): string | null {
  const token = value.trim().toLowerCase().replace(/\./g, "");
  if (/^[a-z]{2}$/.test(token)) {
    const upper = token.toUpperCase();
    return US_ABBREVIATIONS.has(upper) ? upper : null;
  }
  return US_STATE_NAMES[token] ?? null;
}

export function zipFive(value: string | null | undefined): string | null {
  const match = (value ?? "").trim().match(/^(\d{5})(?:-?\d{4})?$/);
  return match ? match[1] : null;
}

export function phoneDigits(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

export function formatPhone(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  if (!digits) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function telHref(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  return digits ? `tel:+1${digits}` : null;
}

export function websiteHref(value: string | null | undefined): string | null {
  const raw = textOrNull(value ?? null);
  if (!raw) return null;
  if (/^\s*javascript:/i.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.username || url.password) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function formatPostal(value: string | null | undefined): string | null {
  const raw = textOrNull(value ?? null);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  if (digits.length === 5) return digits;
  return raw;
}

export function fullAddress(parts: {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const street = publishedText(parts.addressLine);
  const city = publishedText(parts.city);
  const state = textOrNull(parts.state);
  const zip = formatPostal(parts.postalCode);
  const locality = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const line = [street, locality].filter(Boolean).join(", ");
  return line || null;
}

export function directionsHref(latitude: number | null, longitude: number | null, address: string | null): string | null {
  if (latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}

export function distanceLabel(
  miles: number | null,
  pharmacyApproximate: boolean,
  precision: SearchOrigin["precision"],
): string | null {
  if (miles === null || !Number.isFinite(miles)) return null;
  const rounded = miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
  const fromZip = precision === "zip-center" ? " from the ZIP code center" : "";
  if (pharmacyApproximate) return `About ${rounded} mi${fromZip}`;
  return `${rounded} mi${fromZip}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
