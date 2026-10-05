# TopGoal Hub

An unofficial fan community website for the **TopGoal** iPhone game.

In the game, managers can only chat inside their own FA. TopGoal Hub gives every manager one place to talk across FAs.

## Features

| Area | What it does |
| --- | --- |
| **Accounts** | Sign up and log in. Passwords are hashed with scrypt. Sessions use HttpOnly cookies, every form has CSRF protection, and logins are rate-limited. |
| **Blue tick** | Each account gets a unique code such as `TG-7KQ2M`. The player shows it on their in-game profile and sends a screenshot link. A moderator checks it in the game and approves. Verified managers get a blue tick everywhere on the site. |
| **Forums** | Announcements, General, FA Recruitment, Packs & Players, Tactics, Help & Bugs, and a **Verified Lounge** that only blue-tick managers can post in. Moderators can pin, lock and delete. Posts support simple formatting. |
| **Wiki** | Any logged-in user can create and edit pages. Pages link to each other with `[[Page Name]]`. Every page keeps its full revision history. If two people edit the same page at once, the second save is stopped instead of overwriting the first. Moderators can lock pages and restore old versions. |
| **Season** | A live countdown to the end of the season (days, hours, minutes, seconds) and a progress bar. It also lists the players in each pack this season. Moderators manage seasons. Verified managers can add pack players. |
| **FAs** | An FA directory with search and a "recruiting" filter. Verified FA leaders list and edit their own FA. Managers can link their profile to their FA. |
| **Rankings** | Top FAs ordered by ranking points, which moderators set from in-game standings. Also shows the top community contributors. |
| **Moderation** | `/admin` has a queue of verification requests and user management: roles, blue ticks and suspensions. |

**Roles:** The **first account registered becomes the admin**. Admins can promote other users to moderator.

## Running it

You need Node.js 22.13 or newer. The database is Node's built-in SQLite, so there is nothing else to install.

```bash
cd topgoal
npm install
npm start            # http://localhost:3000
```

Optional: preview the site with sample content (only works on an empty database):

```bash
DEMO_PASSWORD=choose-one npm run seed:demo
npm start
```

Run the tests:

```bash
npm test
```

### Settings (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the site listens on |
| `DATABASE_FILE` | `data/topgoal.db` | Location of the SQLite database file |
| `TRUST_PROXY` | unset | Set to `1` behind a reverse proxy or host that ends HTTPS (Render, Railway, Fly.io, nginx). This gives secure cookies and the correct client IP for rate limits. |

## Deploying to Cloudflare (Workers + D1)

The same app runs on Cloudflare Workers. There, the database is Cloudflare D1 and the files in `public/` are served as static assets. The tables and default forums are created automatically on the first request, so there is no migration step.

1. Create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit** permissions. Also note your account ID.
2. Deploy:

   ```bash
   cd topgoal
   npm install
   export CLOUDFLARE_API_TOKEN=…   CLOUDFLARE_ACCOUNT_ID=…
   npm run deploy
   ```

   On the first deploy, Wrangler creates the `topgoal-hub` D1 database and links it to the Worker. The site goes live at `https://topgoal-hub.<your-subdomain>.workers.dev`. You can add your own domain in the Cloudflare dashboard (Workers → topgoal-hub → Domains & Routes).
3. Open the site and **register your own account first**, so that it becomes the admin.

To try it on Cloudflare's runtime locally, with a local D1 database: `npm run cf:dev`.

**Plan note:** Logging in and signing up hash the password with scrypt. That takes about 25 ms of CPU time. The Workers **Free** plan allows 10 ms of CPU per request, so logins can fail there. The **Workers Paid** plan ($5/month) has much higher limits and is recommended. Browsing the site uses far less CPU.

**Rate limits** (login attempts, posting speed) are kept in memory. On Workers, each instance keeps its own counts, so the limits are looser than on a single Node server.

## Deploying to a Node host

The site is one Node process with one database file. Any host that runs Node and has a **persistent disk** works, for example Render, Railway, Fly.io or a small VPS:

1. Set the start command to `npm start`, with `topgoal/` as the root directory.
2. Point `DATABASE_FILE` at the persistent disk, e.g. `/data/topgoal.db`.
3. Set `TRUST_PROXY=1` and serve the site over HTTPS.
4. Register your own account first, so that it becomes the admin.
5. Back up the database file regularly.

## Project layout

```
server.js            Node start-up (built-in SQLite)
worker.mjs           Cloudflare Workers start-up (D1)
wrangler.jsonc       Cloudflare configuration
src/app.js           Express app, security headers, error pages
src/db.js            schema, default forums, async database interface, D1 driver
src/sqlite-node.js   Node driver (node:sqlite)
src/auth.js          passwords, sessions, CSRF, roles, rate limiting
src/render.js        auto-escaping HTML templates, layout, post/wiki formatting
src/routes/*.js      home, auth, forum, wiki, season, fas, profile, verify, admin
public/static/       CSS, small client script (countdown, mobile menu)
scripts/seed-demo.js sample content for previews
test/                end-to-end tests (node:test)
```

TopGoal Hub is not affiliated with or endorsed by the makers of TopGoal.
