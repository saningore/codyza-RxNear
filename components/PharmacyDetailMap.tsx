"use client";

import { useState } from "react";
import PharmacyMap from "@/components/PharmacyMap";
import type { Pharmacy, SearchOrigin } from "@/lib/types";

export default function PharmacyDetailMap({ pharmacy, distanceMiles }: { pharmacy: Pharmacy; distanceMiles: number | null }) {
  const [activeNpi, setActiveNpi] = useState<string | null>(pharmacy.npi);
  if (pharmacy.latitude === null || pharmacy.longitude === null) return null;
  const origin: SearchOrigin = {
    label: pharmacy.name,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    precision: "address",
    state: pharmacy.state,
    accuracyMeters: null,
  };
  return (
    <PharmacyMap
      origin={origin}
      pharmacies={[{ ...pharmacy, distanceMiles }]}
      activeNpi={activeNpi}
      onActive={setActiveNpi}
    />
  );
}
