// src/main/server.ts — the entry point: creates the app and listens. Nothing else.
import { createApp } from './index';

const port = Number(process.env.PORT ?? 3000);
createApp().app.listen(port, () => console.log(`Server running on port ${port}`));
