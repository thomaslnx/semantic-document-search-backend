import { IncomingMessage, Server, ServerResponse } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/environment.ts';
import { logger } from './utils/logger.ts';

/* Main entrypoint */
async function server(): Promise<
  Server<typeof IncomingMessage, typeof ServerResponse> | undefined
> {
  try {
    const app = express();

    /* Secure the middlewares */
    app.use(helmet());
    app.use(
      cors({
        origin: env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') || [] : '*',
        credentials: true,
      })
    );

    /* Body parser middleware */
    app.use(express.json());
    app.use(
      express.urlencoded({
        extended: true,
      })
    );

    return app.listen(env.PORT, () => {
      logger.info(`🚀 🚀 Server up and running on port: ${env.PORT}`);
    });
  } catch (err) {
    console.error(`Theres an error initializing the server!, ${err}`);
  }
}

server();
