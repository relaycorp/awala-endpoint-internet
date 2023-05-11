import type { FastifyInstance } from 'fastify';

import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import type { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';

describe('Connection params route', () => {
  const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let endpoint: InternetEndpoint;
  beforeEach(() => {
    ({ server, endpoint } = getTestServerFixture());
  });

  test('Should respond with connection parameters', async () => {
    const response = await server.inject({ method: 'GET', url: '/connection-params.der' });

    expect(response).toHaveProperty('statusCode', 200);
    expect(response).toHaveProperty('headers.content-type', 'application/vnd.etsi.tsl.der');
    const parameters = await endpoint.getConnectionParams();
    expect(response.rawPayload).toMatchObject(parameters);
  });
});
