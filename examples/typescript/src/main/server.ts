// src/main/server.ts — the entry point: reads the configuration, creates the app and listens. Nothing else.
// The only line of the project that touches process.env.
import { loadConfig } from './config';
import { createApp } from './index';

const config = loadConfig(process.env); // a wrong setting stops here, before anything starts
createApp({ dbPath: config.dbPath }).app.listen(config.port, () => console.log(`Server running on port ${config.port}`));
