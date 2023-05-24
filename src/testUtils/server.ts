import type { FastifyInstance } from 'fastify';
import type { Connection } from 'mongoose';

import type { ServerMaker } from '../utilities/fastify/ServerMaker.js';
import type { InternetEndpoint } from '../utilities/awala/InternetEndpoint.js';

import { makeMockLogging, type MockLogSet } from './logging.js';
import { configureMockEnvVars, type EnvVarSet, type EnvVarMocker } from './envVars.js';
import { clearMongooseModelCache, setUpTestDbConnection } from './db.js';
import { mockInternetEndpoint } from './awala/mockInternetEndpoint.js';

export interface TestServerFixture {
  readonly server: FastifyInstance;
  readonly dbConnection: Connection;
  readonly logs: MockLogSet;
  readonly envVarMocker: EnvVarMocker;
  readonly endpoint: InternetEndpoint;
}

export function makeTestServer(
  serverMaker: ServerMaker,
  envVars: EnvVarSet,
): () => TestServerFixture {
  const envVarMocker = configureMockEnvVars(envVars);
  const mockLogging = makeMockLogging();
  const getConnection = setUpTestDbConnection();
  const getEndpoint = mockInternetEndpoint(getConnection);

  let server: FastifyInstance;
  beforeEach(async () => {
    server = await serverMaker(mockLogging.logger);
  });

  afterEach(async () => {
    await server.close();
    clearMongooseModelCache();
  });

  return () => ({
    server,
    dbConnection: getConnection(),
    logs: mockLogging.logs,
    envVarMocker,
    endpoint: getEndpoint(),
  });
}
