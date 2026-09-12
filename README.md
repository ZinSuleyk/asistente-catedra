# Classroom Compass

A self-contained teacher dashboard prototype for turning a lesson and student submissions into a class diagnostic and targeted next-step materials.

## Run locally

From this directory, serve the files with any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. No build step is required.

## Demo path

1. Click **Use sample lesson**.
2. Click **Load 3 sample submissions**.
3. Click **Analyze class work**.
4. Review the skill snapshot and priority misconception.
5. Click **Create teaching assets**, then download individual assets.

The included lesson and submissions are explicitly marked sample/demo data. Uploaded files stay in the browser for the current session.

## Prototype boundary

This workspace did not contain the CopilotKit starter repository specified in `promt.txt`, nor a server-side OpenAI configuration. This implementation therefore provides the full interactive product surface and local demo data as a static prototype. The downloadable slide-deck asset is a structured editable-deck outline (not a binary PowerPoint), and the audio asset is a recap script; production PPTX/MP3 generation, OpenAI diagnostics, PDF text extraction, Exa retrieval, and approval-gated persistence need the referenced server application and credentials.
