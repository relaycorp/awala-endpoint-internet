import envVar from 'env-var';
import { type Connection, type ConnectOptions, createConnection } from 'mongoose';

const CONNECTION_TIMEOUT_MS = 3000;

function omitUndefinedOptions(initialOptions: ConnectOptions): ConnectOptions {
  const entries = Object.entries(initialOptions).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

export function createMongooseConnectionFromEnv(): Connection {
  const mongoUri = envVar.get('MONGODB_URI').required().asString();
  const dbName = envVar.get('MONGODB_DB').asString();
  const user = envVar.get('MONGODB_USER').asString();
  const pass = envVar.get('MONGODB_PASSWORD').asString();
  const options: ConnectOptions = {
    ...omitUndefinedOptions({ dbName, user, pass }),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    connectTimeoutMS: CONNECTION_TIMEOUT_MS,
  };
  return createConnection(mongoUri, options);
}
