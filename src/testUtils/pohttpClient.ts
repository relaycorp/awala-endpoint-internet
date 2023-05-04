import { makePohttpClient } from '../client/server.js';

import { makeTestServer, type TestServerFixture } from './server.js';
import { REQUIRED_ENV_VARS } from './envVars.js';

const REQUIRED_CLIENT_ENV_VARS = REQUIRED_ENV_VARS;

export function setUpTestPohttpClient(): () => TestServerFixture {
  return makeTestServer(makePohttpClient, REQUIRED_CLIENT_ENV_VARS);
}
