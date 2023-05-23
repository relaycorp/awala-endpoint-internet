import type { FastifyInstance } from 'fastify';
import { CloudEvent } from 'cloudevents';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';
import { setUpTestPohttpClient } from '../testUtils/pohttpClient';
import { CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs';


const CLOUD_EVENT_DATA =  {
  id: CE_ID,
  source: CE_SOURCE,
  type: 'testType',
  subject: 'peerId',
  datacontenttype: 'test/content-type',
  time: '2023-05-23T07:13:39.871Z',
  expiry: '2023-05-24T07:13:39.871Z',
  data: "asd",
};
describe('makePohttpClient', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;

  beforeEach(() => {
    ({ server } = getTestServerFixture());
  });


  describe("TEST", () => {
      test('test1', async () => {
      const event = new CloudEvent(CLOUD_EVENT_DATA);

      const response = await postEvent(event, server);

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.ACCEPTED);
    });

    test('test2', async () => {
      const event = new CloudEvent(CLOUD_EVENT_DATA);

      const response = await postEvent(event, server);

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.ACCEPTED);
    });
  })
});



