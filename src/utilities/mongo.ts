import envVar from 'env-var';
import { type Connection, createConnection } from 'mongoose';

export function createMongooseConnectionFromEnv(): Connection {
  const mongoUri = envVar.get('MONGODB_URI').required().asString();
  const dbName = envVar.get('MONGODB_DB').asString();
  const user = envVar.get('MONGODB_USER').asString();
  const pass = envVar.get('MONGODB_PASSWORD').asString();
  return createConnection(mongoUri, { dbName, user, pass });
}
