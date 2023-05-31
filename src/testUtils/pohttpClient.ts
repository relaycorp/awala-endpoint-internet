import { makePohttpClient } from '../client/server.js';

import { makeTestServer, type TestServerFixture } from './server.js';
import { POHTTPH_CLIENT_REQUIRED_ENV_VARS } from './envVars.js';

export function setUpTestPohttpClient(): () => TestServerFixture {
  return makeTestServer(makePohttpClient, POHTTPH_CLIENT_REQUIRED_ENV_VARS);
}
