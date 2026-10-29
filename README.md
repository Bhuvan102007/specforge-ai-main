# SpecForge AI

SpecForge AI turns course specification documents and optional question-paper blueprints into a reviewed, validated course-specification package.

## Features
- React + TypeScript dark dashboard with five themes.
- Upload DOCX/PDF specifications and an optional blueprint.
- Gemini-powered structured analysis using `GEMINI_API_KEY` (server-side only).
- Local deterministic checks for missing fields, hours, assessment totals, duplicate COs, and placeholders.
- Integrated Lab / Non-Lab template selection with reason-required manual override.
- CO–PO–PSO mapping suggestions with strength and justification.
- JSON, standalone HTML, and validation-report exports.
- Author / Reviewer / HOD workflow demonstration with server-side state/role checks.
- Sample demo course so the app can be explored without uploading a file.

## Requirements
Node.js 20+ and npm.

## Setup
```bash
npm install
cp .env.example .env
```
Add your Gemini API key in the app's **Settings → Gemini AI → Save API key**, or add it to `.env` as `GEMINI_API_KEY=...`. The Settings flow saves it to the local `.env` file with owner-only permissions and makes it available immediately. Do not commit `.env`.

Get a key at [Google AI Studio](https://aistudio.google.com/apikey). The default model is `gemini-3-flash-preview`; update the model in Settings if your account has access to a different Gemini model.

## Run
```bash
npm run dev
```
Open http://localhost:5173. The Vite dev server proxies API requests to the local API server, so the app also works from another device on the same private network using the computer's LAN address (for example, `http://192.168.x.x:5173`). Key updates are accepted only from a matching localhost or private-network origin.

## Verify
```bash
npm run typecheck
npm test
npm run check-template
npm run build
```

## Notes / limitations
- Gemini API calls are made on the server; the API key is never sent to the browser or written to logs.
- Scanned/image-only PDFs need OCR, which is not included in this MVP.
- PDF export uses the browser's Print → Save as PDF workflow from the generated HTML. This avoids silently claiming server-side PDF generation where none is implemented.
- The included role switcher is a local demonstration, not production authentication. Use real authentication and a database before deployment.
- AI-suggested academic mappings and corrections require human review. Missing data is flagged rather than fabricated.
