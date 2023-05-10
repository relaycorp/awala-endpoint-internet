import { AssertionError } from 'node:assert';

import fastify from 'fastify';

import { configureMockEnvVars } from '../../../testUtils/envVars.js';
import { mockInternetEndpoint } from '../../../testUtils/awala/mockInternetEndpoint.js';
import { MONGODB_URI, setUpTestDbConnection } from '../../../testUtils/db.js';
import type { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';
import { getPromiseRejection } from '../../../testUtils/jest.js';

import fastifyActiveEndpoint from './fastifyActiveEndpoint.js';
import fastifyMongoose from './fastifyMongoose.js';

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars({ MONGODB_URI });

  const getConnection = setUpTestDbConnection();
  const getInternetEndpointManager = mockInternetEndpoint(getConnection);
  let internetEndpointManager: InternetEndpointManager;

  beforeEach(() => {
    internetEndpointManager = getInternetEndpointManager();
  });

  test('Fastify should be decorated with get active endpoint function', async () => {
    const internetEndpoint = await internetEndpointManager.getActiveEndpoint();
    const app = fastify();
    await app.register(fastifyMongoose);
    await app.register(fastifyActiveEndpoint);

    const activeEndpointFromApp = await app.getActiveEndpoint();
    expect(activeEndpointFromApp).toMatchObject(internetEndpoint);
  });

  test('Missing mongoose plugin should throw error', async () => {
    const app = fastify();

    const error = await getPromiseRejection(
      async () => app.register(fastifyActiveEndpoint),
      AssertionError,
    );
    expect(error.message).toMatch(/fastify-mongoose/u);
  });
});
