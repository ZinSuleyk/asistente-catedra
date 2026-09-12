import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 21 },
});
const sessions = new Map();
const allowedLesson = new Set([".pdf", ".pptx", ".txt", ".md"]);
const allowedSubmission = new Set([".pdf", ".txt", ".md"]);

app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

function extension(name) {
  const value = name.lastIndexOf(".");
  return value === -1 ? "" : name.slice(value).toLowerCase();
}

function requireOpenRouter() {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("OPENROUTER_API_KEY is not configured. Paste your OpenRouter key in .env.");
    error.status = 503;
    throw error;
  }
  return process.env.OPENROUTER_API_KEY;
}

function publicError(error) {
  if (error?.status === 429) return "OpenRouter is rate limiting this project. Please try again shortly.";
  if (error?.status === 401) return "The OpenRouter API key was rejected. Check OPENROUTER_API_KEY.";
  return error?.message || "The request could not be completed.";
}

async function routerRequest(path, body, raw = false) {
  const response = await fetch(`https://openrouter.ai/api/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenRouter()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": `http://localhost:${port}`,
      "X-Title": "Classroom Compass",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(details?.error?.message || "OpenRouter could not complete the request.");
    error.status = response.status;
    throw error;
  }
  return raw ? response : response.json();
}

async function routerText(messages) {
  const response = await routerRequest("/chat/completions", {
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    messages,
    response_format: { type: "json_object" },
  });
  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned an empty response.");
  return text;
}

function xmlText(value) {
  return value.replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g, "$1 ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function filePart(file, label) {
  const ext = extension(file.originalname);
  if (ext === ".pdf") {
    return { type: "file", file: { filename: `${label}.pdf`, file_data: `data:application/pdf;base64,${file.buffer.toString("base64")}` } };
  }
  if (ext === ".pptx" || ext === ".ppt") {
    const zip = await JSZip.loadAsync(file.buffer);
    const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort();
    const slides = await Promise.all(slideNames.map(async (name) => xmlText(await zip.file(name).async("text"))));
    return { type: "text", text: `${label} presentation:\n${slides.map((slide, index) => `Slide ${index + 1}: ${slide}`).join("\n")}` };
  }
  return { type: "text", text: `${label}:\n${file.buffer.toString("utf8")}` };
}

const diagnosticSchema = {
  type: "object",
  additionalProperties: false,
  required: ["classMastery", "skills", "misconception", "recommendation"],
  properties: {
    classMastery: { type: "integer", minimum: 0, maximum: 100 },
    skills: {
      type: "array", minItems: 1, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "mastery", "students"],
        properties: {
          name: { type: "string" }, mastery: { type: "integer", minimum: 0, maximum: 100 },
          students: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "status"], properties: { id: { type: "string" }, status: { type: "string", enum: ["secure", "developing", "needs_support"] } } } },
        },
      },
    },
    misconception: {
      type: "object", additionalProperties: false,
      required: ["title", "evidence", "rootCause", "affectedStudentIds"],
      properties: { title: { type: "string" }, evidence: { type: "string" }, rootCause: { type: "string" }, affectedStudentIds: { type: "array", items: { type: "string" } } },
    },
    recommendation: {
      type: "object", additionalProperties: false,
      required: ["title", "detail"],
      properties: { title: { type: "string" }, detail: { type: "string" } },
    },
  },
};

const assetSchema = {
  type: "object", additionalProperties: false,
  required: ["slides", "audioScript", "practiceMarkdown", "calendar"],
  properties: {
    slides: { type: "array", minItems: 4, maxItems: 7, items: { type: "object", additionalProperties: false, required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } } } } },
    audioScript: { type: "string", minLength: 20 },
    practiceMarkdown: { type: "string", minLength: 20 },
    calendar: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["title", "start", "end", "description"], properties: { title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, description: { type: "string" } } } },
  },
};

async function inputFiles(lesson, submissions) {
  const parts = [
    { type: "text", text: "Lesson material:" },
    await filePart(lesson, "Lesson"),
  ];
  for (const [index, submission] of submissions.entries()) {
    parts.push({ type: "text", text: `Student ${index + 1} submission:` }, await filePart(submission, `Student ${index + 1}`));
  }
  return parts;
}

