import type { FastifyInstance } from 'fastify';

import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import type { InternetEndpointManager } from '../../utilities/awala/InternetEndpointManager.js';

describe('Connection params route', () => {
  const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let endpointManager: InternetEndpointManager;
  beforeEach(() => {
    ({ server, endpointManager } = getTestServerFixture());
  });

  test('Should respond with connection parameters', async () => {
    const response = await server.inject({ method: 'GET', url: '/connection-params.der' });

    expect(response).toHaveProperty('statusCode', 200);
    expect(response).toHaveProperty('headers.content-type', 'application/vnd.etsi.tsl.der');
    const internetEndpoint = await endpointManager.getActiveEndpoint();
    const parameters = await internetEndpoint.getConnectionParams();
    expect(response.rawPayload).toMatchObject(parameters);
  });
});
