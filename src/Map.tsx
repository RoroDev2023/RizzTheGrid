// map.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import ImpactHighlights, { DEFAULT_METRICS, type Metric } from "./ImpactHighlights";
import RenewablePlanner from "./RenewablePlanner";
import * as d3 from "d3-geo";
import { feature } from "topojson-client";
import type {
  Feature as GeoFeature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import type {
  Topology,
  GeometryCollection,
  Polygon,
  MultiPolygon,
  GeometryObject,
} from "topojson-specification";

// CSV assets
import stateCsvUrl from "./data/energy_weighted_reduction_oct1_state.csv?url";
import fuelMixCsvUrl from "./data/statewide_fuel_breakdown.csv?url";

// ---------- AUTO-LOAD STATE IMAGES (Vite) ----------
const allStateImages = import.meta.glob(
  "/src/states/*/{1,2,3,4,5,6}.png",
  { eager: true, as: "url" }
) as Record<string, string>;

function buildImagesIndex() {
  const index: Record<string, string[]> = {};
  for (const [path, url] of Object.entries(allStateImages)) {
    const parts = path.split("/"); // /src/states/Alaska/3.png
    const state = parts[3];
    const n = parseInt(parts[4].split(".")[0], 10);
    if (!index[state]) index[state] = [];
    index[state][n - 1] = url;
  }
  for (const k of Object.keys(index)) index[k] = index[k].filter(Boolean).slice(0, 6);
  return index;
}
const STATE_IMAGES_INDEX = buildImagesIndex();
// ---------------------------------------------------

type USObjects = { states: GeometryCollection<Polygon | MultiPolygon> };

const FIPS_TO_NAME: Record<string, string> = {
  "01": "Alabama","02": "Alaska","04": "Arizona","05": "Arkansas","06": "California","08": "Colorado","09": "Connecticut","10": "Delaware","11": "District of Columbia","12": "Florida","13": "Georgia","15": "Hawaii","16": "Idaho","17": "Illinois","18": "Indiana","19": "Iowa","20": "Kansas","21": "Kentucky","22": "Louisiana","23": "Maine","24": "Maryland","25": "Massachusetts","26": "Michigan","27": "Minnesota","28": "Mississippi","29": "Missouri","30": "Montana","31": "Nebraska","32": "Nevada","33": "New Hampshire","34": "New Jersey","35": "New Mexico","36": "New York","37": "North Carolina","38": "North Dakota","39": "Ohio","40": "Oklahoma","41": "Oregon","42": "Pennsylvania","44": "Rhode Island","45": "South Carolina","46": "South Dakota","47": "Tennessee","48": "Texas","49": "Utah","50": "Vermont","51": "Virginia","53": "Washington","54": "West Virginia","55": "Wisconsin","56": "Wyoming",
};

const BASE_FILL = "transparent";
const STROKE_COLOR = "#FFFFFF";

// Shared visual size for the left preview + right carousel (keeps them even)
const PREVIEW_W = 540;
const PREVIEW_H = 380;

// helpers
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Endpoint (override with VITE_SUMMARIZE_ENDPOINT if you like)
const SUMMARIZE_ENDPOINT =
  import.meta.env.VITE_SUMMARIZE_ENDPOINT || "/api/summarize";

// --- robust JSON helpers to avoid "Unexpected end of JSON input" ---
function parseJsonSafe(text: string | null) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 20000
) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ac.signal });
    const text = await res.text();
    const data = parseJsonSafe(text);
    if (!res.ok) {
      const msg =
        (data && (data.error || (data.message as string))) ||
        (text && text.trim()) ||
        res.statusText ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (!data) {
      throw new Error("Empty or non-JSON response from the summarize endpoint.");
    }
    return data as any;
  } finally {
    clearTimeout(id);
  }
}

