const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");

let RENDERER_VERSION = "1.0.0";
try {
  RENDERER_VERSION = require("./package.json").version;
} catch (_) {}
const SERVER_START_TIME = Date.now();

const app = express();
app.use(express.json({ limit: "10mb" }));
// CORS: allow n8n and other tools to call from another host/origin
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const TEMPLATES_DIR = path.join(__dirname, "templates");
const OUTPUT_DIR = path.join(__dirname, "output");
const PACK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// Async render: request_id -> { status: "pending"|"done"|"error", relativePath?, error? }
const asyncJobs = new Map();
const ASYNC_JOB_TTL_MS = 60 * 60 * 1000; // 1 hour then forget

// In-memory cache: n8n often sends item 2+ with empty data.render; use pack from first request.
const packCache = new Map();

function packCacheKey(body) {
  if (!body) return null;
  const task_id = (body.task_id ?? body["task.id"] ?? "").toString().trim();
  const job_id = (body.job_id ?? body["job.id"] ?? "").toString();
  const run_id = (body.run_id ?? body["run.id"] ?? "").toString().trim();
  if (task_id) return `task:${task_id}`;
  if (job_id && run_id) return `job:${job_id}:${run_id}`;
  if (job_id) return `job:${job_id}`;
  return null;
}

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

let sharedBrowser = null;
let browserLaunchPromise = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;
  if (browserLaunchPromise) return browserLaunchPromise;
  browserLaunchPromise = puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    sharedBrowser = await browserLaunchPromise;
    sharedBrowser.once("disconnected", () => {
      sharedBrowser = null;
      browserLaunchPromise = null;
    });
    return sharedBrowser;
  } catch (e) {
    browserLaunchPromise = null;
    throw e;
  }
}

function compileTemplate(templateName) {
  const filePath = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }
  const src = fs.readFileSync(filePath, "utf8");
  return Handlebars.compile(src);
}

async function executeRender(ctx) {
  const {
    template,
    templateData,
    slideIndex1,
    bodySlidesCount,
    debugInfo,
    safeJobId,
    slideFileName,
    run_id,
    task_id,
    hasRunId,
    hasTaskId,
  } = ctx;
  let outPath;
  if (hasRunId) {
    const safeRunId = String(run_id).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    const segments = [OUTPUT_DIR, safeRunId];
    if (hasTaskId) {
      const safeTaskId = String(task_id).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
      segments.push(safeTaskId);
    }
    const outDir = path.join(...segments);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    outPath = path.join(outDir, slideFileName);
  } else {
    const runId = `${safeJobId}_${Date.now()}`;
    outPath = path.join(OUTPUT_DIR, `${runId}_${slideFileName}`);
  }
  const tpl = compileTemplate(template);
  const html = tpl(templateData);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load", timeout: 90000 });
    const slideHandles = await page.$$(".slide");
    if (!slideHandles.length) throw new Error("No .slide elements found.");
    const i0 = slideIndex1 - 1;
    if (i0 >= slideHandles.length) {
      throw new Error(
        `slide_index ${slideIndex1} out of range (total slides: ${slideHandles.length}). Request had body_slides count: ${bodySlidesCount}.`
      );
    }
    await slideHandles[i0].screenshot({ path: outPath });
    const relativePath = path.relative(OUTPUT_DIR, outPath).replace(/\\/g, "/");
    return { outPath, relativePath, totalSlides: slideHandles.length };
  } finally {
    await page.close().catch(() => {});
  }
}

function normalizeBody(body) {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return { error: "Invalid JSON body" };
    }
  }
  if (body && body.body && typeof body.body === "object" && (body.body.template != null || body.body.data != null)) {
    body = body.body;
  }
  return body;
}

function normalizeTemplateData(body, data) {
  let templateData = data || {};
  if (data && data.render != null) {
    let render = data.render;
    if (typeof render === "string") {
      try {
        render = JSON.parse(render);
      } catch (e) {
        return { error: "data.render could not be parsed as JSON" };
      }
    }
    if (render && typeof render === "object") templateData = render;
  }
  if (templateData && Array.isArray(templateData.slides_all)) {
    const bodyFromAll = templateData.slides_all.filter((s) => s && s.block === "body");
    if (bodyFromAll.length > 0 && (!Array.isArray(templateData.body_slides) || templateData.body_slides.length === 0)) {
      templateData.body_slides = bodyFromAll;
    }
    const ctaFromAll = templateData.slides_all.find((s) => s && s.block === "cta");
    if (ctaFromAll && !templateData.cta_slide) {
      templateData.cta_slide = { type: "cta", headline: ctaFromAll.headline, body: ctaFromAll.body, handle: ctaFromAll.handle };
    }
    if (templateData.cta_slide && (templateData.cta_text == null || templateData.cta_text === "") && templateData.cta_slide.body) {
      templateData.cta_text = templateData.cta_slide.body;
    }
    if (templateData.cta_slide && (templateData.cta_handle == null || templateData.cta_handle === "") && templateData.cta_slide.handle) {
      templateData.cta_handle = templateData.cta_slide.handle;
    }
  }
  return templateData;
}

