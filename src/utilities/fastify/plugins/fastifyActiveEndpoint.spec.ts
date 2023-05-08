import { jest } from '@jest/globals';
import fastify from 'fastify';

import { getPromiseRejection, mockSpy } from '../../../testUtils/jest.js';
import { configureMockEnvVars } from '../../../testUtils/envVars.js';
import type { InternetEndpoint } from '../../awala/InternetEndpoint.js';
import { MONGODB_URI } from '../../../testUtils/db.js';
import { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';

import fastifyMongoose from './fastifyMongoose.js';
import fastifyActiveEndpoint from './fastifyActiveEndpoint.js';

const mockGetActiveEndpoint = mockSpy(jest.fn<() => Promise<InternetEndpoint>>());
const mockMakeInitialSessionKey = mockSpy(jest.fn<() => Promise<void>>());
const mockEndpointManagerInit = mockSpy(jest.spyOn(InternetEndpointManager, 'init'));

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars({
    MONGODB_URI,
  });

  let activeEndpoint: InternetEndpoint;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const endpointManager: InternetEndpointManager = {
      getActiveEndpoint: mockGetActiveEndpoint,
    } as Partial<InternetEndpointManager> as any;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    activeEndpoint = {
      makeInitialSessionKeyIfMissing: mockMakeInitialSessionKey,
    } as Partial<InternetEndpoint> as any;

    mockEndpointManagerInit.mockResolvedValueOnce(endpointManager);
    mockGetActiveEndpoint.mockResolvedValueOnce(activeEndpoint);
  });

  test('Fastify should be decorated with active endpoint', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint);
    await app.ready();

    expect(app).toHaveProperty('activeEndpoint');
    expect(app.activeEndpoint).toBe(activeEndpoint);
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
    const error = await getPromiseRejection(async () => app.ready(), Error);

    expect(error).toHaveProperty('message', "The decorator is missing dependency 'mongoose'.");
  });
});
