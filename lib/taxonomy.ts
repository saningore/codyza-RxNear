import { PHARMACY_TYPES, type PharmacyTypeId } from "@/lib/types";

const BY_CODE = new Map<string, PharmacyTypeId>();
for (const type of PHARMACY_TYPES) {
  for (const code of type.codes) BY_CODE.set(code, type.id);
}

export function typeIdForCode(code: string | null | undefined): PharmacyTypeId | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function isPharmacyCode(code: string | null | undefined): boolean {
  return typeof code === "string" && /^3336[A-Z0-9]{5}X$/i.test(code);
}

export function defaultTypeIds(): PharmacyTypeId[] {
  return PHARMACY_TYPES.filter((type) => type.defaultOn).map((type) => type.id);
}

export function isDefaultType(id: PharmacyTypeId): boolean {
  return PHARMACY_TYPES.find((type) => type.id === id)?.defaultOn ?? false;
}

export function typeLabel(id: PharmacyTypeId): string {
  return PHARMACY_TYPES.find((type) => type.id === id)?.label ?? id;
}

export function prefersRetail(types: PharmacyTypeId[]): number {
  const order = PHARMACY_TYPES.map((type) => type.id);
  const ranks = types.map((type) => order.indexOf(type)).filter((rank) => rank >= 0);
  return ranks.length ? Math.min(...ranks) : order.length;
}
