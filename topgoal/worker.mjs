// Cloudflare Workers entry point. Static files in public/ are served by Workers assets;
// everything else goes to the Express app, backed by the D1 database bound as DB.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createApp } from './src/app.js';
import { d1Database } from './src/db.js';

const app = createApp(d1Database(env.DB), { cloudflare: true });
app.listen(8080);

export default httpServerHandler({ port: 8080 });
