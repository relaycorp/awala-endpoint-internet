import { makePohttpClient } from '../client/server.js';

import { makeTestServer, type TestServerFixture } from './server.js';
import { REQUIRED_ENV_VARS } from './envVars.js';

export const POHTTP_CLIENT_REQUIRED_ENV_VARS = {
  ...REQUIRED_ENV_VARS,
  POHTTP_TLS_REQUIRED: 'false',
};

export function setUpTestPohttpClient(): () => TestServerFixture {
  return makeTestServer(makePohttpClient, POHTTP_CLIENT_REQUIRED_ENV_VARS);
}
