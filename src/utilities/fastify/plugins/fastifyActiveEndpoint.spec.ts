import { jest } from '@jest/globals';
import fastify from 'fastify';

import { getPromiseRejection, mockSpy } from '../../../testUtils/jest.js';
import { configureMockEnvVars } from '../../../testUtils/envVars.js';
import type { InternetEndpoint } from '../../awala/InternetEndpoint.js';
import { MONGODB_URI } from '../../../testUtils/db.js';

import fastifyMongoose from './fastifyMongoose.js';

const mockGetActiveEndpoint = mockSpy(jest.fn<() => Promise<Partial<InternetEndpoint>>>());
const mockMakeInitialSessionKey = mockSpy(jest.fn<() => Promise<void>>());
jest.unstable_mockModule('../../awala/InternetEndpointManager.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InternetEndpointManager: {
    init: () => ({
      getActiveEndpoint: mockGetActiveEndpoint,
    }),
  },
}));

const fastifyActiveEndpoint = await import('./fastifyActiveEndpoint.js');

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars({
    MONGODB_URI,
  });

  let activeEndpoint: Partial<InternetEndpoint>;
  beforeEach(() => {
    activeEndpoint = {
      makeInitialSessionKeyIfMissing: mockMakeInitialSessionKey,
    };
    mockGetActiveEndpoint.mockResolvedValueOnce(activeEndpoint);
  });

  test('Fastify should be decorated with active endpoint', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint.default);

    expect(app).toHaveProperty('activeEndpoint');
    expect(app.activeEndpoint).toStrictEqual(activeEndpoint);
  });

  test('Should make initial session key', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint.default);

    expect(mockMakeInitialSessionKey).toHaveBeenCalledOnce();
  });

  test('Missing db connection should throw error', async () => {
    const app = fastify();

    const error = await getPromiseRejection(
      async () => app.register(fastifyActiveEndpoint.default),
      Error,
    );
    expect(error).toHaveProperty('message', 'MongoDB not configured!');
  });
});
