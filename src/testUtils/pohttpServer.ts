import { makePohttpServer } from '../server/server.js';

import { makeTestServer, type TestServerFixture } from './server.js';
import { REQUIRED_ENV_VARS } from './envVars.js';

const REQUIRED_API_ENV_VARS = REQUIRED_ENV_VARS;

export function makeTestPohttpServer(): () => TestServerFixture {
  const getFixture = makeTestServer(makePohttpServer, REQUIRED_API_ENV_VARS);

  beforeEach(async () => {
    const { envVarMocker } = getFixture();

    envVarMocker({ ...REQUIRED_API_ENV_VARS });

    const { endpoint } = getFixture();
    await endpoint.makeInitialSessionKeyIfMissing();
  });

  return getFixture;
}
