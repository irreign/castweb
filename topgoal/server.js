'use strict';

const path = require('node:path');
const { open } = require('./src/db');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'topgoal.db');

const db = open(dbFile);
const app = createApp(db, { trustProxy: process.env.TRUST_PROXY === '1' });

app.listen(port, () => {
  console.log(`TopGoal Hub running at http://localhost:${port} (database: ${dbFile})`);
});
