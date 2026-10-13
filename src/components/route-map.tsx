"use client";

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Place, StopSummary } from "../lib/board";
import type { Corridor } from "../lib/corridor";
import { CATEGORY_COLOR } from "./categories";

type Props = {
  corridor: Corridor;
  stops: StopSummary[];
  /** The stop the board is limited to, if any. */
  selected: string | null;
  onSelect: (name: string) => void;
  /** The listings that have coordinates and are on the board now, each drawn as a small pin. */
  places: Place[];
  /** Ask the map to centre on a listing; `n` changes each time so the same one can be asked for again. */
  focus: { id: string; n: number } | null;
  onPlace: (id: string) => void;
};

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const colour = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const label = (s: StopSummary) => text(`${s.name}${s.region ? `, ${s.region}` : ""} · ${s.count === 1 ? "1 listing" : `${s.count} listings`}`);
// Leaflet writes a string tooltip as HTML, and these names come from web pages and OpenStreetMap, so it gets an element holding text.
function text(s: string): HTMLElement {
  const el = document.createElement("span");
  el.textContent = s;
  return el;
}

/** The road as a line with a pin for each town. The row of stops under it does the same from the keyboard; this is the picture.
    It loads only in the browser, since Leaflet reads the window when it loads. */
export default function RouteMap({ corridor, stops, selected, onSelect, places, focus, onPlace }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.CircleMarker>());
  const placePins = useRef(new Map<string, L.CircleMarker>());
  const latest = useRef({ stops, onSelect, onPlace });
  useEffect(() => {
    latest.current = { stops, onSelect, onPlace };
  });

  // Where the towns are, so the map is rebuilt only when the road or the towns change, not when a count does.
  const where = stops.map((s) => `${s.name}@${s.lat},${s.lon}`).join("|");

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A finger drags the page, not the map, on a phone; two fingers move and zoom it.
    const m = L.map(el, { dragging: !L.Browser.mobile, scrollWheelZoom: false, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);

    const points: L.LatLngTuple[] = [];
    if (corridor.line && corridor.line.length >= 2) {
      const road = corridor.line.map(([lon, lat]): L.LatLngTuple => [lat, lon]);
      L.polyline(road, { className: "route-line", weight: 4, interactive: false }).addTo(m);
      points.push(...road);
    }
    for (const s of latest.current.stops) {
      const pin = L.circleMarker([s.lat, s.lon], { radius: 7, weight: 2, fillOpacity: 1 }).addTo(m);
      pin.bindTooltip(label(s), { direction: "top" });
      pin.on("click", () => latest.current.onSelect(s.name));
      pins.current.set(s.name, pin);
      points.push([s.lat, s.lon]);
    }
    if (points.length > 0) m.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 12 });
    else m.setView([0, 0], 2);

    map.current = m;
    const placed = pins.current;
    return () => {
      m.remove();
      map.current = null;
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

  // The listings that have coordinates: a small pin each, in its category's colour, ringed when it is on the plan.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.layerGroup().addTo(m);
    const placed = placePins.current;
    for (const p of places) {
      const variable = CATEGORY_COLOR[p.category].match(/--[\w-]+/)?.[0] ?? "--ink-3";
      const pin = L.circleMarker([p.lat, p.lon], {
        radius: p.picked ? 7 : 5,
        weight: p.picked ? 3 : 1,
        color: colour(p.picked ? "--accent" : "--ink"),
        fillColor: colour(variable),
        fillOpacity: 1,
      }).addTo(group);
      pin.bindTooltip(text(p.title), { direction: "top" });
      pin.on("click", () => latest.current.onPlace(p.id));
      placed.set(p.id, pin);
    }
    return () => {
      group.remove();
      placed.clear();
    };
  }, [places, corridor, where]);

  useEffect(() => {
    if (!focus) return;
    const pin = placePins.current.get(focus.id);
    const m = map.current;
    if (!pin || !m) return;
    m.setView(pin.getLatLng(), Math.max(m.getZoom(), 13));
    pin.openTooltip();
  }, [focus]);

  return <div ref={canvas} className="routemap" role="region" aria-label="Map of the route" />;
}
