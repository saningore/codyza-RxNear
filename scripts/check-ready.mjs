import { readFileSync } from "node:fs";

const zcta = JSON.parse(readFileSync(new URL("../data/zcta.json", import.meta.url), "utf8"));
const places = JSON.parse(readFileSync(new URL("../data/places.json", import.meta.url), "utf8"));
const zctaCount = Object.keys(zcta.centroids ?? {}).length;
const placeCount = Array.isArray(places.places) ? places.places.length : 0;

if (zctaCount < 30000 || placeCount < 20000) {
  console.error(`Gazetteer is incomplete (${zctaCount} ZIP centroids, ${placeCount} places).`);
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);
try {
  const response = await fetch("https://npiregistry.cms.hhs.gov/api/?version=2.1&number=1508125402", {
    headers: { Accept: "application/json", "User-Agent": "RxNear/1.0 (https://codyza.com; pharmacy finder)" },
    signal: controller.signal,
  });
  if (!response.ok) throw new Error(`NPPES returned ${response.status}`);
  const body = await response.json();
  const record = body?.results?.[0];
  if (record?.number !== "1508125402") throw new Error("NPPES did not return the expected public pharmacy record.");
  console.log(`Ready: ${zctaCount} ZIP centroids, ${placeCount} places, live NPI ${record.number}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
