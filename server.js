import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import pptxgen from "pptxgenjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 21 },
});
const sessions = new Map();
const allowedLesson = new Set([".pdf", ".ppt", ".pptx", ".txt", ".md"]);
const allowedSubmission = new Set([".pdf", ".txt", ".md"]);

app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

function extension(name) {
  const value = name.lastIndexOf(".");
  return value === -1 ? "" : name.slice(value).toLowerCase();
}

function requireOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured. Copy .env.example to .env and add a project API key.");
    error.status = 503;
    throw error;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function publicError(error) {
  if (error?.status === 429) return "OpenAI is rate limiting this project. Please try again shortly.";
  if (error?.status === 401) return "The OpenAI API key was rejected. Check OPENAI_API_KEY.";
  return error?.message || "The request could not be completed.";
}

async function uploadForAnalysis(client, file, filename) {
  return client.files.create({
    file: await toFile(file.buffer, filename, { type: file.mimetype }),
    purpose: "user_data",
  });
}

async function deleteUploadedFiles(client, files) {
  await Promise.allSettled(files.map((file) => client.files.delete(file.id)));
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

function inputFiles(lesson, submissions) {
  return [
    { type: "input_text", text: "Lesson material:" },
    { type: "input_file", file_id: lesson.id },
    ...submissions.flatMap((submission, index) => [
      { type: "input_text", text: `Student ${index + 1} submission:` },
      { type: "input_file", file_id: submission.id },
    ]),
  ];
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
  res.json({ configured: Boolean(process.env.OPENAI_API_KEY), persistence: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) });
});

app.post("/api/diagnose", upload.fields([{ name: "lesson", maxCount: 1 }, { name: "submissions", maxCount: 20 }]), async (req, res, next) => {
  let uploaded = [];
  try {
    const lesson = req.files?.lesson?.[0];
    const submissions = req.files?.submissions || [];
    if (!lesson || !submissions.length) return res.status(400).json({ error: "Upload one lesson file and at least one student submission." });
    if (!allowedLesson.has(extension(lesson.originalname)) || submissions.some((file) => !allowedSubmission.has(extension(file.originalname)))) {
      return res.status(400).json({ error: "Unsupported file type. Lessons accept PDF, PPTX, TXT, or MD. Student work accepts PDF, TXT, or MD." });
    }
    if (submissions.some((file) => file.size > 5 * 1024 * 1024)) return res.status(400).json({ error: "Each student submission must be 5 MB or smaller." });

    const client = requireOpenAI();
    const lessonUpload = await uploadForAnalysis(client, lesson, `lesson${extension(lesson.originalname)}`);
    const submissionUploads = await Promise.all(submissions.map((file, index) => uploadForAnalysis(client, file, `student-${index + 1}${extension(file.originalname)}`)));
    uploaded = [lessonUpload, ...submissionUploads];
    const response = await client.responses.create({
      model: process.env.OPENAI_DIAGNOSTIC_MODEL || "gpt-4o-mini",
      store: false,
      instructions: "You are Classroom Compass, a careful teacher-support analyst. Compare the lesson objectives with student work. Use only Student 1, Student 2, and so on. Do not identify people, infer protected traits, diagnose disabilities, or fabricate evidence. Return a concise instructional analysis in Spanish.",
      input: [{ role: "user", content: inputFiles(lessonUpload, submissionUploads) }],
      text: { format: { type: "json_schema", name: "class_diagnostic", strict: true, schema: diagnosticSchema } },
    });
    const analysis = JSON.parse(response.output_text);
    const session = { id: crypto.randomUUID(), analysis, createdAt: new Date().toISOString() };
    sessions.set(session.id, session);
    await persistSession(session);
    res.json({ sessionId: session.id, analysis });
  } catch (error) { next(error); } finally {
    if (uploaded.length) await deleteUploadedFiles(requireOpenAI(), uploaded).catch(() => undefined);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const { sessionId, prompt } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session || typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "A diagnostic session and a question are required." });
    const client = requireOpenAI();
    const response = await client.responses.create({
      model: process.env.OPENAI_DIAGNOSTIC_MODEL || "gpt-4o-mini",
      store: false,
      instructions: "You are Classroom Compass. Reply in Spanish in no more than 150 words. Give practical, evidence-bound teaching guidance. Never reveal or guess student identities.",
      input: `Diagnostic: ${JSON.stringify(session.analysis)}\n\nTeacher question: ${prompt}`,
    });
    res.json({ text: response.output_text });
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

app.post("/api/assets", async (req, res, next) => {
  try {
    const session = sessions.get(req.body?.sessionId);
    if (!session) return res.status(400).json({ error: "Run a diagnostic before generating teaching assets." });
    const client = requireOpenAI();
    const now = new Date().toISOString();
    const planResponse = await client.responses.create({
      model: process.env.OPENAI_ASSET_MODEL || "gpt-4o-mini",
      store: false,
      instructions: `You create concise, editable classroom materials in Spanish from a diagnostic. Make 4-7 presentation slides, a 45-60 second audio recap, a contextual practice set in Markdown, and 1-5 review events. Every calendar start/end must be valid ISO 8601 timestamps after ${now}. Use no student names.`,
      input: `Diagnostic: ${JSON.stringify(session.analysis)}`,
      text: { format: { type: "json_schema", name: "teaching_assets", strict: true, schema: assetSchema } },
    });
    const plan = JSON.parse(planResponse.output_text);
    const [pptx, speech] = await Promise.all([
      deckBuffer(plan.slides),
      client.audio.speech.create({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: "coral", input: plan.audioScript, response_format: "mp3", instructions: "Habla en español con calidez, claridad y ritmo de repaso para un aula." }),
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
