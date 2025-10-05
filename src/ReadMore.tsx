// src/ReadMore.tsx
import React from "react";
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from "react-katex";

const ReadMore: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-100 space-y-6 my-12">
      <h1 className="text-2xl font-bold mb-6">Read More</h1>

      {/* Intro */}
      <p>
        We design an optimization framework that schedules devices and a battery
        to minimize carbon emissions based on hourly carbon intensity forecasts{" "}
        <InlineMath math="c_t" />. The system chooses when devices run and how
        the battery charges or discharges, subject to power and capacity limits.
      </p>

      {/* Devices */}
      <h2 className="text-xl font-semibold mt-4">1. Devices</h2>
      <p>
        Each device <InlineMath math="i \\in \\mathcal{D}" /> requires{" "}
        <InlineMath math="E_i" /> kWh within a time window{" "}
        <InlineMath math="\\mathcal{W}_i" /> and is limited by max power{" "}
        <InlineMath math="P_i" />:
      </p>
      <BlockMath math="\\sum_{t \\in \\mathcal{W}_i} x_{i,t} = E_i" />
      <BlockMath math="0 \\leq x_{i,t} \\leq P_i \\quad (t \\in \\mathcal{W}_i)" />
      <BlockMath math="x_{i,t} = 0 \\quad (t \\notin \\mathcal{W}_i)" />

      <p>
        If contiguity is required (e.g., a dryer cycle), binary variables{" "}
        <InlineMath math="y_{i,t}" /> enforce consecutive operation:
      </p>
      <BlockMath math="x_{i,t} \\leq P_i y_{i,t}" />
      <BlockMath math="\\sum_{t} s_{i,t} \\leq 1, \\quad s_{i,t} \\geq y_{i,t} - y_{i,t-1}" />

      {/* Battery */}
      <h2 className="text-xl font-semibold mt-4">2. Battery</h2>
      <p>
        The battery stores and releases energy with efficiency losses. It is
        characterized by capacity <InlineMath math="B^{\\max}" />,
        charge/discharge rates{" "}
        <InlineMath math="P^{ch}_{\\max}, P^{dis}_{\\max}" />, and efficiencies{" "}
        <InlineMath math="\\eta^{ch}, \\eta^{dis}" />. State of charge evolves as:
      </p>
      <BlockMath math="b_{t+1} = b_t + \\eta^{ch} p^{ch}_t - \\tfrac{1}{\\eta^{dis}} p^{dis}_t" />
      <BlockMath math="0 \\leq b_t \\leq B^{\\max}" />
      <BlockMath math="0 \\leq p^{ch}_t \\leq P^{ch}_{\\max}, \\quad 0 \\leq p^{dis}_t \\leq P^{dis}_{\\max}" />

      {/* System balance */}
      <h2 className="text-xl font-semibold mt-4">3. System Balance</h2>
      <p>
        Net grid load in each hour is the sum of device consumption plus battery
        charging minus discharging:
      </p>
      <BlockMath math="L_t = \\sum_{i \\in \\mathcal{D}} x_{i,t} + p^{ch}_t - p^{dis}_t" />
      <p>
        Optionally, grid capacity <InlineMath math="C_t" /> limits total load:
      </p>
      <BlockMath math="L_t \\leq C_t" />

      {/* Objective */}
      <h2 className="text-xl font-semibold mt-4">4. Objective</h2>
      <p>
        The optimization minimizes total emissions by weighting load with carbon
        intensity:
      </p>
      <BlockMath math="\\min \\sum_{t \\in \\mathcal{T}} c_t L_t" />

      {/* Weather */}
      <h2 className="text-xl font-semibold mt-4">5. Weather Integration</h2>
      <p>
        Weather forecasts affect carbon intensity directly (through renewable
        availability) or constrain charging to renewable-rich periods:
      </p>
      <BlockMath math="p^{ch}_t \\leq R_t" />

      {/* Conclusion */}
      <h2 className="text-xl font-semibold mt-4">Summary</h2>
      <p>
        Devices allocate fixed energy <InlineMath math="E_i" /> into low-carbon
        hours, the battery shifts load across time, and weather data adjusts
        availability. Together, the system minimizes{" "}
        <InlineMath math="\\sum_t c_t L_t" /> while meeting all operational
        constraints.
      </p>
    </div>
  );
};

export default ReadMore;
