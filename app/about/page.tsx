import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-semibold">About RxNear</h1>
      <p className="mt-4 text-lg text-ink/80">
        RxNear helps you find pharmacies near your current location or a U.S. address or ZIP code. The list comes from the federal National Provider Identifier registry. It is a locator, not a pharmacy.
      </p>
      <h2 className="mt-8 font-serif text-2xl font-semibold">What a search includes</h2>
      <p className="mt-3 text-ink/80">
        The default list is community and retail pharmacies, clinic pharmacies, compounding pharmacies, specialty pharmacies, and pharmacy records that NPPES did not classify further. Mail-order, long-term care, institutional, nuclear, home infusion, and managed-care registrations stay behind a switch because many of them are not a counter you can walk into. A record that has both a retail code and another code stays in the default list. A ZIP or city search also keeps a pharmacy that is inside the Census boundary, or published in the searched ZIP code, even when it is farther than the radius from the center.
      </p>
      <p className="mt-3 text-ink/80">
        The map loads before a search so you can look around the country. Pharmacy pins appear only after a search. A saved copy of the last successful search can be shown if the registries cannot be reached, and it is labeled with the time it was retrieved. Notifications, if you turn them on, say only that the federal NPI list for a saved location changed.
      </p>
      <h2 className="mt-8 font-serif text-2xl font-semibold">What a result can tell you</h2>
      <p className="mt-3 text-ink/80">
        Name, address, phone, NPI, taxonomy, and license are federal record fields. Distance is calculated by RxNear. A website, hours, wheelchair note, or drive-through note appears only after a strict OpenStreetMap match, and it is labeled as such. If a fact cannot be verified, RxNear shows “Information unavailable.”
      </p>
      <p className="mt-6 rounded-2xl bg-moss px-4 py-3 text-sm">Call the pharmacy before you visit. Hours and stock change, and RxNear does not receive them from the pharmacy.</p>
    </article>
  );
}
