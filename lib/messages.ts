export const MSG = {
  enter: "Enter a U.S. ZIP code, city, or street address.",
  zip: "Enter a 5-digit U.S. ZIP code.",
  unknownZip: "That ZIP code is not in the Census gazetteer. Try a street address.",
  address: "That address could not be matched. Try a ZIP code or a fuller street address.",
  outside: "RxNear searches U.S. locations, including Puerto Rico and U.S. territories. Enter a U.S. address or ZIP code.",
  cityState: "Enter a city and a two-letter state, for example Chicago, IL.",
  denied: "Location access was denied. Enter a U.S. address or ZIP code to search.",
  timeout: "Your location could not be read in time. Enter a U.S. address or ZIP code.",
  unavailableLocation: "Your location could not be read. Enter a U.S. address or ZIP code.",
  unsupported: "This browser cannot share location. Enter a U.S. address or ZIP code.",
  nppes: "The NPPES pharmacy registry could not be reached. No pharmacies are shown. Try again.",
  geocodePartial: "Some locations could not be placed on the map. Their published address is still listed.",
  zipPartial: "Some nearby ZIP codes could not be checked in NPPES. The list may be incomplete.",
  boundaryMissing: "The Census boundary for this area could not be loaded. Results use the center point, plus any pharmacy whose published ZIP code is the one you searched.",
  offline: "Showing a saved copy. The registries were not contacted again.",
  rate: "Too many searches. Wait a minute and try again.",
  fixtures: "RxNear does not serve fixture pharmacies.",
} as const;

export function emptyResults(radius: number, place: string): string {
  return `No pharmacies in the National Provider Identifier registry were found within ${radius} miles of ${place}.`;
}

export function ambiguousPlace(name: string, state: string): string {
  return `Several places match. Add a state, for example ${name}, ${state}.`;
}
