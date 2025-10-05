import React, { useMemo, useState } from "react";
import ReadMore from "./ReadMore";

export interface Metric {
  value: string;
  label: string;
}

export interface ImpactHighlightsProps {
  className?: string;
  metrics?: Metric[];
}

export const DEFAULT_METRICS: Metric[] = [
  {
    value: "30%",
    label: "Less CO₂",
  },
  {
    value: "22%",
    label: "Grid Stress Cut // Saved",
  },
  {
    value: "18%",
    label: "Saved Social Cost",
  },
];

const ImpactHighlights: React.FC<ImpactHighlightsProps> = ({
  className,
  metrics = DEFAULT_METRICS,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const baseClassName = useMemo(
    () =>
      [
        "w-full",
        "bg-slate-900 text-slate-50 border border-slate-800",
        "rounded-3xl px-6 sm:px-10 py-12 sm:py-14",
        "shadow-2xl",
      ].join(" "),
    []
  );

  const mergedClassName = [baseClassName, className].filter(Boolean).join(" ");

  return (
    <section className={mergedClassName}>
      <div className="grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="flex flex-col justify-center bg-slate-800/60 rounded-2xl p-8 sm:p-10 text-center border border-slate-700 shadow-lg h-full"
          >
            <p className="text-5xl sm:text-5xl font-extrabold tracking-tight text-sky-200">
              {metric.value}
            </p>
            <p className="mt-4 text-xl font-semibold uppercase tracking-wide text-sky-300">
              {metric.label}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-14 text-center space-y-4">
        <p className="text-lg text-slate-200">
          We did this using statistics and math.
        </p>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-full bg-sky-400 px-6 py-2.5 text-slate-900 font-semibold shadow-md transition hover:bg-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-200"
        >
          {expanded ? "Hide math" : "Learn more"}
        </button>
      </div>

      {expanded && (
        <div className="mt-12 bg-slate-800 text-slate-100 rounded-2xl shadow-lg border border-slate-700">
          <ReadMore />
        </div>
      )}
    </section>
  );
};

export default ImpactHighlights;