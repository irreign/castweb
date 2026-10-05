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

## Deploying

The site is one Node process with one database file. Any host that runs Node and has a **persistent disk** works, for example Render, Railway, Fly.io or a small VPS:

1. Set the start command to `npm start`, with `topgoal/` as the root directory.
2. Point `DATABASE_FILE` at the persistent disk, e.g. `/data/topgoal.db`.
3. Set `TRUST_PROXY=1` and serve the site over HTTPS.
4. Register your own account first, so that it becomes the admin.
5. Back up the database file regularly.

## Project layout

```
server.js            start-up
src/app.js           Express app, security headers, error pages
src/db.js            SQLite schema and default forums
src/auth.js          passwords, sessions, CSRF, roles, rate limiting
src/render.js        auto-escaping HTML templates, layout, post/wiki formatting
src/routes/*.js      home, auth, forum, wiki, season, fas, profile, verify, admin
public/              CSS, small client script (countdown, mobile menu)
scripts/seed-demo.js sample content for previews
test/                end-to-end tests (node:test)
```

TopGoal Hub is not affiliated with or endorsed by the makers of TopGoal.
