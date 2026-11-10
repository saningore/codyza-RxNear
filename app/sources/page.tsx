import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources" };

const sources = [
  {
    name: "CMS NPPES",
    href: "https://npiregistry.cms.hhs.gov/api-page",
    detail: "Live organizational NPI records whose taxonomy code starts with 3336. RxNear uses the practice location, not the mailing address, and the doing-business-as name when NPPES published one. A phone is shown only when that location record has a 10-digit number. Deactivated records are left out of search.",
  },
  {
    name: "U.S. Census Bureau geocoder",
    href: "https://geocoding.geo.census.gov/geocoder/",
    detail: "Street addresses are matched to coordinates. A map pin is drawn only after that match. If the match fails, the pharmacy stays in the list and the distance is labeled as approximate.",
  },
  {
    name: "U.S. Census Bureau TIGERweb",
    href: "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html",
    detail: "ZIP Code Tabulation Area and place polygons. A pharmacy farther than the selected radius stays in the list when its Census point is inside that boundary, or when its published ZIP code is the ZIP code you searched. The shaded map area is that Census boundary. If the boundary cannot be loaded, the page says so.",
  },
  {
    name: "U.S. Census Bureau gazetteer",
    href: "https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html",
    detail: "2025 ZIP Code Tabulation Area centers and place locations. A ZIP search starts at the ZIP code center, and that is said on the result.",
  },
  {
    name: "OpenStreetMap",
    href: "https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dpharmacy",
    detail: "Website, hours, wheelchair access, and drive-through are added only when a pharmacy tagged amenity=pharmacy matches the same NPI address or sits within 120 meters with a matching name. A same-name pharmacy farther than 250 meters is not used. These fields are community-mapped, not confirmed by the pharmacy.",
  },
  {
    name: "OpenFreeMap",
    href: "https://openfreemap.org/",
    detail: "Basemap tiles. The public tile.openstreetmap.org server is not used.",
  },
];

export default function SourcesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-semibold">Where the information comes from</h1>
      <p className="mt-4 text-lg text-ink/80">Each pharmacy links to its NPPES record. A missing fact is shown as “Information unavailable.”</p>
      <ul className="mt-8 space-y-4">
        {sources.map((source) => (
          <li key={source.name} className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-serif text-2xl font-semibold">
              <a className="underline decoration-pine/40 underline-offset-4" href={source.href}>{source.name}</a>
            </h2>
            <p className="mt-2 text-ink/80">{source.detail}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-10 font-serif text-2xl font-semibold">What RxNear does not fill in</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink/80">
        <li>Medication stock, prices, coupons, or insurance coverage.</li>
        <li>Star ratings, photos, or a claim that one pharmacy is best.</li>
        <li>Opening hours, a website, wheelchair access, or a drive-through unless OpenStreetMap matched that pharmacy.</li>
        <li>A map pin when the Census geocoder could not match the published address.</li>
        <li>Individual pharmacists. This site lists pharmacy organizations.</li>
      </ul>
    </article>
  );
}
