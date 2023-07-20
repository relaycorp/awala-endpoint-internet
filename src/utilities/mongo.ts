import envVar from 'env-var';
import { type Connection, type ConnectOptions, createConnection } from 'mongoose';

function omitUndefinedOptions(initialOptions: ConnectOptions): ConnectOptions | undefined {
  const entries = Object.entries(initialOptions).filter(([, value]) => value !== undefined);
  const finalOptions = Object.fromEntries(entries);
  return Object.keys(finalOptions).length === 0 ? undefined : finalOptions;
}

export function createMongooseConnectionFromEnv(): Connection {
  const mongoUri = envVar.get('MONGODB_URI').required().asString();
  const dbName = envVar.get('MONGODB_DB').asString();
  const user = envVar.get('MONGODB_USER').asString();
  const pass = envVar.get('MONGODB_PASSWORD').asString();
  const options = omitUndefinedOptions({ dbName, user, pass });
  return createConnection(mongoUri, options);
}
