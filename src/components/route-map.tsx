"use client";

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { StopSummary } from "../lib/board";
import type { Corridor } from "../lib/corridor";

type Props = {
  corridor: Corridor;
  stops: StopSummary[];
  /** The stop the board is limited to, if any. */
  selected: string | null;
  onSelect: (name: string) => void;
};

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const colour = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const label = (s: StopSummary) => `${s.name}${s.region ? `, ${s.region}` : ""} · ${s.count === 1 ? "1 listing" : `${s.count} listings`}`;

/** The road as a line with a pin for each town. The row of stops under it does the same from the keyboard; this is the picture.
    It loads only in the browser, since Leaflet reads the window when it loads. */
export default function RouteMap({ corridor, stops, selected, onSelect }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, L.CircleMarker>());
  const latest = useRef({ stops, onSelect });
  useEffect(() => {
    latest.current = { stops, onSelect };
  });

  // Where the towns are, so the map is rebuilt only when the road or the towns change, not when a count does.
  const where = stops.map((s) => `${s.name}@${s.lat},${s.lon}`).join("|");

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A finger drags the page, not the map, on a phone; two fingers move and zoom it.
    const map = L.map(el, { dragging: !L.Browser.mobile, scrollWheelZoom: false, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

    const points: L.LatLngTuple[] = [];
    if (corridor.line && corridor.line.length >= 2) {
      const road = corridor.line.map(([lon, lat]): L.LatLngTuple => [lat, lon]);
      L.polyline(road, { className: "route-line", weight: 4, interactive: false }).addTo(map);
      points.push(...road);
    }
    for (const s of latest.current.stops) {
      const pin = L.circleMarker([s.lat, s.lon], { radius: 7, weight: 2, fillOpacity: 1 }).addTo(map);
      pin.bindTooltip(label(s), { direction: "top" });
      pin.on("click", () => latest.current.onSelect(s.name));
      pins.current.set(s.name, pin);
      points.push([s.lat, s.lon]);
    }
    if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 12 });
    else map.setView([0, 0], 2);

    const placed = pins.current;
    return () => {
      map.remove();
      placed.clear();
    };
  }, [corridor, where]);

  useEffect(() => {
    for (const s of stops) {
      const pin = pins.current.get(s.name);
      if (!pin) continue;
      const on = s.name === selected;
      pin.setStyle({ color: colour("--ink"), weight: on ? 3 : 2, fillColor: on || s.picked ? colour("--accent") : colour("--surface") });
      pin.setRadius(on ? 11 : s.picked ? 9 : 7);
      pin.setTooltipContent(label(s));
    }
  }, [stops, selected, where]);

  return <div ref={canvas} className="routemap" role="region" aria-label="Map of the route" />;
}
