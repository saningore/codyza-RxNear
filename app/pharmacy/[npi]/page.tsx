import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import PharmacyDetailMap from "@/components/PharmacyDetailMap";
import { directionsHref, fullAddress, show, telHref, websiteHref } from "@/lib/format";
import { distanceFrom, getPharmacy } from "@/lib/search";
import { UNAVAILABLE } from "@/lib/types";

export const dynamic = "force-dynamic";

const loadPharmacy = cache((npi: string) => getPharmacy(npi));

export async function generateMetadata({ params }: { params: Promise<{ npi: string }> }): Promise<Metadata> {
  const { npi } = await params;
  if (!/^\d{10}$/.test(npi)) return { title: "Pharmacy" };
  const pharmacy = await loadPharmacy(npi).catch(() => null);
  return { title: pharmacy?.name ?? "Pharmacy" };
}

export default async function PharmacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ npi: string }>;
  searchParams: Promise<{ lat?: string; lon?: string }>;
}) {
  const { npi } = await params;
  if (!/^\d{10}$/.test(npi)) notFound();
  let pharmacy;
  try {
    pharmacy = await loadPharmacy(npi);
  } catch {
    throw new Error("The NPPES pharmacy registry could not be reached. No pharmacies are shown. Try again.");
  }
  if (!pharmacy) notFound();
  const query = await searchParams;
  const latitude = Number(query.lat);
  const longitude = Number(query.lon);
  const miles = Number.isFinite(latitude) && Number.isFinite(longitude) ? distanceFrom(pharmacy, latitude, longitude) : null;
  const address = fullAddress(pharmacy);
  const directions = directionsHref(pharmacy.latitude, pharmacy.longitude, address);
  const phone = telHref(pharmacy.phone);
  const site = websiteHref(pharmacy.website);
  const facts: { label: string; value: string | null }[] = [
    { label: "Address", value: address },
    { label: "Phone", value: pharmacy.phone },
    { label: "Distance from your search", value: miles === null ? null : `${miles} mi` },
    { label: "NPI", value: pharmacy.npi },
    { label: "Also registered as", value: pharmacy.otherNpis.length ? pharmacy.otherNpis.join(", ") : null },
    { label: "Pharmacy type", value: pharmacy.typeLabel },
    { label: "Taxonomy", value: pharmacy.taxonomy },
    { label: "License", value: pharmacy.license },
    { label: "Parent organization", value: pharmacy.parentName },
    { label: "NPPES record updated", value: pharmacy.updated },
    { label: "Website", value: pharmacy.website },
    { label: "Hours", value: pharmacy.hours },
    { label: "Open now", value: pharmacy.openNow === null ? null : pharmacy.openNow ? "Open now" : "Closed now" },
    { label: "Wheelchair access", value: pharmacy.wheelchair },
    { label: "Drive-through", value: pharmacy.driveThrough },
    { label: "Map location", value: pharmacy.latitude !== null ? pharmacy.coordinateNote : null },
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link className="text-sm font-semibold text-pine underline" href="/">Back to search</Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-pine">{pharmacy.typeLabel}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight">{pharmacy.name}</h1>
      {pharmacy.aka && <p className="mt-2 text-ink/75">Also listed as {pharmacy.aka}</p>}
      {pharmacy.inactive && (
        <p className="mt-4 rounded-2xl bg-amber px-4 py-3 text-sm font-semibold">This NPI is not active in NPPES. RxNear is not presenting it as a place to visit.</p>
      )}
      <p className="mt-4 rounded-2xl bg-moss px-4 py-3 text-sm">Listed in the federal NPI registry. Call the pharmacy to confirm hours and availability before you visit.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {phone && pharmacy.phone ? <a className="inline-flex min-h-11 items-center rounded-full bg-pine px-4 font-semibold text-card" href={phone}>Call {pharmacy.phone}</a> : <span className="inline-flex min-h-11 items-center rounded-full bg-line px-4 text-sm">Call: {UNAVAILABLE}</span>}
        {site ? <a className="inline-flex min-h-11 items-center rounded-full border border-pine px-4 font-semibold text-pine" href={site} target="_blank" rel="noopener noreferrer">Website</a> : <span className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">Website: {UNAVAILABLE}</span>}
        {directions ? <a className="inline-flex min-h-11 items-center rounded-full border border-pine px-4 font-semibold text-pine" href={directions} target="_blank" rel="noopener noreferrer">Get directions</a> : <span className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">Directions: {UNAVAILABLE}</span>}
      </div>
      {pharmacy.osmNote && <p className="mt-3 text-sm text-ink/70">{pharmacy.osmNote} {pharmacy.openNowNote ?? ""}</p>}
      {pharmacy.latitude !== null && pharmacy.longitude !== null ? (
        <div className="mt-6">
          <PharmacyDetailMap pharmacy={pharmacy} distanceMiles={miles} />
        </div>
      ) : (
        <p className="mt-6 text-ink/70">Map location: {UNAVAILABLE}</p>
      )}
      <dl className="mt-6 rounded-3xl border border-line bg-card p-5">
        {facts.map((fact) => (
          <div key={fact.label} className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[14rem_1fr]">
            <dt className="font-semibold text-ink/70">{fact.label}</dt>
            <dd className={fact.value ? undefined : "text-ink/55"}>{fact.label === "Website" && site ? <a className="font-semibold text-pine underline" href={site}>{show(fact.value)}</a> : show(fact.value)}</dd>
          </div>
        ))}
        <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
          <dt className="font-semibold text-ink/70">Source record</dt>
          <dd><a className="font-semibold text-pine underline" href={pharmacy.sourceRecordUrl} target="_blank" rel="noopener noreferrer">NPI {pharmacy.npi}</a></dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-ink/60">Source: {pharmacy.sourceName}. Retrieved {new Date(pharmacy.retrievedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.</p>
    </article>
  );
}