// simple CSV parser that supports quoted fields
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    return obj;
  });
}
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  const re = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1] != null) out.push(m[1].replace(/""/g, '"'));
    else out.push(m[2] ?? "");
  }
  if (line.endsWith(",")) out.push("");
  return out;
}
function toNumber(x: string | undefined): number | null {
  if (x == null) return null;
  const n = Number(String(x).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmtPercent(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}
function fmtTons(n: number | null): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n))} tons`;
}
function fmtUSD(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function normalizeStateName(name: string): string {
  return name.trim().toLowerCase();
}

// ---- image downscale helper to keep payloads small (prevents 500s) ----
async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function downscaleToJpegDataUrl(
  srcUrl: string,
  maxDim = 1400,
  quality = 0.85
): Promise<{ dataUrl: string; base64: string; mime: string }> {
  const resp = await fetch(srcUrl);
  const srcBlob = await resp.blob();

  let w: number, h: number;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(srcBlob);
    w = bitmap.width; h = bitmap.height;
  } catch {
    const img = await loadImageFromBlob(srcBlob);
    w = img.naturalWidth; h = img.naturalHeight;
  }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported in this browser.");

  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, tw, th);
    if ((bitmap as any).close) (bitmap as any).close();
  } else {
    const img = await loadImageFromBlob(srcBlob);
    ctx.drawImage(img, 0, 0, tw, th);
  }

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = dataUrl.split(",")[1] || "";
  return { dataUrl, base64, mime: "image/jpeg" };
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 900 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: cr.width, height: Math.max(640, cr.width) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size } as const;
}

type StateRow = {
  state?: string;
  fossil_share_reduction_pct_points?: string;
  state_co2_saved_tons?: string;
  co2_cost_saved_usd?: string;
  [k: string]: string | undefined;
};

// Optional fuel-mix types (left in case you reuse them somewhere else)
type FuelRow = {
  state?: string;
  coal?: string;
  natural_gas?: string | "natural gas";
  petroleum?: string;
  nuclear?: string;
  hydro?: string | "hydroelectric";
  wind?: string;
  solar?: string;
  geothermal?: string;
  biomass?: string;
  other?: string;
  total?: string;
  [k: string]: string | undefined;
};




export default function USInteractiveMap() {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // zoom/pan (animated on select/reset)
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // drag/pan gestures
  const dragging = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const DRAG_THRESHOLD = 4;

  // Touch swipe for carousel
  const touchXRef = useRef<number | null>(null);

  const [topology, setTopology] = useState<Topology<USObjects> | null>(null);

  // ⬇️ Load per-state CSV once and index by state name (impact highlights)
  const [stateDataMap, setStateDataMap] = useState<Record<string, StateRow>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(stateCsvUrl);
        const txt = await resp.text();
        const rows = parseCSV(txt) as StateRow[];
        const map: Record<string, StateRow> = {};
        for (const r of rows) {
          const key = r.state ? normalizeStateName(r.state) : "";
          if (key) map[key] = r;
        }
        if (!cancelled) setStateDataMap(map);
      } catch {
        if (!cancelled) setStateDataMap({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Optional fuel mix (not required by planner anymore, but cheap to keep)
  const [fuelMixMap, setFuelMixMap] = useState<Record<string, FuelRow>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(fuelMixCsvUrl);
        const txt = await resp.text();
        const rows = parseCSV(txt) as FuelRow[];
        const map: Record<string, FuelRow> = {};
        for (const r of rows) {
          const key = r.state ? normalizeStateName(r.state) : "";
          if (key) map[key] = r;
        }
        if (!cancelled) setFuelMixMap(map);
      } catch {
        if (!cancelled) setFuelMixMap({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let aborted = false;
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
      .then((r) => r.json())
      .then((j: unknown) => { if (!aborted) setTopology(j as Topology<USObjects>); })
      .catch(() => {});
    return () => { aborted = true; };
  }, []);

  // build path for container size
  const { states, path } = useMemo(() => {
    if (!topology) {
      return {
        states: null as unknown as FeatureCollection<Geometry, GeoJsonProperties>,
        path: null as unknown as d3.GeoPath<any, d3.GeoPermissibleObjects>,
      };
    }
    const states = feature(
      topology as Topology<USObjects>,
      (topology.objects as unknown as USObjects).states as GeometryObject
    ) as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

    const padding = 6;
    const projection = d3.geoAlbersUsa().fitExtent(
      [[padding, padding], [width - padding, height - padding]],
      states
    );
    const path = d3.geoPath(projection);
    return { states, path };
  }, [topology, width, height]);

  // base (whole USA) view when none selected
  useEffect(() => {
    if (!states || selectedId) return;
    const base = 1.15;
    setPan({ x: (width - width * base) / 2, y: (height - height * base) / 2 });
    setZoom(base);
  }, [states, width, height, selectedId]);

  // Cap zoom (smaller for micro-states)
  function maxZoomFor(id: string | null) {
    const micro = id && ["09","10","11","24","25","34","44","50"].includes(id);
    return micro ? 2.4 : 3.0;
  }

  // animate to selected state
  useEffect(() => {
    if (!states || !path) return;

    const duration = 350;
    const margin = 80;
    const dampen = 0.9;

    const z0 = zoom;
    const p0 = { ...pan };

    let z1 = 1.15;
    let p1 = { x: (width - width * z1) / 2, y: (height - height * z1) / 2 };

    if (selectedId) {
      const f = states.features.find((f) => {
        const rid = typeof f.id === "number" ? String(f.id).padStart(2, "0") : String(f.id ?? "");
        return rid === selectedId;
      });
      if (f) {
        const b = path.bounds(f as unknown as d3.GeoPermissibleObjects);
        const [x0, y0] = b[0], [x1, y1] = b[1];
        const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
        const sx = (width - margin * 2) / bw;
        const sy = (height - margin * 2) / bh;
        const desired = Math.min(sx, sy) * dampen;
        z1 = clamp(desired, 1.15, maxZoomFor(selectedId)); // cap zoom
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        p1 = { x: width / 2 - z1 * cx, y: height / 2 - z1 * cy };
      }
    }

    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1);
      setZoom(lerp(z0, z1, t));
      setPan({ x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [selectedId, states, path, width, height]);

  // pointer handlers
  const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    dragging.current = false; isPanning.current = false;
    last.current = { x: e.clientX, y: e.clientY };
    startPt.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (!last.current) return;
    const dxRaw = e.clientX - last.current.x;
    const dyRaw = e.clientY - last.current.y;

    if (!dragging.current && startPt.current) {
      const sx = e.clientX - startPt.current.x;
      const sy = e.clientY - startPt.current.y;
      if (Math.hypot(sx, sy) > DRAG_THRESHOLD) { dragging.current = true; isPanning.current = true; }
    }
    if (!isPanning.current) return;

    const dx = dxRaw / zoom, dy = dyRaw / zoom;
    last.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };
  const onPointerUp: React.PointerEventHandler<SVGSVGElement> = () => {
    isPanning.current = false; dragging.current = false; last.current = null; startPt.current = null;
  };

  const features: GeoFeature<Geometry, GeoJsonProperties>[] = states?.features ?? [];
  const handleStateClick = (id: string) => {
    if (dragging.current) return;
    setSelectedId((cur) => (cur === id ? null : id));
  };

  const hoverName = hoverId ? (FIPS_TO_NAME[hoverId] ?? `FIPS ${hoverId}`) : "—";
  const selectedName = selectedId ? (FIPS_TO_NAME[selectedId] ?? `FIPS ${selectedId}`) : "—";

  // left-of-image fitted path for selected state
  const selectedFeature = useMemo(() => {
    if (!states || !selectedId) return null;
    return states.features.find((f) => {
      const rid = typeof f.id === "number" ? String(f.id).padStart(2, "0") : String(f.id ?? "");
      return rid === selectedId;
    }) as GeoFeature<Geometry, GeoJsonProperties> | null;
  }, [states, selectedId]);

  const previewPath = useMemo(() => {
    if (!selectedFeature) return null;
    const w = PREVIEW_W, h = PREVIEW_H, pad = 12;
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: [selectedFeature as unknown as GeoFeature],
    } as unknown as FeatureCollection;
    const proj = d3.geoAlbersUsa().fitExtent([[pad, pad], [w - pad, h - pad]], fc as any);
    const p = d3.geoPath(proj);
    const d = p(selectedFeature as unknown as d3.GeoPermissibleObjects);
    return { w, h, d };
  }, [selectedFeature]);

  // -------- Slides built from selected state's folder --------
  const selectedStateName = selectedName;
  const gallery = useMemo(() => {
    if (!selectedId) return [];
    const name = FIPS_TO_NAME[selectedId];
    if (!name) return [];
    return STATE_IMAGES_INDEX[name] ?? [];
  }, [selectedId]);

  const [slide, setSlide] = useState(0);
  const slides = useMemo(() => {
    const baseTitles = [
      "Energy Consumption (14-day view)",
      "Hourly Carbon Intensity - per Person",
      "Fossil-Attributed Grid Consumption per Person— Baseline vs Optimized (A)",
      "Fossil-Attributed Grid Consumption — Baseline vs Optimized (B)",
      "Energy-Weighted Shares (24h rolling) — Baseline vs Optimized",
      "Cumulative Emissions (kg) — 14-day view",
    ];
    return gallery.map((src, i) => ({
      src,
      title: `${selectedStateName} — ${baseTitles[i] ?? `Figure ${i + 1}`}`,
    }));
  }, [gallery, selectedStateName]);

  const to = (i: number) => {
    const n = Math.max(slides.length, 1);
    setSlide((i % n + n) % n);
  };
  const next = () => to(slide + 1);
  const prev = () => to(slide - 1);

  // reset slide whenever state changes
  useEffect(() => { setSlide(0); }, [selectedId]);

  // ---------- Gemini summarize ----------
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleSummarize = async () => {
    if (!slides.length || summarizing) return;
    try {
      setSummarizing(true);
      setErrorMsg("");
      setSummary("");
      const { src, title } = slides[slide];
      const prompt = `Generalize the trend in this plot in 3 concise bullets and state the benefits. Title: "${title}".`;

      try {
        const data1 = await fetchJsonWithTimeout(SUMMARIZE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: src, prompt }),
        });
        if (data1?.summary) {
          setSummary(String(data1.summary));
          return;
        }
      } catch {}

      const { dataUrl, base64, mime } = await downscaleToJpegDataUrl(src, 1400, 0.85);
      const data2 = await fetchJsonWithTimeout(SUMMARIZE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, imageBase64: base64, mimeType: mime, prompt }),
      });
      if (!data2?.summary) throw new Error("No summary field in server response.");
      setSummary(String(data2.summary));
    } catch (e: any) {
      setErrorMsg(e?.name === "AbortError" ? "Summarization timed out. Try again." : e?.message || "Failed to summarize");
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => { if (summary || errorMsg) { setSummary(""); setErrorMsg(""); } }, [slide]);
  useEffect(() => { setSummary(""); setErrorMsg(""); }, [selectedId]);

  // ---------- Impact Highlights ----------
  const highlightMetrics = useMemo<Metric[]>(() => {
    const fallback = DEFAULT_METRICS;
    if (!selectedId || !selectedStateName || selectedStateName === "—") return fallback;

    const row = stateDataMap[normalizeStateName(selectedStateName)];
    if (!row) return fallback;

    const pctPoints = toNumber(row.fossil_share_reduction_pct_points);
    const tonsSaved = toNumber(row.state_co2_saved_tons);
    const usdSaved = toNumber(row.co2_cost_saved_usd);

    const metrics: Metric[] = [
      { value: fmtPercent(pctPoints), label: "Less Fossil Fuel Use" },
      { value: fmtTons(tonsSaved), label: "Saved CO₂ From Emission" },
      { value: fmtUSD(usdSaved), label: "Social Cost Saved" },
    ];
    return metrics;
  }, [selectedId, selectedStateName, stateDataMap]);

  // Optional baseline mix shares


  // ---------- FULLSCREEN LIGHTBOX ----------
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  const openLightbox = (idx: number) => {
    if (summarizing) return;
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };
  const closeLightbox = () => setLightboxOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (lightboxOpen && e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    if (lightboxOpen) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [lightboxOpen]);

  return (
    <div>
      {/* Map */}
      <div ref={ref} className="w-full relative" style={{ height: "85vh" }}>
        <svg
          role="img"
          aria-label="Map of United States by state"
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="block touch-none select-none"
          style={{ touchAction: "none", overflow: "hidden" }}
        >
          <defs>
            <clipPath id="mapClip">
              <rect x="0" y="0" width={width} height={height} />
            </clipPath>

            <linearGradient id="stateHoverFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e6f3ff" />
              <stop offset="100%" stopColor="#b9dcff" />
            </linearGradient>
            <linearGradient id="stateSelectedFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#cfe9ff" />
              <stop offset="100%" stopColor="#8cc3ff" />
            </linearGradient>

            <filter
              id="glow"
              x={-Math.max(40, width * 0.1)}
              y={-Math.max(40, height * 0.1)}
              width={width + Math.max(80, width * 0.2)}
              height={height + Math.max(80, height * 0.2)}
              filterUnits="userSpaceOnUse"
            >
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="transparent" pointerEvents="none" />

          <g clipPath="url(#mapClip)" transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {features.map((f) => {
              const rawId = f.id;
              const id =
                typeof rawId === "number"
                  ? String(rawId).padStart(2, "0")
                  : String(rawId ?? "");
              const dAttr = path
                ? (path as unknown as (obj: d3.GeoPermissibleObjects) => string | null)(
                    f as unknown as d3.GeoPermissibleObjects
                  )
                : null;
              if (!dAttr) return null;

              const isSelected = selectedId === id;
              const isHover = hoverId === id;
              const fill =
                isSelected ? "url(#stateSelectedFill)"
                : isHover   ? "url(#stateHoverFill)"
                : BASE_FILL;

              return (
                <g
                  key={id}
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId((h) => (h === id ? null : h))}
                  onClick={() => handleStateClick(id)}
                  style={{ outline: "none" }}
                >
                  <path
                    d={dAttr}
                    fill={fill}
                    stroke={STROKE_COLOR}
                    strokeOpacity={isHover || isSelected ? 0.95 : 0.8}
                    strokeWidth={(isHover || isSelected ? 2 : 1.5) / zoom}
                    className="cursor-pointer transition-[fill,stroke-width,stroke-opacity] duration-150"
                    pointerEvents="visiblePainted"
                    filter={isHover || isSelected ? "url(#glow)" : undefined}
                    shapeRendering="geometricPrecision"
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* State name badge when selected */}
        {selectedId && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2">
            <div className="px-3 py-1 rounded-md bg-black/50 text-white text-sm font-semibold border border-white/10 backdrop-blur-sm">
              {selectedName}
            </div>
          </div>
        )}
      </div>

      {/* Labels under the map */}
      <div className="mt-4 w-full flex justify-center text-white">
        <div className="flex flex-col sm:flex-row gap-2 text-center">
          <div className="bg-white/5 rounded-xl px-4 py-2 border border-white/10">
            <span className="opacity-80">Hover: </span>
            <span className="font-semibold">{hoverName}</span>
          </div>
          <div className="bg-white/5 rounded-xl px-4 py-2 border border-white/10">
            <span className="opacity-80">Selected: </span>
            <span className="font-semibold">{selectedName}</span>
          </div>
        </div>
      </div>

      {/* Selected state content */}
      {selectedId && (
        <div className="mt-16 w-full">
          <div className="mx-auto max-w-[min(1400px,98vw)] grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* TOP LEFT: State outline preview */}
            <div className="w-full">
              <div className="relative h-full">
                <div className="rounded-2xl p-[1px] bg-gradient-to-br from-cyan-400/40 via-blue-500/30 to-violet-500/30 h-full">
                  <div className="rounded-2xl bg-white/5 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl overflow-hidden h-full">
                    <div className="relative p-5 h-full flex flex-col">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-white font-semibold text-lg">{selectedStateName}</div>
                        <span className="text-white/60 text-xs uppercase tracking-wide">
                          Selected State
                        </span>
                      </div>

                      {/* Fixed-height figure area */}
                      <div style={{ height: PREVIEW_H }}>
                        {previewPath?.d ? (
                          <svg
                            viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
                            width="100%"
                            height="100%"
                            aria-label={`${selectedStateName} outline`}
                          >
                            <defs>
                              <linearGradient id="stateFill" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#cde8ff" stopOpacity="0.95" />
                                <stop offset="100%" stopColor="#86bfff" stopOpacity="0.85" />
                              </linearGradient>
                              <linearGradient id="stateStroke" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.9" />
                              </linearGradient>
                            </defs>
                            <path d={previewPath.d} fill="url(#stateFill)" stroke="url(#stateStroke)" strokeWidth={1.6} />
                          </svg>
                        ) : (
                          <div className="w-full h-full grid place-items-center text-white/60 text-sm">
                            Preview unavailable
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-white/60 text-xs">
                        Zoomed outline fitted to panel • interactive map above
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-cyan-400/10 blur-2xl" />
              </div>
            </div>

            {/* TOP RIGHT: Image carousel (matched height) + Summarize button */}
            <div className="w-full">
              <div
                className="relative bg-white/5 rounded-2xl border border-white/10 p-5 shadow-xl h-full"
                role="region"
                aria-roledescription="carousel"
                aria-label={`${selectedStateName} images`}
                aria-busy={summarizing}
              >
                <div className="flex items-center justify-between mb-4 gap-3">
                  <h3 className="text-white text-lg font-semibold line-clamp-2">
                    {slides.length ? slides[slide].title : `${selectedStateName} — No Images Found`}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-white/60 text-sm">
                      {slides.length ? `${slide + 1}/${slides.length}` : "0/0"}
                    </span>
                    <button
                      type="button"
                      onClick={handleSummarize}
                      disabled={summarizing || !slides.length}
                      aria-busy={summarizing}
                      className="group inline-flex items-center gap-2 rounded-full px-4 py-2
                                 bg-white hover:bg-sky-300 active:bg-sky-500
                                 text-black font-semibold shadow-md ring-1 ring-white/30
                                 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <defs>
                          <linearGradient id="gemGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#4CC3FF"/>
                            <stop offset="35%" stopColor="#6C5CE7"/>
                            <stop offset="65%" stopColor="#FF6E6E"/>
                            <stop offset="100%" stopColor="#36D399"/>
                          </linearGradient>
                        </defs>
                        <rect x="5" y="5" width="14" height="14" rx="3" transform="rotate(45 12 12)" fill="url(#gemGrad)"/>
                      </svg>
                      <span className="tracking-tight">
                        {summarizing ? "Summarizing…" : "Summarize with Gemini"}
                      </span>
                    </button>
                  </div>
                </div>

                {(summary || errorMsg) && (
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3">
                    {summary && <div className="text-white/90 text-sm whitespace-pre-wrap">{summary}</div>}
                    {errorMsg && <div className="text-red-300 text-sm">{errorMsg}</div>}
                  </div>
                )}

                {/* Fixed-height figure area to match state preview */}
                <div
                  className={`relative overflow-hidden rounded-xl ${summarizing ? "pointer-events-none opacity-90" : ""}`}
                  style={{ height: PREVIEW_H }}
                  onTouchStart={(e) => {
                    if (summarizing || !slides.length) return;
                    touchXRef.current = e.touches[0].clientX;
                  }}
                  onTouchEnd={(e) => {
                    if (summarizing || touchXRef.current == null || !slides.length) return;
                    const dx = e.changedTouches[0].clientX - touchXRef.current;
                    touchXRef.current = null;
                    const THRESH = 40;
                    if (dx < -THRESH) next();
                    else if (dx > THRESH) prev();
                  }}
                >
                  <div
                    className="whitespace-nowrap transition-transform duration-300 h-full"
                    style={{ transform: `translateX(-${slide * 100}%)` }}
                  >
                    {slides.length ? (
                      slides.map((s, i) => (
                        <div key={i} className="inline-block align-top w-full h-full">
                          <img
                            src={s.src}
                            alt={s.title}
                            onClick={() => openLightbox(i)}
                            className="w-full h-full object-contain block select-none rounded-xl shadow-2xl cursor-zoom-in"
                            draggable={false}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="inline-block align-top w-full h-full">
                        <div className="w-full h-full rounded-xl bg-white/5 border border-white/10 grid place-items-center text-white/60">
                          Add 1-6.png images under <code>src/states/{selectedStateName}</code>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Nav arrows */}
                  {slides.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={prev}
                        aria-label="Previous image"
                        disabled={summarizing}
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full
                                   bg-black/50 hover:bg-black/70 border border-white/20 p-2 text-white
                                   backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={next}
                        aria-label="Next image"
                        disabled={summarizing}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full
                                   bg-black/50 hover:bg-black/70 border border-white/20 p-2 text-white
                                   backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>

                {/* Dots */}
                {slides.length > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    {slides.map((_, i) => (
                      <button
                        key={i}
                        aria-label={`Go to image ${i + 1}`}
                        onClick={() => { if (!summarizing) to(i); }}
                        disabled={summarizing}
                        className={[
                          "h-2.5 w-2.5 rounded-full transition-opacity",
                          i === slide ? "bg-white opacity-100" : "bg-white/50 opacity-60 hover:opacity-90",
                          "disabled:opacity-40 disabled:cursor-not-allowed",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM FULL-WIDTH: Impact highlights */}
            <div className="md:col-span-2">
              <ImpactHighlights
                className="bg-white/5 text-white border-white/10"
                metrics={highlightMetrics}
              />
            </div>
          </div>
        </div>
      )}

      {/* --- Renewables Planner (bottom of page) --- */}
      <div className="mt-10 max-w-[min(1400px,98vw)] mx-auto px-4">
        <RenewablePlanner
          key={selectedId ?? "no-state"}
          demandMWh={250_000}
          selectedState={selectedName !== "—" ? selectedName : undefined}
        />
      </div>

      {/* ---------- LIGHTBOX OVERLAY ---------- */}
      {lightboxOpen && slides[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={closeLightbox}
        >
          <div className="relative w-full h-full max-h-screen max-w-screen" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Close"
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 border border-white/20 rounded-full p-2"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/>
              </svg>
            </button>

            <div className="w-full h-full flex flex-col items-center justify-center px-4 py-10">
              <img
                src={slides[lightboxIndex].src}
                alt={slides[lightboxIndex].title}
                className="max-w-[95vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
                draggable={false}
              />
              <div className="mt-4 text-center text-white/90 text-sm sm:text-base px-2">
                {slides[lightboxIndex].title}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ---------- END LIGHTBOX ---------- */}
    </div>
  );
}
