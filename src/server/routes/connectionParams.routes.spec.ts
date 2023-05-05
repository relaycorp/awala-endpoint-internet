import type { FastifyInstance } from 'fastify';

import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import type { InternetEndpointManager } from '../../utilities/awala/InternetEndpointManager.js';

describe('healthcheck routes', () => {
  const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let internetEndpointManager: InternetEndpointManager;
  beforeEach(() => {
    ({ server, internetEndpointManager } = getTestServerFixture());
  });

  test('A plain simple HEAD request should provide some diagnostic information', async () => {
    const internetEndpoint = await internetEndpointManager.getActiveEndpoint();
    const parameters = await internetEndpoint.getConnectionParams();

    const response = await server.inject({ method: 'GET', url: '/connection-params.der' });

    expect(response).toHaveProperty('statusCode', 200);
    expect(response).toHaveProperty('headers.content-type', 'application/vnd.etsi.tsl.der');
    expect(response.body).toBe(parameters.toString());
  });
});
