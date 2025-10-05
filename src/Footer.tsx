// src/DataSourceFooter.tsx
import React from "react";

type Props = {
  className?: string;
  url?: string;
  label?: string;
};

const DataSourceFooter: React.FC<Props> = ({
  className,
  url = "https://www.eia.gov/developer/",
  label = "U.S. Energy Information Administration (EIA) Developer Resources",
}) => {
  return (
    <footer
      className={[
        "mt-8 pt-4 border-t border-white/10 text-center text-xs text-slate-400",
        className,
      ].filter(Boolean).join(" ")}
    >
      Data source:&nbsp;
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-200"
      >
        {label}
      </a>
    </footer>
  );
};

export default DataSourceFooter;
