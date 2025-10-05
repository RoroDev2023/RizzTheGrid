// RenewablePlanner.tsx
import React, { useEffect, useMemo, useState } from "react";
// import DataSourceFooter from "./Footer";


// CSV asset (Vite will inline url)
import fuelMixCsvUrl from "./data/statewide_fuel_breakdown.csv?url";


/** Formatting helpers */
const fmtInt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmt1 = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Domain: we use daily energy for intuition
 * energyFromUnits(MWh/day) = units * mwPerUnit * capacityFactor * 24
 */
export type TechSpec = {
  unitName: string;
  mwPerUnit: number;
  capacityFactor: number;
  costPerUnit: number;
  maxUnits: number; // a soft cap; we will scale beyond if needed to reach 100%
};

export type PlannerProps = {
  className?: string;
  title?: string;
  /** If provided, used when no state is selected or CSV row missing */
  demandMWh?: number;
  /** Selected state name from the map (e.g., "California") */
  selectedState?: string;
  /** Technology specs */
  solar?: TechSpec;
  wind?: TechSpec;
};

const DEFAULT_SOLAR: TechSpec = {
  unitName: "MWdc solar block",
  mwPerUnit: 5,
  capacityFactor: 0.22,
  costPerUnit: 8_000_000,
  maxUnits: 200,
};

