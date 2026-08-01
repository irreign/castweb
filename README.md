# castweb

This repo contains two independent things:

- **`index.html`** — the CastWeb marketing site (static, no build step, no backend).
- **`hairstyle-app.html`** + **`server/`** — StyleBook, an AI hairstyle & beauty recommendation app. Upload a photo, answer a few questions, and get a personalised hairstyle/colour/makeup guide with an optional photorealistic AI preview of each recommended style, saved to a local "Style Book" history you can pull up at the salon.

## Running StyleBook

The recommendation engine, style history, and print/export all work by opening `hairstyle-app.html` directly in a browser — no server required.

The "✨ Preview with AI" button (photorealistic hairstyle preview) needs the backend in `server/` running, since it calls the OpenAI Images API with a server-side key. See [`server/README.md`](server/README.md) for setup and deployment instructions.

```bash
cd server
npm install
cp .env.example .env   # add your OPENAI_API_KEY
npm start
# open http://localhost:3001/hairstyle-app.html
```
