"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Popup } from "maplibre-gl";
import { accuracyRing } from "@/lib/geo";
import { distanceLabel, escapeHtml } from "@/lib/format";
import type { AreaBoundary, Pharmacy, SearchOrigin } from "@/lib/types";

type Props = {
  origin: SearchOrigin | null;
  pharmacies: Pharmacy[];
  boundary?: AreaBoundary | null;
  activeNpi: string | null;
  onActive: (npi: string | null) => void;
};

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const EXPLORE: [number, number] = [-98.5, 39.8];

export default function PharmacyMap({ origin, pharmacies, boundary = null, activeNpi, onActive }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const paintRef = useRef<() => void>(() => {});
  const onActiveRef = useRef(onActive);
  const dataRef = useRef({ origin, pharmacies, boundary, activeNpi });
  const [ready, setReady] = useState(false);
  onActiveRef.current = onActive;
  dataRef.current = { origin, pharmacies, boundary, activeNpi };
  const latitude = origin?.latitude ?? null;
  const longitude = origin?.longitude ?? null;

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(`/api/maplibre-worker?v=${maplibregl.getVersion()}`);
      const placed = latitude !== null && longitude !== null;
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: placed ? [longitude, latitude] : EXPLORE,
        zoom: placed ? 11 : 3.2,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 16, maxWidth: "260px", className: "rx-popup" });
      let suppressClose = false;
      popup.on("close", () => {
        if (!suppressClose) onActiveRef.current(null);
      });
      mapRef.current = map;
      popupRef.current = popup;
      map.on("load", () => {
        if (!map) return;
        map.addSource("boundary", { type: "geojson", data: empty });
        map.addSource("accuracy", { type: "geojson", data: empty });
        map.addSource("origin", { type: "geojson", data: empty });
        map.addSource("pharmacies", { type: "geojson", data: empty });
        map.addLayer({ id: "boundary-fill", type: "fill", source: "boundary", paint: { "fill-color": "#0f6e56", "fill-opacity": 0.12 } });
        map.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#0f6e56", "line-width": 2 } });
        map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#0f6e56", "fill-opacity": 0.15 } });
        map.addLayer({
          id: "origin-circle",
          type: "circle",
          source: "origin",
          paint: { "circle-radius": 7, "circle-color": "#1c1917", "circle-stroke-width": 2, "circle-stroke-color": "#fffdfb" },
        });
        map.addLayer({
          id: "pharmacy-circle",
          type: "circle",
          source: "pharmacies",
          paint: {
            "circle-radius": ["case", ["==", ["get", "beyond"], 1], 8, 7],
            "circle-color": ["case", ["==", ["get", "approximate"], 1], "#b45309", ["==", ["get", "beyond"], 1], "#9a3412", "#0f6e56"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fffdfb",
          },
        });
        map.on("click", "pharmacy-circle", (event) => {
          const npi = event.features?.[0]?.properties?.npi;
          if (typeof npi === "string") onActiveRef.current(npi);
        });
        map.on("mouseenter", "pharmacy-circle", () => {
          map?.getCanvas().style.setProperty("cursor", "pointer");
        });
        map.on("mouseleave", "pharmacy-circle", () => {
          map?.getCanvas().style.setProperty("cursor", "");
        });
        let framed = "";
        paintRef.current = () => {
          const current = dataRef.current;
          const place = current.origin;
          const shape = current.boundary;
          (map?.getSource("boundary") as GeoJSONSource | undefined)?.setData(shape
            ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: shape.geometry }] }
            : empty);
          const accuracy = place?.accuracyMeters ?? null;
          const accuracyData: GeoJSON.FeatureCollection = place && accuracy && accuracy >= 100 && accuracy <= 50000
            ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [accuracyRing(place.latitude, place.longitude, accuracy)] } }] }
            : empty;
          (map?.getSource("accuracy") as GeoJSONSource | undefined)?.setData(accuracyData);
          (map?.getSource("origin") as GeoJSONSource | undefined)?.setData(place
            ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { label: place.label }, geometry: { type: "Point", coordinates: [place.longitude, place.latitude] } }] }
            : empty);
          (map?.getSource("pharmacies") as GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: place ? current.pharmacies.filter((pharmacy) => pharmacy.latitude !== null && pharmacy.longitude !== null).map((pharmacy) => ({
              type: "Feature" as const,
              properties: {
                npi: pharmacy.npi,
                name: pharmacy.name,
                approximate: pharmacy.distanceApproximate ? 1 : 0,
                beyond: pharmacy.beyondSelectedRadius ? 1 : 0,
                distance: distanceLabel(pharmacy.distanceMiles, pharmacy.distanceApproximate, place.precision) ?? "",
              },
              geometry: { type: "Point" as const, coordinates: [pharmacy.longitude as number, pharmacy.latitude as number] },
            })) : [],
          });
          const active = place ? current.pharmacies.find((pharmacy) => pharmacy.npi === current.activeNpi && pharmacy.latitude !== null && pharmacy.longitude !== null) : undefined;
          if (active && popupRef.current && map && place) {
            const distance = distanceLabel(active.distanceMiles, active.distanceApproximate, place.precision);
            popupRef.current.setLngLat([active.longitude as number, active.latitude as number]).setHTML(
              `<p class="rx-popup-name">${escapeHtml(active.name)}</p><p class="rx-popup-meta">${escapeHtml(distance ?? "Distance unavailable")}</p>`,
            ).addTo(map);
          } else if (popupRef.current?.isOpen()) {
            suppressClose = true;
            popupRef.current.remove();
            suppressClose = false;
          }
          const frame = place
            ? `${place.latitude},${place.longitude}:${shape?.label ?? ""}:${current.pharmacies.map((pharmacy) => pharmacy.npi).join(",")}`
            : "explore";
          if (frame !== framed && place) {
            framed = frame;
            const points: [number, number][] = [[place.longitude, place.latitude]];
            for (const pharmacy of current.pharmacies) {
              if (pharmacy.latitude !== null && pharmacy.longitude !== null) points.push([pharmacy.longitude, pharmacy.latitude]);
            }
            const lons = points.map((point) => point[0]);
            const lats = points.map((point) => point[1]);
            map?.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 48, maxZoom: 14, duration: 0 });
          } else if (!place) {
            framed = frame;
          }
        };
        paintRef.current();
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      paintRef.current = () => {};
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [latitude, longitude]);

  useEffect(() => {
    paintRef.current();
  }, [origin, pharmacies, boundary, activeNpi]);

  return (
    <div
      ref={container}
      className="h-60 w-full overflow-hidden rounded-3xl border border-line lg:h-[32rem]"
      data-map-ready={ready ? "true" : "false"}
      role="region"
      aria-label={origin ? "Map of nearby pharmacies" : "Map of the United States"}
    />
  );
}
