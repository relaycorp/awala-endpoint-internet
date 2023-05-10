import { jest } from '@jest/globals';
import fastify from 'fastify';

import { mockSpy } from '../../../testUtils/jest.js';
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

  let mockActiveEndpoint: InternetEndpoint;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const endpointManager: InternetEndpointManager = {
      getActiveEndpoint: mockGetActiveEndpoint,
    } as Partial<InternetEndpointManager> as any;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    mockActiveEndpoint = {
      makeInitialSessionKeyIfMissing: mockMakeInitialSessionKey,
    } as Partial<InternetEndpoint> as any;

    mockEndpointManagerInit.mockResolvedValueOnce(endpointManager);
    mockGetActiveEndpoint.mockResolvedValueOnce(mockActiveEndpoint);
  });

  test('Fastify should be decorated with get active endpoint function', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);

    await app.register(fastifyActiveEndpoint);
    await app.ready();

    expect(app).toHaveProperty('getActiveEndpoint');
    const activeEndpoint = await app.getActiveEndpoint();
    expect(activeEndpoint).toBe(mockActiveEndpoint);
  });

  test('Active endpoint should be created once and cached', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);
    await app.register(fastifyActiveEndpoint);
    await app.ready();

    const anotherMockActiveEndpoint: InternetEndpoint = null as any;

    const activeEndpointResult1 = await app.getActiveEndpoint();
    mockGetActiveEndpoint.mockResolvedValueOnce(anotherMockActiveEndpoint);
    const activeEndpointResult2 = await app.getActiveEndpoint();

    expect(mockGetActiveEndpoint).toHaveBeenCalledOnce();
    expect(activeEndpointResult2).not.toBeNull();
    expect(activeEndpointResult1).toBe(activeEndpointResult2);
  });

  test('Should make initial session key', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);
    await app.register(fastifyActiveEndpoint);
    await app.ready();

    await app.getActiveEndpoint();

    expect(mockMakeInitialSessionKey).toHaveBeenCalledOnce();
  });
});
