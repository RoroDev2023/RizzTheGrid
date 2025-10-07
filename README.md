⚡ Rizz The Grid

Smarter Energy, Cleaner Future — Real-Time Grid Forecasting and Optimization Platform


⸻

🧠 Inspiration

Climate change is accelerating, but infrastructure change is slow. Rizz The Grid was born from one question:

How much can we reduce fossil fuel use without building anything new?

We realized that smarter data, forecasting, and optimization could decarbonize the grid today — simply by rethinking when and how energy is used.

Our goal was to show that intelligence, not just infrastructure, can drive immediate sustainability impact.

⸻

🌍 What It Does

Rizz The Grid forecasts, optimizes, and visualizes the U.S. energy mix in real time:
	•	🗺️ Interactive U.S. map: click any state to explore its forecast, fossil reduction %, and CO₂ savings.
	•	⚡ 14-day state forecast: projects hourly generation by fuel source.
	•	🔋 Optimization toolkit: recommends EV and battery charging windows that minimize emissions.
	•	☀️ Renewable planner: simulates the effect of adding solar and wind capacity to reach 100% clean power.
	•	📊 Impact visualization: translates model outputs into understandable metrics and graphs.

Across all 50 states, our models achieved up to 4% fossil fuel reduction, translating into billions of tons of CO₂ saved and billions of dollars in social cost savings.

Example — Texas:
	•	2.15% less fossil fuel use
	•	805,844 tons of CO₂ avoided
	•	$193,402,655 saved in social costs


⸻

⚙️ Architecture Overview

🧩 Backend & Pipeline

Flask + Python + Ridge Regression + PyTorch

	•	Flask service: exposes /get_least_co2_emissions, combining live EIA data with Google Geocoding to recommend the lowest-emission 10-hour charging window.
	•	Automated data fetcher: mirrors annual EIA CO₂ aggregates and consumption data into json_data/.
	•	Ridge-based trainer: generates per-state emission forecasts and normalized co2_per_kwh_<YEAR>.csv intensity tables.
	•	Pipeline orchestration: full retrains, QA plots, manifest writing, and artifact management (pipeline/run_pipeline.py).
	•	Visualization helpers: create comparative plots for each retrain cycle for transparency and auditing.


⸻

🔧 Forecasting & Optimization Toolkit
	•	14-Day Forecaster: blends hourly EIA data with per-state intensity curves to predict generation mix and emissions.
	•	Battery & EV Optimizer: layers PV, greedy scheduling, and heuristic algorithms to find the cleanest charging patterns.
	•	Annual Simulator: scales the 14-day patterns to estimate long-term fossil reductions and social cost savings.
	•	Short-Term Forecaster (48h): uses a PyTorch model to feed a PuLP optimizer for near-term device scheduling.
	•	Optimization Utilities: define flexible device windows, fallback logic, and mathematical formulations shared across modules.


⸻

💻 Frontend Dashboard

Next.js + React + TypeScript + Recharts

	•	Landing page: communicates the mission — real-time energy intelligence + 14-day optimization.
	•	Interactive map: users click any state to explore its data.
	•	Form system: collects EV + location inputs with Google Places Autocomplete and Zod validation.
	•	Data visualization: Recharts area and bar plots dynamically render hourly emissions and fossil reduction trends.
	•	Car visualization panel: combines curated specs, imagery, and personalized charging recommendations.

⸻

📈 Key Results

\text{Up to 4% fossil fuel reduction → Billions of tons CO₂ saved → Billions of dollars saved.}
	•	Nationwide, fossil fuel reliance drops across all states.
	•	Cumulative emissions avoided: billions of tons of CO₂.
	•	Social cost savings: billions of USD based on EPA social cost of carbon metrics.

These results represent cleaner air, healthier communities, and measurable progress toward decarbonization.

⸻

🚧 Challenges We Faced
	•	Cleaning and aligning inconsistent EIA datasets across multiple states.
	•	Balancing forecast accuracy vs. real-time speed.
	•	Optimizing API calls under strict rate limits.
	•	Maintaining smooth, high-resolution visualizations without lag.

⸻

🧠 What We Learned
	•	Intelligence can be as powerful as infrastructure.
	•	Small percentage reductions scale into national-level emissions savings.
	•	Real-time forecasting can guide utilities and consumers toward cleaner energy choices.
	•	Collaboration between data scientists, engineers, and designers was key to making sustainability visible.

⸻

🚀 What’s Next for Us
	•	Integrate real-time tariff and battery economics for cost-aware optimization.
	•	Expand to hourly-level forecasting linked to weather and demand.
	•	Launch public APIs and dashboards for cities and utilities.
	•	Partner with clean-tech organizations to operationalize the model for daily grid management.
	•	Open-source the framework to encourage transparency and innovation in climate data systems.

⸻

🧾 Repository Structure

RizzTheGrid/
├── pipeline/
│   ├── data_fetch.py
│   ├── training.py
│   ├── forecast_14d.py
│   ├── battery_ev_opt.py
│   ├── visualize.py
│   └── run_pipeline.py
├── predict_ci_next48.py
├── optimize_from_forecast.py
├── frontend-energyhack-2025/
│   ├── src/app/
│   └── components/
└── predicted_data/


⸻

🪄 Quick Start

# 1. Clone the repository
git clone https://github.com/yourusername/rizz-the-grid.git
cd rizz-the-grid

# 2. Start backend
cd backend
python server.py

# 3. Start frontend
cd frontend-energyhack-2025
npm install
npm run dev

Visit http://localhost:3000 and explore the live energy dashboard.

⸻

✨ Acknowledgments

Built with love and urgency at Hack Harvard 2025 — by a team committed to data-driven climate action.
Using EIA Open Data, Google Maps API, Flask, Next.js, Recharts, PuLP, and PyTorch.


