import { jest } from '@jest/globals';

import { mockInternetEndpoint } from './testUtils/awala/mockInternetEndpoint.js';
import { makeMockLogging, partialPinoLog } from './testUtils/logging.js';
import { configureMockEnvVars, REQUIRED_ENV_VARS } from './testUtils/envVars.js';

const { logger: mockLogger, logs } = makeMockLogging();
jest.unstable_mockModule('./utilities/logging.js', () => ({
  makeLogger: () => mockLogger,
}));
jest.unstable_mockModule('./utilities/errorHandling.js', () => ({
  configureErrorHandling: jest.fn(),
}));
const { bootstrapData } = await import('./bootstrap.js');
const { configureErrorHandling } = await import('./utilities/errorHandling.js');

describe('bootstrapData', () => {
  configureMockEnvVars(REQUIRED_ENV_VARS);
  const getEndpoint = mockInternetEndpoint();

  test('Active endpoint should have session key created if missing', async () => {
    const endpoint = getEndpoint();
    const keyGeneratorSpy = jest.spyOn(endpoint, 'makeInitialSessionKeyIfMissing');

    await bootstrapData();

    expect(keyGeneratorSpy).toHaveBeenCalledTimes(1);
  });

  test('Key creation should be logged', async () => {
    await bootstrapData();

    expect(logs).toContainEqual(partialPinoLog('info', 'Created initial session key'));
  });

  test('Skipping key creation should be logged', async () => {
    const endpoint = getEndpoint();
    await endpoint.makeInitialSessionKeyIfMissing();

    await bootstrapData();

    expect(logs).toContainEqual(partialPinoLog('info', 'Initial session key already exists'));
  });

  test('Exit handler should be configured', async () => {
    expect(configureErrorHandling).not.toHaveBeenCalled();

    await bootstrapData();

    expect(configureErrorHandling).toHaveBeenCalledWith(mockLogger);
  });
});
