import envVar from 'env-var';
import { type Connection, type ConnectOptions, createConnection } from 'mongoose';

function omitUndefinedOptions(obj: ConnectOptions): ConnectOptions {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

export function createMongooseConnectionFromEnv(): Connection {
  const mongoUri = envVar.get('MONGODB_URI').required().asString();
  const dbName = envVar.get('MONGODB_DB').asString();
  const user = envVar.get('MONGODB_USER').asString();
  const pass = envVar.get('MONGODB_PASSWORD').asString();
  const options = { dbName, user, pass };
  return createConnection(mongoUri, omitUndefinedOptions(options));
}
