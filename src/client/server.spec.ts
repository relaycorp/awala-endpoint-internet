import type { FastifyInstance } from 'fastify';

import { setUpTestPohttpClient } from '../testUtils/pohttpClient.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';

describe('test', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;
  beforeEach(() => {
    ({ server } = getTestServerFixture());
  });

  const req = {
    url: '/test1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    headers: { 'content-type': 'application/cloudevents+json' },
    payload: 'null',
  };

  test('/test - Request1', async () => {
    const response = await server.inject({
      ...req,
      method: 'POST',
    });

    expect(response.statusCode).toBe(HTTP_STATUS_CODES.ACCEPTED);
  });

  test('/test - Request2', async () => {
    const response = await server.inject({
      ...req,
      method: 'POST',
    });

    expect(response.statusCode).toBe(HTTP_STATUS_CODES.ACCEPTED);
  });
});
