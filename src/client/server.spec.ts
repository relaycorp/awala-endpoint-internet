import type { FastifyInstance } from 'fastify';
import { CloudEvent } from 'cloudevents';

import { setUpTestPohttpClient } from '../testUtils/pohttpClient';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';

import { ClientProblemType } from './ClientProblemType.js';

describe('makePohttpClient', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;
  beforeEach(() => {
    ({ server } = getTestServerFixture());
  });

  describe('GET', () => {
    test('Response should be 200 OK', async () => {
      const response = await server.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.OK);
      expect(response.body).toBe('It works');
    });
  });

  describe('POST', () => {
    test('Valid CloudEvent should be accepted', async () => {
      const event = new CloudEvent({
        id: CE_ID,
        source: CE_SOURCE,
        type: 'testType',
        data: {},
      });

      const response = await postEvent(event, server);

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
    });

    test('Malformed CloudEvent should be refused', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { 'content-type': 'application/cloudevents+json' },
        payload: 'null',
      });

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(response.json()).toHaveProperty('type', ClientProblemType.INVALID_EVENT);
    });
  });
});
