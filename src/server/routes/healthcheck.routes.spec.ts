import type { FastifyInstance } from 'fastify';

import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';

describe('healthcheck routes', () => {
  const getTestServerFixture = makeTestPohttpServer();
  let serverInstance: FastifyInstance;
  beforeEach(() => {
    serverInstance = getTestServerFixture().server;
  });

  test('A plain simple HEAD request should provide some diagnostic information', async () => {
    const response = await serverInstance.inject({ method: 'HEAD', url: '/' });

    expect(response).toHaveProperty('statusCode', 200);
    expect(response).toHaveProperty('headers.content-type', 'text/plain');
  });

  test('A plain simple GET request should provide some diagnostic information', async () => {
    const response = await serverInstance.inject({ method: 'GET', url: '/' });

    expect(response).toHaveProperty('statusCode', 200);
    expect(response).toHaveProperty('headers.content-type', 'text/plain');
    expect(response.payload).toContain('Success');
  });
});
