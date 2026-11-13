import "./styles.css";
import { initMetricTooltip } from "./ui/tooltip.js";
import { initMonthGate } from "./ui/month-gate.js";
import { startApp } from "./ui/app.js";

initMetricTooltip();
initMonthGate();
startApp(document.querySelector("#app"));
