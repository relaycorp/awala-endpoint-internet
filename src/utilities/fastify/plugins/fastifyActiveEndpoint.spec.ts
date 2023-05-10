import fastify from 'fastify';

import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../../testUtils/envVars.js';
import { mockInternetEndpoint } from '../../../testUtils/awala/mockInternetEndpoint.js';
import { setUpTestDbConnection } from '../../../testUtils/db.js';
import type { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';

import fastifyActiveEndpoint from './fastifyActiveEndpoint.js';
import fastifyMongoose from './fastifyMongoose.js';
import { getPromiseRejection } from '../../../testUtils/jest';
import { AssertionError } from 'assert';

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars(REQUIRED_ENV_VARS);

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
    expect(error.message).toMatch(/fastify-mongoose/);
  });
});