const DEFAULT_WIND: TechSpec = {
  unitName: "turbine (4 MW)",
  mwPerUnit: 4,
  capacityFactor: 0.38,
  costPerUnit: 6_200_000,
  maxUnits: 200,
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** CSV parsing utilities */
type FuelRow = {
  state?: string;
  fossil_mwh?: string;
  solar_mwh?: string;
  wind_mwh?: string;
  other_mwh?: string;
  [k: string]: string | undefined;
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = (cells[i] ?? "").trim(); });
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
function toNumber(x: string | undefined): number {
  if (x == null) return 0;
  const n = Number(String(x).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const norm = (s?: string) => (s || "").trim().toLowerCase();

/** SVG pie-slice builder */
function buildArcs(values: number[], cx: number, cy: number, r: number) {
  const total = Math.max(values.reduce((s, v) => s + Math.max(0, v), 0), 1e-6);
  let angle = -Math.PI / 2; // start at top
  return values.map((v) => {
    const frac = Math.max(0, v) / total;
    const sweep = frac * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const largeArc = sweep > Math.PI ? 1 : 0;

    const d = [
      `M ${cx} ${cy}`,
      `L ${x0} ${y0}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`,
      "Z",
    ].join(" ");

    return { d, frac };
  });
}

const Badge: React.FC<{ color?: string; children: React.ReactNode }> = ({ color = "bg-white/15 text-white", children }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
    {children}
  </span>
);

const Slider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}> = ({ label, value, min = 0, max, onChange, disabled }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className="text-sm text-slate-200">{label}</label>
      <span className="text-sm font-semibold text-slate-50">{fmtInt(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
      className="w-full accent-sky-400"
    />
    <div className="flex justify-between text-xs text-slate-400">
      <span>{fmtInt(min)}</span>
      <span>{fmtInt(max)}</span>
    </div>
  </div>
);

/** Main component */
const RenewablePlanner: React.FC<PlannerProps> = ({
  className,
  title = "Renewables Planner",
  demandMWh = 200_000,          // fallback if no state selected
  selectedState,                // <-- from map.tsx
  solar = DEFAULT_SOLAR,
  wind = DEFAULT_WIND,
}) => {
  /** Local state for user build */
  const [solarUnits, setSolarUnits] = useState<number>(0);
  const [windUnits, setWindUnits] = useState<number>(0);

  /** Load CSV and lookup the selected state's baseline mix */
  const [fuelMap, setFuelMap] = useState<Record<string, FuelRow>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(fuelMixCsvUrl);
        const txt = await resp.text();
        const rows = parseCSV(txt) as FuelRow[];
        const map: Record<string, FuelRow> = {};
        for (const r of rows) {
          const key = norm(r.state);
          if (key) map[key] = r;
        }
        if (!cancelled) setFuelMap(map);
      } catch {
        if (!cancelled) setFuelMap({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const baseline = useMemo(() => {
    const row = selectedState ? fuelMap[norm(selectedState)] : undefined;
    const fossil = toNumber(row?.fossil_mwh);
    const solarM = toNumber(row?.solar_mwh);
    const windM  = toNumber(row?.wind_mwh);
    const other  = toNumber(row?.other_mwh);
    const total  = fossil + solarM + windM + other;

    if (total > 0) {
      return {
        fossilMWh: fossil,
        solarMWh: solarM,
        windMWh : windM,
        otherMWh: other,
        demandMWh: total,
      };
    }
    return undefined;
  }, [fuelMap, selectedState]);

  // Effective demand comes from CSV if available; else prop
  const effectiveDemand = baseline?.demandMWh ?? demandMWh;

  // Per-unit energy (MWh/day) for each tech
  const solarPerUnit = useMemo(
    () => solar.mwPerUnit * solar.capacityFactor * 24,
    [solar.mwPerUnit, solar.capacityFactor]
  );
  const windPerUnit = useMemo(
    () => wind.mwPerUnit * wind.capacityFactor * 24,
    [wind.mwPerUnit, wind.capacityFactor]
  );

  // Remaining load to cover to eliminate fossil (baseline non-fossil stays constant)
  const remainingToCover = useMemo(() => {
    const baseNonFossil =
      (baseline?.solarMWh ?? 0) + (baseline?.windMWh ?? 0) + (baseline?.otherMWh ?? 0);
    return Math.max(effectiveDemand - baseNonFossil, 0);
  }, [baseline, effectiveDemand]);

  // --- DYNAMIC SLIDER MAXES so the user can hit 100% with Solar-only or Wind-only ---
  const dynamicMaxSolarUnits = useMemo(() => {
    if (solarPerUnit <= 0) return solar.maxUnits;
    const neededIfOnlySolar = Math.ceil(remainingToCover / solarPerUnit);
    // let the slider reach at least the needed amount (or the provided max if higher)
    return Math.max(solar.maxUnits, neededIfOnlySolar);
  }, [remainingToCover, solarPerUnit, solar.maxUnits]);

  const dynamicMaxWindUnits = useMemo(() => {
    if (windPerUnit <= 0) return wind.maxUnits;
    const neededIfOnlyWind = Math.ceil(remainingToCover / windPerUnit);
    return Math.max(wind.maxUnits, neededIfOnlyWind);
  }, [remainingToCover, windPerUnit, wind.maxUnits]);

  // Derived numbers from sliders (incremental new renewables)
  const solarCapMW = useMemo(() => solarUnits * solar.mwPerUnit, [solarUnits, solar.mwPerUnit]);
  const windCapMW  = useMemo(() => windUnits * wind.mwPerUnit,   [windUnits,  wind.mwPerUnit]);

  const solarEnergy = useMemo(() => solarUnits * solarPerUnit, [solarUnits, solarPerUnit]); // MWh/day
  const windEnergy  = useMemo(() => windUnits  * windPerUnit,  [windUnits,  windPerUnit]);

  // Apply displacement: new solar+wind displace fossil first, then surplus
  const finalMix = useMemo(() => {
    const baseFossil = baseline?.fossilMWh ?? 0;
    const baseSolar  = baseline?.solarMWh  ?? 0;
    const baseWind   = baseline?.windMWh   ?? 0;
    const baseOther  = baseline?.otherMWh  ?? 0;
    const demand     = effectiveDemand;

    const addRenew   = solarEnergy + windEnergy;

    const displacedFossil = Math.min(baseFossil, addRenew);
    const fossilLeft = Math.max(baseFossil - displacedFossil, 0);

    const finalSolar = baseSolar + solarEnergy;
    const finalWind  = baseWind  + windEnergy;
    const finalOther = baseOther;

    const served = finalSolar + finalWind + finalOther + fossilLeft;
    const unmet  = Math.max(demand - served, 0);
    const surplus = Math.max(served - demand, 0);

    // Cap slices to demand when rendering the pie
    const forPie = {
      solar: finalSolar,
      wind: finalWind,
      other: finalOther,
      fossil: fossilLeft,
    };
    const sumSlices = forPie.solar + forPie.wind + forPie.other + forPie.fossil;
    const scale = sumSlices > demand && demand > 0 ? demand / sumSlices : 1;

    return {
      finalSolar,
      finalWind,
      finalOther,
      fossilLeft,
      unmet,
      surplus,
      sharePct: Math.min(((finalSolar + finalWind + finalOther) / demand) * 100, 1000),
      pieValues: [
        forPie.solar * scale,
        forPie.wind * scale,
        forPie.other * scale,
        forPie.fossil * scale,
      ],
    };
  }, [baseline, solarEnergy, windEnergy, effectiveDemand]);

  // Pie arcs & palette
  const { arcs, palette } = useMemo(() => {
    const arcs = buildArcs(finalMix.pieValues, 100, 100, 90);
    const palette = [
      { name: "Solar",  color: "url(#pieSolar)" },
      { name: "Wind",   color: "url(#pieWind)" },
      { name: "Other",  color: "url(#pieOther)" },
      { name: "Fossil", color: "url(#pieFossil)" },
    ];
    return { arcs, palette };
  }, [finalMix.pieValues]);

  // Helper: units needed to hit ~100% if using only one tech from current baseline
  const neededFor100 = useMemo(() => {
    const baseOtherAndNonFossil =
      (baseline?.solarMWh ?? 0) + (baseline?.windMWh ?? 0) + (baseline?.otherMWh ?? 0);
    const remaining = Math.max(effectiveDemand - baseOtherAndNonFossil, 0);

    const windNeededIfOnlyWind   = windPerUnit > 0 ? Math.ceil(remaining / windPerUnit) : 0;
    const solarNeededIfOnlySolar = solarPerUnit > 0 ? Math.ceil(remaining / solarPerUnit) : 0;

    return { windNeededIfOnlyWind, solarNeededIfOnlySolar, remaining };
  }, [baseline, effectiveDemand, solarPerUnit, windPerUnit]);

  // Keep current slider values in bounds if the dynamic max shrinks between states
  useEffect(() => {
    setSolarUnits((s) => clamp(s, 0, dynamicMaxSolarUnits));
    setWindUnits((w) => clamp(w, 0, dynamicMaxWindUnits));
  }, [dynamicMaxSolarUnits, dynamicMaxWindUnits]);

  return (
    <section
      className={[
        "w-full bg-slate-900 text-slate-50 border border-slate-800 rounded-3xl",
        "px-6 sm:px-10 py-10 shadow-2xl",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">{title}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color="bg-sky-500/15 text-sky-200">
            {selectedState ? selectedState : "No state selected"}
          </Badge>
          <Badge color="bg-emerald-500/15 text-emerald-200">
            Target: {fmtInt(effectiveDemand)} MWh/day
          </Badge>
          {baseline && (
            <Badge color="bg-white/10">
              Baseline • Fossil {fmt1((baseline.fossilMWh / effectiveDemand) * 100)}% • Solar {fmt1((baseline.solarMWh / effectiveDemand) * 100)}% • Wind {fmt1((baseline.windMWh / effectiveDemand) * 100)}% • Other {fmt1((baseline.otherMWh / effectiveDemand) * 100)}%
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT: Sliders + numbers */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Build Plan</h3>
              <div className="flex gap-2">
                <Badge>Solar CF {fmt2(solar.capacityFactor * 100)}%</Badge>
                <Badge>Wind CF {fmt2(wind.capacityFactor * 100)}%</Badge>
              </div>
            </div>

            <div className="mt-4 space-y-6">
              <Slider
                label={`Solar units (${solar.unitName})`}
                value={solarUnits}
                max={dynamicMaxSolarUnits}
                onChange={setSolarUnits}
              />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                  <div className="text-slate-300">Nameplate capacity</div>
                  <div className="text-slate-50 font-semibold">{fmtInt(solarCapMW)} MW</div>
                </div>
                <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                  <div className="text-slate-300">Energy (avg/day)</div>
                  <div className="text-slate-50 font-semibold">{fmtInt(solarEnergy)} MWh</div>
                </div>
              </div>

              <Slider
                label={`Wind units (${wind.unitName})`}
                value={windUnits}
                max={dynamicMaxWindUnits}
                onChange={setWindUnits}
              />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                  <div className="text-slate-300">Nameplate capacity</div>
                  <div className="text-slate-50 font-semibold">{fmtInt(windCapMW)} MW</div>
                </div>
                <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                  <div className="text-slate-300">Energy (avg/day)</div>
                  <div className="text-slate-50 font-semibold">{fmtInt(windEnergy)} MWh</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-400 leading-5">
                <span className="text-slate-200 font-semibold">100% frontier: </span>
                any combination (S, W) satisfying{" "}
                <code>
                  S·{fmt1(solarPerUnit)} + W·{fmt1(windPerUnit)} ≥ {fmtInt(remainingToCover)} MWh/day
                </code>{" "}
                eliminates fossil on average. Move either slider to the right to cross the frontier.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-lg mb-4">Totals</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">Renewables (incl. baseline)</div>
                <div className="text-slate-50 font-semibold">
                  {fmtInt((baseline?.solarMWh ?? 0) + (baseline?.windMWh ?? 0) + solarEnergy + windEnergy)} MWh/day
                </div>
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">Share of demand</div>
                <div className="text-slate-50 font-semibold">{fmt1(finalMix.sharePct)}%</div>
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">Unmet demand</div>
                <div className="text-slate-50 font-semibold">{fmtInt(finalMix.unmet)} MWh/day</div>
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">Surplus</div>
                <div className="text-slate-50 font-semibold">{fmtInt(finalMix.surplus)} MWh/day</div>
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">Total cost</div>
                <div className="text-sky-200 font-semibold">
                  {fmtUSD(solarUnits * solar.costPerUnit + windUnits * wind.costPerUnit)}
                </div>
              </div>
              <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="text-slate-300">To reach ~100% solo</div>
                <div className="text-slate-50 text-xs leading-5">
                  +{fmtInt(neededFor100.solarNeededIfOnlySolar)} solar units
                  <span className="text-slate-400"> or </span>
                  +{fmtInt(neededFor100.windNeededIfOnlyWind)} wind units
                </div>
              </div>
            </div>
            {finalMix.sharePct >= 100 && (
              <p className="mt-3 text-xs text-emerald-300">
                You’ve reached (or exceeded) 100% of average daily demand. Consider storage and transmission constraints.
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: Pie chart */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold text-lg mb-4">
            Mix (Solar / Wind / Other / Fossil){baseline ? "" : " • using fallback demand"}
          </h3>

          <div className="flex items-center justify-center">
            <svg width="240" height="240" viewBox="0 0 200 200" role="img" aria-label="Energy mix pie">
              <defs>
                <linearGradient id="pieSolar" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="pieWind" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#93c5fd" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="pieOther" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a7f3d0" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="pieFossil" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
                <filter id="pieGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background ring */}
              <circle cx="100" cy="100" r="92" fill="none" stroke="white" opacity="0.07" strokeWidth="8" />
              {/* Slices */}
              {arcs.map((a, i) => (
                <path key={i} d={a.d} fill={palette[i].color} filter="url(#pieGlow)" />
              ))}
              {/* Center label */}
              <circle cx="100" cy="100" r="52" fill="rgba(15,23,42,0.9)" stroke="white" strokeOpacity="0.06" />
              <text x="100" y="92" textAnchor="middle" fontSize="12" fill="white" opacity="0.8">
                Non-fossil share
              </text>
              <text x="100" y="112" textAnchor="middle" fontSize="20" fontWeight="700" fill="white">
                {fmt1(Math.min(((finalMix.finalSolar + finalMix.finalWind + finalMix.finalOther) / effectiveDemand) * 100, 999))}%
              </text>
            </svg>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#f59e0b" }} />
                <span className="font-semibold">Solar</span>
              </div>
              <div className="mt-2 text-slate-300">
                {fmtInt(finalMix.finalSolar)} MWh/day
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#3b82f6" }} />
                <span className="font-semibold">Wind</span>
              </div>
              <div className="mt-2 text-slate-300">
                {fmtInt(finalMix.finalWind)} MWh/day
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#10b981" }} />
                <span className="font-semibold">Other</span>
              </div>
              <div className="mt-2 text-slate-300">
                {fmtInt(finalMix.finalOther)} MWh/day
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#475569" }} />
                <span className="font-semibold">Fossil</span>
              </div>
              <div className="mt-2 text-slate-300">
                {fmtInt(finalMix.fossilLeft)} MWh/day
              </div>
            </div>
          </div>

          {/* Tiny legend/help */}
          <p className="mt-4 text-[11px] text-slate-400 leading-5">
            Baseline values are loaded from <code>statewide_fuel_breakdown.csv</code>. Sliders are
            auto-scaled so that 100% renewables is reachable: any (Solar units, Wind units) with{" "}
            <code>S·{fmt1(solarPerUnit)} + W·{fmt1(windPerUnit)} ≥ {fmtInt(remainingToCover)}</code>{" "}
            MWh/day reaches the target on average (other remains fixed; new renewables displace fossil first).
          </p>
        </div>
      </div>
      {/* <DataSourceFooter /> */}
    </section>
  );
};

export default RenewablePlanner;
