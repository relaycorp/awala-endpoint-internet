import { jest } from '@jest/globals';
import fastify from 'fastify';

import { getPromiseRejection, mockSpy } from '../../../testUtils/jest.js';
import { configureMockEnvVars } from '../../../testUtils/envVars.js';
import type { InternetEndpoint } from '../../awala/InternetEndpoint.js';
import { MONGODB_URI } from '../../../testUtils/db.js';

import fastifyMongoose from './fastifyMongoose.js';
import { InternetEndpointManager } from '../../awala/InternetEndpointManager';
import fastifyActiveEndpoint from './fastifyActiveEndpoint';

const mockGetActiveEndpoint = mockSpy(jest.fn<() => Promise<InternetEndpoint>>());
const mockMakeInitialSessionKey = mockSpy(jest.fn<() => Promise<void>>());

const mockEndpointManagerInit = mockSpy(jest.spyOn(InternetEndpointManager, 'init'));

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars({
    MONGODB_URI,
  });

  let activeEndpoint: Partial<InternetEndpoint>;
  beforeEach(() => {
    mockEndpointManagerInit.mockResolvedValueOnce({
      getActiveEndpoint: mockGetActiveEndpoint,
    } as any)
    activeEndpoint = {
      makeInitialSessionKeyIfMissing: mockMakeInitialSessionKey,
    };
    mockGetActiveEndpoint.mockResolvedValueOnce(activeEndpoint as any);
  });

  test('Fastify should be decorated with active endpoint', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint);
    await app.ready();

    expect(app).toHaveProperty('activeEndpoint');
    expect(app.activeEndpoint).toStrictEqual(activeEndpoint);
  });

  test('Should make initial session key', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint);
    await app.ready();

    expect(mockMakeInitialSessionKey).toHaveBeenCalledOnce();
  });

  test('Missing db connection should throw error', async () => {
    const app = fastify();

    await app.register(fastifyActiveEndpoint);
    const error = await getPromiseRejection(
      async () => app.ready(),
      Error,
    );

    expect(error).toHaveProperty('message', 'The decorator is missing dependency \'mongoose\'.');
  });
});