async function persistSession(session) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/compass_sessions`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ id: session.id, analysis: session.analysis, created_at: session.createdAt }),
  });
  if (!response.ok) throw new Error("The diagnostic was generated, but remote persistence failed. Verify the Supabase table and service role key.");
}

app.get("/api/health", (_req, res) => {
  res.json({ configured: Boolean(process.env.OPENROUTER_API_KEY), persistence: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) });
});

app.post("/api/diagnose", upload.fields([{ name: "lesson", maxCount: 1 }, { name: "submissions", maxCount: 20 }]), async (req, res, next) => {
  try {
    const lesson = req.files?.lesson?.[0];
    const submissions = req.files?.submissions || [];
    if (!lesson || !submissions.length) return res.status(400).json({ error: "Upload one lesson file and at least one student submission." });
    if (!allowedLesson.has(extension(lesson.originalname)) || submissions.some((file) => !allowedSubmission.has(extension(file.originalname)))) {
      return res.status(400).json({ error: "Unsupported file type. Lessons accept PDF, PPTX, TXT, or MD. Student work accepts PDF, TXT, or MD." });
    }
    if (submissions.some((file) => file.size > 5 * 1024 * 1024)) return res.status(400).json({ error: "Each student submission must be 5 MB or smaller." });

    const content = await inputFiles(lesson, submissions);
    const analysis = JSON.parse(await routerText([
      { role: "system", content: "You are Classroom Compass, a careful teacher-support analyst. Compare the lesson objectives with student work. Use only Student 1, Student 2, and so on. Do not identify people, infer protected traits, diagnose disabilities, or fabricate evidence. Return only valid JSON matching this schema: " + JSON.stringify(diagnosticSchema) },
      { role: "user", content },
    ]));
    const session = { id: crypto.randomUUID(), analysis, createdAt: new Date().toISOString() };
    sessions.set(session.id, session);
    await persistSession(session);
    res.json({ sessionId: session.id, analysis });
  } catch (error) { next(error); }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const { sessionId, prompt } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session || typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "A diagnostic session and a question are required." });
    const response = await routerRequest("/chat/completions", { model: process.env.OPENROUTER_MODEL || "openrouter/auto", messages: [{ role: "system", content: "You are Classroom Compass. Reply in Spanish in no more than 150 words. Give practical, evidence-bound teaching guidance. Never reveal or guess student identities." }, { role: "user", content: `Diagnostic: ${JSON.stringify(session.analysis)}\n\nTeacher question: ${prompt}` }] });
    res.json({ text: response.choices?.[0]?.message?.content || "No response returned." });
  } catch (error) { next(error); }
});

function toIcsDate(iso) { return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function icsEscape(value) { return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function calendarIcs(events) {
  const stamp = toIcsDate(new Date().toISOString());
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Classroom Compass//ES", "CALSCALE:GREGORIAN", ...events.flatMap((event) => ["BEGIN:VEVENT", `UID:${crypto.randomUUID()}@classroom-compass`, `DTSTAMP:${stamp}`, `DTSTART:${toIcsDate(event.start)}`, `DTEND:${toIcsDate(event.end)}`, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(event.description)}`, "END:VEVENT"]), "END:VCALENDAR", ""].join("\r\n");
}

async function deckBuffer(slides) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Classroom Compass";
  pptx.subject = "Targeted lesson plan";
  pptx.title = slides[0]?.title || "Targeted lesson";
  pptx.company = "Classroom Compass";
  pptx.lang = "es-ES";
  pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos", lang: "es-ES" };
  slides.forEach((slideData, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: index === 0 ? "071630" : "F7FAFF" };
    const titleColor = index === 0 ? "FFFFFF" : "0A1833";
    slide.addText(slideData.title, { x: 0.8, y: 0.65, w: 11.6, h: 0.7, fontFace: "Aptos Display", fontSize: 30, bold: true, color: titleColor, margin: 0 });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 1.55, w: 1.2, h: 0, line: { color: "3478FF", width: 2 } });
    slide.addText(slideData.body.map((text) => ({ text, options: { bullet: { indent: 14 }, hanging: 3, breakLine: true } })), { x: 1.0, y: 2.0, w: 10.8, h: 3.8, fontFace: "Aptos", fontSize: 21, color: index === 0 ? "DCE8FF" : "334766", breakLine: false, valign: "mid", margin: 0.08, paraSpaceAfterPt: 14 });
    slide.addText(`Classroom Compass  |  ${index + 1}`, { x: 0.8, y: 7.05, w: 11.5, h: 0.2, fontFace: "Aptos", fontSize: 9, color: index === 0 ? "A9C5FF" : "7485A3", align: "right", margin: 0 });
  });
  return pptx.write({ outputType: "nodebuffer" });
}

app.post("/api/assets", upload.single("lesson"), async (req, res, next) => {
  try {
    const session = req.body?.sessionId ? sessions.get(req.body.sessionId) : null;
    const lesson = req.file;
    if (!session && !lesson) return res.status(400).json({ error: "Upload lesson material before generating teaching assets." });
    if (lesson && !allowedLesson.has(extension(lesson.originalname))) return res.status(400).json({ error: "Lessons accept PDF, PPTX, TXT, or MD." });
    const source = session
      ? [{ type: "text", text: `Diagnostic: ${JSON.stringify(session.analysis)}` }]
      : [{ type: "text", text: "Create a lesson-aligned resource set from this teacher's lesson material." }, await filePart(lesson, "Lesson")];
    const now = new Date().toISOString();
    const plan = JSON.parse(await routerText([
      { role: "system", content: `You create concise, editable classroom materials in Spanish from teacher material. When a diagnostic is provided, target its identified learning need; otherwise, anchor all content to the lesson objectives. Make 4-7 presentation slides, a 45-60 second audio recap, a contextual practice set in Markdown, and 1-5 review events. Every calendar start/end must be valid ISO 8601 timestamps after ${now}. Use no student names. Return only valid JSON matching this schema: ${JSON.stringify(assetSchema)}` },
      { role: "user", content: source },
    ]));
    const [pptx, speech] = await Promise.all([
      deckBuffer(plan.slides),
      routerRequest("/audio/speech", { model: process.env.OPENROUTER_TTS_MODEL || "mistralai/voxtral-mini-tts-2603", voice: process.env.OPENROUTER_TTS_VOICE || "en_paul_neutral", input: plan.audioScript, response_format: "mp3" }, true),
    ]);
    const audio = Buffer.from(await speech.arrayBuffer());
    res.json({
      files: {
        pptx: { name: "classroom-compass-lesson.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", data: pptx.toString("base64") },
        audio: { name: "classroom-compass-recap.mp3", type: "audio/mpeg", data: audio.toString("base64") },
        practice: { name: "classroom-compass-practice.md", type: "text/markdown", data: Buffer.from(plan.practiceMarkdown).toString("base64") },
        calendar: { name: "classroom-compass-review-plan.ics", type: "text/calendar", data: Buffer.from(calendarIcs(plan.calendar)).toString("base64") },
      },
    });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "A file exceeds the 20 MB upload limit." : error.message });
  console.error(error);
  res.status(error.status || 500).json({ error: publicError(error) });
});

app.listen(port, () => console.log(`Classroom Compass running at http://localhost:${port}`));
