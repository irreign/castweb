# StyleBook server

Backend for the "✨ Preview with AI" feature in `hairstyle-app.html`. It does two things:

1. Serves the static site (`index.html`, `hairstyle-app.html`) from the repo root.
2. Exposes `POST /api/preview`, which takes the user's uploaded photo + a chosen hairstyle/colour and calls the OpenAI Images API (`gpt-image-1`, edit endpoint) to generate a photorealistic preview — keeping your API key on the server, never in the browser.

Without this server running, the rest of the app (face-shape questionnaire, text/colour recommendations, Style Book history) still works fully client-side. Only the AI photo preview button needs the backend.

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

Because each click of "Preview with AI" costs real money, the server includes a simple per-IP rate limit (default: 12 requests/hour), configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in `.env`. Tighten this before sharing the app publicly.

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
