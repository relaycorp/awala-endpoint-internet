import envVar from 'env-var';
import { type Connection, type ConnectOptions, createConnection } from 'mongoose';

const TIMEOUT_MS = 3000;
const TIMEOUT_CONFIG: ConnectOptions = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  serverSelectionTimeoutMS: TIMEOUT_MS,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  connectTimeoutMS: TIMEOUT_MS,
};

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
    ...TIMEOUT_CONFIG,
  };
  return createConnection(mongoUri, options);
}