app.post("/render", async (req, res) => {
  let body = normalizeBody(req.body);
  if (body.error) return res.status(400).json({ ok: false, error: body.error });

  const template = body?.template ?? body?.["template"];
  const job_id = body?.job_id ?? body?.["job.id"];
  const slide_index = body?.slide_index ?? body?.["slide_index"];
  const run_id = body?.run_id ?? body?.["run.id"];
  const task_id = body?.task_id ?? body?.["task.id"];
  const data = (body && body.data) != null ? body.data : {};

  if (!template) {
    return res.status(400).json({ ok: false, error: "Missing template" });
  }

  let templateData = normalizeTemplateData(body, data);
  if (templateData.error) return res.status(400).json({ ok: false, error: templateData.error });

  let bodySlidesCount = Array.isArray(templateData.body_slides) ? templateData.body_slides.length : 0;
  let usedCache = false;
  const cacheKey = packCacheKey(body);
  if (bodySlidesCount === 0 && cacheKey) {
    const cached = packCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PACK_CACHE_TTL_MS && cached.pack) {
      templateData = cached.pack;
      bodySlidesCount = Array.isArray(templateData.body_slides) ? templateData.body_slides.length : 0;
      usedCache = true;
    }
  }
  if (bodySlidesCount > 0 && cacheKey && !usedCache) {
    packCache.set(cacheKey, { pack: templateData, at: Date.now() });
  }

  if (slide_index === undefined || slide_index === null || slide_index === "") {
    return res.status(400).json({ ok: false, error: "Missing slide_index (required)" });
  }

  const slideIndex1 = Number(slide_index);
  if (!Number.isInteger(slideIndex1) || slideIndex1 < 1) {
    return res.status(400).json({ ok: false, error: "slide_index must be an integer >= 1" });
  }

  const expectedTotalSlides = 1 + bodySlidesCount + 1;
  const debugInfo = {
    body_slides_count: bodySlidesCount,
    expected_total_slides: expectedTotalSlides,
    used_data_render: !!(data && data.render != null),
    used_cache: usedCache,
    top_level_keys: body ? Object.keys(body) : [],
    data_keys: data ? Object.keys(data) : [],
  };

  if (slideIndex1 > expectedTotalSlides) {
    return res.status(400).json({
      ok: false,
      error: `slide_index ${slideIndex1} is out of range: this request has ${expectedTotalSlides} slides (cover + ${bodySlidesCount} body + CTA).`,
      debug: debugInfo,
    });
  }

  const safeJobId = String(job_id || "job").replace(/[^a-zA-Z0-9_-]/g, "_");
  const slideFileName = `${String(slideIndex1).padStart(3, "0")}_slide.png`;
  const hasRunId = run_id != null && String(run_id).trim() !== "";
  const hasTaskId = task_id != null && String(task_id).trim() !== "";

  const ctx = {
    template,
    templateData,
    slideIndex1,
    bodySlidesCount,
    debugInfo,
    safeJobId,
    slideFileName,
    run_id,
    task_id,
    hasRunId,
    hasTaskId,
  };

  const asyncMode = req.query.async === "1" || req.query.async === "true";
  const isCtaSlide = slideIndex1 === expectedTotalSlides;
  const ctaHint = isCtaSlide
    ? ((templateData.cta_slide || templateData.cta_text) ? "cta_data_present" : "cta_data_missing")
    : null;
  if (asyncMode) {
    const requestId = randomUUID();
    asyncJobs.set(requestId, { status: "pending", at: Date.now() });
    executeRender(ctx)
      .then(({ relativePath, totalSlides }) => {
        asyncJobs.set(requestId, {
          status: "done",
          at: Date.now(),
          relativePath,
          slide_index: slideIndex1,
          total_slides_detected: totalSlides,
          cta_hint: ctaHint,
        });
      })
      .catch((err) => {
        asyncJobs.set(requestId, { status: "error", at: Date.now(), error: err.message });
      });
    return res.status(202).json({
      ok: true,
      accepted: true,
      request_id: requestId,
      status_url: `/render/status/${requestId}`,
      message: "Render started. Poll status_url for result, then GET /output/<relativePath> for the image.",
    });
  }

  try {
    const { outPath, relativePath, totalSlides } = await executeRender(ctx);
    const payload = {
      ok: true,
      slide_index: slideIndex1,
      total_slides_detected: totalSlides,
      file: { slide: slideIndex1, path: outPath },
      result_url: `/output/${relativePath}`,
    };
    if (ctaHint) payload.cta_hint = ctaHint;
    res.json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/render/status/:requestId", (req, res) => {
  const job = asyncJobs.get(req.params.requestId);
  if (!job) return res.status(404).json({ ok: false, error: "Unknown or expired request_id" });
  const payload = { ok: true, status: job.status, request_id: req.params.requestId };
  if (job.status === "done") {
    payload.relativePath = job.relativePath;
    payload.result_url = `/output/${job.relativePath}`;
    payload.slide_index = job.slide_index;
    payload.total_slides_detected = job.total_slides_detected;
    if (job.cta_hint) payload.cta_hint = job.cta_hint;
  }
  if (job.status === "error") payload.error = job.error;
  res.json(payload);
});

