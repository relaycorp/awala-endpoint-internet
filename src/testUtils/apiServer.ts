import { makeTestServer, type TestServerFixture } from './server.js';
import { REQUIRED_ENV_VARS } from './envVars.js';
import { makeApiServer } from '../api/server.js';

const REQUIRED_API_ENV_VARS = REQUIRED_ENV_VARS;

export function makeTestApiServer(): () => TestServerFixture {
  const getFixture = makeTestServer(makeApiServer, REQUIRED_API_ENV_VARS);

  beforeEach(() => {
    const { envVarMocker } = getFixture();

    envVarMocker({ ...REQUIRED_API_ENV_VARS });
  });

  return getFixture;
}
