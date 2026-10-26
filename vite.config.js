import { resolve } from "node:path";
import { defineConfig } from "vite";

const ANALYZE_PATHS = new Set(["/api/analyze", "/.netlify/functions/analyze"]);

/**
 * Local stand-in for netlify/functions/analyze.mjs.
 * Production calls Claude through the Netlify function; this never runs during `vite build`.
 * The delay keeps the Priority Plays loader on screen long enough for one tagline rotation.
 */
function localAnalyzeStub() {
  const stubDelayMs = 4200;

  function handle(req, res, next) {
    const path = (req.url || "").split("?")[0];
    if (!ANALYZE_PATHS.has(path)) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "POST a comparison to analyze." }));
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let companyName = "This company";
      try {
        const body = JSON.parse(raw || "{}");
        if (body?.company?.name) companyName = String(body.company.name);
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Send JSON." }));
        return;
      }

      const payload = {
        bottomLine: `${companyName} is on screen against the selected peers for February 2026. This local stub stands in for the Netlify function so Priority Plays can be reviewed without an API key.`,
        actions: [
          {
            label: "Rebalance paid",
            detail: `Compare ${companyName}'s paid and owned visit mix with the peers in the table before shifting spend.`,
          },
          {
            label: "Lift conversion",
            detail:
              "Use the Conv % row to see whether the selected company trails the compare-to set, then fix the weakest step in the path.",
          },
          {
            label: "Keep visitors",
            detail:
              "Check bounce and return-visitor rates against peers and tighten the landing experience where the gap is widest.",
          },
          {
            label: "Focus the inbox",
            detail:
              "Read email power, spam, and sends per user against the peer set and cut the campaigns that do not earn traffic.",
          },
        ],
      };

      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(payload));
      }, stubDelayMs);
    });
  }

  return {
    name: "local-analyze-stub",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

/** The main page and /demo post to separate Netlify forms. */
const LEAD_FORM_NAMES = new Set(["benchmark-lead", "benchmark-demo-lead"]);

/** Local stand-in for Netlify Forms. Production stores the post and emails the site owner. */
function localLeadFormStub() {
  function handle(req, res, next) {
    const path = (req.url || "").split("?")[0];
    if (req.method !== "POST" || (path !== "/" && path !== "/index.html")) {
      next();
      return;
    }
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      next();
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const params = new URLSearchParams(raw);
      if (!LEAD_FORM_NAMES.has(params.get("form-name"))) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end("ok");
    });
  }

  return {
    name: "local-lead-form-stub",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

/**
 * Sends /demo to /demo/ so the demo page loads instead of the main-page fallback.
 * Netlify serves demo/index.html at /demo on its own.
 */
function demoTrailingSlash() {
  function handle(req, res, next) {
    const [path, query] = (req.url || "").split("?");
    if (path !== "/demo") {
      next();
      return;
    }
    res.statusCode = 301;
    res.setHeader("Location", `/demo/${query ? `?${query}` : ""}`);
    res.end();
  }

  return {
    name: "demo-trailing-slash",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [demoTrailingSlash(), localAnalyzeStub(), localLeadFormStub()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        demo: resolve(import.meta.dirname, "demo/index.html"),
      },
    },
  },
});
