import { Chart, ArcElement, DoughnutController, PolarAreaController, RadialLinearScale, Tooltip } from "chart.js";

// Chart.js is tree-shaken: register once what the overview charts use.
// Importing this module from a chart component is enough.
Chart.register(ArcElement, DoughnutController, PolarAreaController, RadialLinearScale, Tooltip);

export const TOOLTIP = {
    backgroundColor: "rgba(8,9,13,0.95)",
    titleColor: "rgba(255,255,255,0.6)",
    bodyColor: "#fff",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    padding: 8,
    displayColors: false,
} as const;
