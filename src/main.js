import "./styles.css";
import { initContrast } from "./ui/contrast.js";
import { initMetricTooltip } from "./ui/tooltip.js";
import { initMonthGate } from "./ui/month-gate.js";
import { startApp } from "./ui/app.js";

initContrast();
initMetricTooltip();
initMonthGate();
startApp(document.querySelector("#app"));