app.use("/output", express.static(OUTPUT_DIR, { index: false }));

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    version: RENDERER_VERSION,
    uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
  });
});

app.get("/version", (_, res) => {
  res.json({ version: RENDERER_VERSION });
});

app.get("/warmup", (req, res) => {
  res.json({ ok: true, message: "Browser launch started in background" });
  getBrowser().catch(() => {});
});

app.get("/templates", (_, res) => {
  try {
    const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".hbs"));
    res.json({ ok: true, templates: files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /preview-template — used by template playground. Body: { template, data }. Renders slide 1 only, returns result_url.
app.post("/preview-template", async (req, res) => {
  let body = normalizeBody(req.body);
  if (body.error) return res.status(400).json({ ok: false, error: body.error });

  const template = body?.template ?? body?.["template"];
  const data = (body && body.data) != null ? body.data : {};
  if (!template) return res.status(400).json({ ok: false, error: "Missing template" });

  let templateData = normalizeTemplateData(body, data);
  if (templateData.error) return res.status(400).json({ ok: false, error: templateData.error });

  const bodySlidesCount = Array.isArray(templateData.body_slides) ? templateData.body_slides.length : 0;
  const safeJobId = `preview_${Date.now()}`;
  const slideFileName = "001_slide.png";
  const ctx = {
    template,
    templateData,
    slideIndex1: 1,
    bodySlidesCount,
    debugInfo: {},
    safeJobId,
    slideFileName,
    run_id: null,
    task_id: null,
    hasRunId: false,
    hasTaskId: false,
  };
  try {
    const { relativePath } = await executeRender(ctx);
    res.json({ ok: true, result_url: `/output/${relativePath}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /render-carousel — render all slides. Body: same as /render but without slide_index. Returns array of result_urls.
app.post("/render-carousel", async (req, res) => {
  let body = normalizeBody(req.body);
  if (body.error) return res.status(400).json({ ok: false, error: body.error });

  const template = body?.template ?? body?.["template"];
  const job_id = body?.job_id ?? body?.["job.id"];
  const run_id = body?.run_id ?? body?.["run.id"];
  const task_id = body?.task_id ?? body?.["task.id"];
  const data = (body && body.data) != null ? body.data : {};
  if (!template) return res.status(400).json({ ok: false, error: "Missing template" });

  let templateData = normalizeTemplateData(body, data);
  if (templateData.error) return res.status(400).json({ ok: false, error: templateData.error });

  const bodySlidesCount = Array.isArray(templateData.body_slides) ? templateData.body_slides.length : 0;
  const expectedTotalSlides = 1 + bodySlidesCount + 1;
  const safeJobId = String(job_id || "job").replace(/[^a-zA-Z0-9_-]/g, "_");
  const hasRunId = run_id != null && String(run_id).trim() !== "";
  const hasTaskId = task_id != null && String(task_id).trim() !== "";

  const debugInfo = { body_slides_count: bodySlidesCount, expected_total_slides: expectedTotalSlides };
  const slides = [];
  try {
    for (let slideIndex1 = 1; slideIndex1 <= expectedTotalSlides; slideIndex1++) {
      const slideFileName = `${String(slideIndex1).padStart(3, "0")}_slide.png`;
      const ctx = {
        template,
        templateData,
        slideIndex1,
        bodySlidesCount,
        debugInfo,
        safeJobId,
        slideFileName,
        run_id,
        task_id,
        hasRunId,
        hasTaskId,
      };
      const { relativePath } = await executeRender(ctx);
      slides.push({ slide_index: slideIndex1, result_url: `/output/${relativePath}` });
    }
    res.json({ ok: true, slides });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

setInterval(() => {
  const cutoff = Date.now() - ASYNC_JOB_TTL_MS;
  for (const [id, job] of asyncJobs.entries()) {
    if (job.at < cutoff) asyncJobs.delete(id);
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3333;
const server = app.listen(PORT, () => console.log(`CAF Renderer running on http://localhost:${PORT} (version ${RENDERER_VERSION})`));
server.timeout = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000;
