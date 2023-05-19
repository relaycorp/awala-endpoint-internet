import { AssertionError } from 'node:assert';

import fastify from 'fastify';

import { configureMockEnvVars } from '../../../testUtils/envVars.js';
import { mockInternetEndpoint } from '../../../testUtils/awala/mockInternetEndpoint.js';
import { MONGODB_URI, setUpTestDbConnection } from '../../../testUtils/db.js';
import { getPromiseRejection } from '../../../testUtils/jest.js';
import type { InternetEndpoint } from '../../awala/InternetEndpoint.js';

import fastifyActiveEndpoint from './fastifyActiveEndpoint.js';
import fastifyMongoose from './fastifyMongoose.js';

describe('fastifyActiveEndpoint', () => {
  configureMockEnvVars({ MONGODB_URI });

  const getConnection = setUpTestDbConnection();

  const getInternetEndpoint = mockInternetEndpoint(getConnection);
  let internetEndpoint: InternetEndpoint;
  beforeEach(() => {
    internetEndpoint = getInternetEndpoint();
  });

  test('Fastify should be decorated with active endpoint', async () => {
    const app = fastify();
    await app.register(fastifyMongoose);
    await app.register(fastifyActiveEndpoint);

    expect(app.activeEndpoint).toMatchObject(internetEndpoint);
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
