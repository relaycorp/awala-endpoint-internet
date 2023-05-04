import { REQUIRED_ENV_VARS } from '../testUtils/envVars.js';

describe('example', () => {
  test('example', () => {
    expect(REQUIRED_ENV_VARS.ENDPOINT_VERSION).toBe(REQUIRED_ENV_VARS.ENDPOINT_VERSION);
  });
});
