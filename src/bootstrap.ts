import type { Connection } from 'mongoose';
import type { BaseLogger } from 'pino';

import { createMongooseConnectionFromEnv } from './utilities/mongo.js';
import { InternetEndpoint } from './utilities/awala/InternetEndpoint.js';
import { makeLogger } from './utilities/logging.js';
import { configureErrorHandling } from './utilities/errorHandling.js';

async function makeInitialSessionKey(connection: Connection, logger: BaseLogger) {
  const endpoint = await InternetEndpoint.getActive(connection);
  const wasKeyCreated = await endpoint.makeInitialSessionKeyIfMissing();
  logger.info(wasKeyCreated ? 'Created initial session key' : 'Initial session key already exists');
}

export async function bootstrapData(): Promise<void> {
  const logger = makeLogger();
  configureErrorHandling(logger);

  const connection = createMongooseConnectionFromEnv();
  try {
    await makeInitialSessionKey(connection, logger);
  } finally {
    await connection.close();
  }
}
