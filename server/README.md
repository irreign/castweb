# StyleBook server

Backend for the AI features in `hairstyle-app.html`. It does three things:

1. Serves the static site (`index.html`, `hairstyle-app.html`) from the repo root.
2. Exposes `POST /api/analyze`, which sends the uploaded photo to a vision model (`gpt-4o-mini`) to auto-detect face shape and skin undertone, so those two questionnaire steps pre-fill themselves instead of requiring manual selection (the user can still tap a different option to override).
3. Exposes `POST /api/preview`, which takes the photo + a chosen hairstyle/colour and calls the OpenAI Images API (`gpt-image-1`, edit endpoint) to generate a photorealistic preview.

Both endpoints keep the API key on the server, never in the browser. Without this server running, the rest of the app (manual questionnaire, text/colour recommendations, Style Book history) still works fully client-side — only auto-detection and the AI photo preview need the backend.

## Local setup

```bash
cd server
npm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY=sk-...
npm start
```

Then open `http://localhost:3001/hairstyle-app.html` (the server serves the frontend itself, so you don't need a separate static file server).

`npm run dev` restarts automatically on file changes (Node's built-in `--watch`).

## Getting an OpenAI API key

1. Create an account at https://platform.openai.com
2. Add billing (image generation is pay-per-use; each `gpt-image-1` edit is a few cents)
3. Create a key at https://platform.openai.com/api-keys
4. Put it in `server/.env` as `OPENAI_API_KEY`

**Never commit `.env`** — it's already in `.gitignore`.

## Cost control

Each API call costs money, so both endpoints have their own per-IP rate limit:
- `/api/preview` (image generation, a few cents/call): `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS`, default 12/hour.
- `/api/analyze` (vision classification, fractions of a cent/call, and fires automatically on every photo upload): `ANALYZE_RATE_LIMIT_MAX`, default 30/hour.

Tighten these before sharing the app publicly.

## Deploying

Any Node host works since this is a single Express process with no database. Two easy options:

### Render (recommended, has a free tier)
1. Push this repo to GitHub (already done if you're reading this from the repo).
2. New → Web Service → connect the repo.
3. Root directory: `server`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variable `OPENAI_API_KEY` in the Render dashboard.
7. Deploy — Render gives you a URL serving both the site and the API.

### Railway / Fly.io / a VPS
Same idea: set the working directory to `server/`, run `npm install && npm start`, and set `OPENAI_API_KEY` as an environment variable. Set `PORT` if your platform requires a specific port (most inject it automatically).

### If you host the frontend separately (e.g. GitHub Pages) from the backend
Set `ALLOWED_ORIGIN` in `.env` to your frontend's origin (e.g. `https://you.github.io`), and change the `fetch('/api/preview', ...)` call in `hairstyle-app.html` to point at your backend's full URL instead of the relative path.
