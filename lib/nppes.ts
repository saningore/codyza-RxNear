import { formatPhone, formatPostal, publishedText, textOrNull, zipFive } from "@/lib/format";
import { isPharmacyCode, prefersRetail, typeIdForCode, typeLabel } from "@/lib/taxonomy";
import { nameTokens, streetNumber } from "@/lib/match";
import type { Pharmacy, PharmacyTypeId } from "@/lib/types";

export type NpiAddress = {
  address_1?: string;
  address_2?: string;
  address_purpose?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
  country_code?: string;
};

export type NpiTaxonomy = {
  code?: string;
  desc?: string;
  primary?: boolean;
  state?: string | null;
  license?: string | null;
};

export type NpiRecord = {
  number?: string | number;
  basic?: {
    organization_name?: string;
    status?: string;
    last_updated?: string;
    parent_organization_legal_business_name?: string;
  };
  other_names?: { organization_name?: string; type?: string }[];
  addresses?: NpiAddress[];
  taxonomies?: NpiTaxonomy[];
};

function locationAddress(record: NpiRecord): NpiAddress | null {
  return record.addresses?.find((address) => address.address_purpose === "LOCATION" && address.country_code === "US") ?? null;
}

export function pharmacyFromRecord(record: NpiRecord, retrievedAt: string): Pharmacy | null {
  const npi = String(record.number ?? "");
  if (!/^\d{10}$/.test(npi)) return null;
  const taxonomies = record.taxonomies ?? [];
  const pharmacyTaxonomies = taxonomies.filter((item) => isPharmacyCode(item.code));
  if (!pharmacyTaxonomies.length) return null;
  const address = locationAddress(record);
  if (!address) return null;
  const legal = publishedText(textOrNull(record.basic?.organization_name));
  const dba = publishedText(textOrNull(record.other_names?.find((item) => item.type === "Doing Business As")?.organization_name ?? null));
  const name = dba ?? legal;
  if (!name) return null;
  const ordered = [...pharmacyTaxonomies].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  const types = [...new Set(ordered.map((item) => typeIdForCode(item.code)).filter((item): item is PharmacyTypeId => Boolean(item)))];
  if (!types.length) return null;
  const primary = ordered[0];
  const licenseNumber = textOrNull(primary?.license ?? null);
  const licenseState = textOrNull(primary?.state ?? null);
  const license = [licenseNumber, licenseState ? `(${licenseState})` : null].filter(Boolean).join(" ") || null;
  const street = [publishedText(address.address_1), publishedText(address.address_2)].filter(Boolean).join(", ");
  const inactive = Boolean(record.basic?.status && record.basic.status !== "A");
  return {
    npi,
    name,
    aka: dba && legal && dba.toLowerCase() !== legal.toLowerCase() ? legal : null,
    types,
    typeLabel: types.map(typeLabel).join(", "),
    addressLine: street || null,
    city: publishedText(address.city),
    state: textOrNull(address.state)?.toUpperCase() ?? null,
    postalCode: formatPostal(address.postal_code),
    phone: formatPhone(address.telephone_number),
    website: null,
    hours: null,
    openNow: null,
    openNowNote: null,
    wheelchair: null,
    driveThrough: null,
    osmNote: null,
    latitude: null,
    longitude: null,
    coordinateNote: null,
    distanceMiles: null,
    distanceApproximate: false,
    insideBoundary: null,
    beyondSelectedRadius: false,
    boundaryNote: null,
    otherNpis: [],
    license,
    taxonomy: ordered.map((item) => textOrNull(item.desc)).filter((item): item is string => Boolean(item)).join("; ") || null,
    updated: textOrNull(record.basic?.last_updated ?? null),
    parentName: publishedText(record.basic?.parent_organization_legal_business_name ?? null),
    inactive,
    sourceName: "CMS National Plan and Provider Enumeration System",
    sourceUrl: "https://npiregistry.cms.hhs.gov/",
    sourceRecordUrl: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
    retrievedAt,
  };
}

export function collapseKey(pharmacy: Pharmacy): string {
  const zip = zipFive(pharmacy.postalCode) ?? "";
  const number = streetNumber(pharmacy.addressLine) ?? "";
  const name = nameTokens(pharmacy.name)[0] ?? publishedText(pharmacy.name)?.toUpperCase() ?? "";
  const street = (pharmacy.addressLine ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return number ? `${zip}|${number}|${name}` : `${zip}|${street}|${name}`;
}

export function collapsePharmacies(pharmacies: Pharmacy[]): Pharmacy[] {
  const groups = new Map<string, Pharmacy[]>();
  for (const pharmacy of pharmacies) {
    const key = collapseKey(pharmacy);
    const group = groups.get(key);
    if (group) group.push(pharmacy);
    else groups.set(key, [pharmacy]);
  }
  const collapsed: Pharmacy[] = [];
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => prefersRetail(a.types) - prefersRetail(b.types) || a.npi.localeCompare(b.npi));
    const [keeper, ...rest] = ranked;
    if (!keeper) continue;
    const types = [...new Set(group.flatMap((item) => item.types))];
    keeper.types = types;
    keeper.typeLabel = types.map(typeLabel).join(", ");
    keeper.otherNpis = rest.map((item) => item.npi);
    if (!keeper.phone) keeper.phone = rest.find((item) => item.phone)?.phone ?? null;
    collapsed.push(keeper);
  }
  return collapsed;
}
