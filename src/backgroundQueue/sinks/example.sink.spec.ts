import { CloudEvent } from 'cloudevents';
import type { FastifyTypedInstance } from '../../utilities/fastify/FastifyTypedInstance.js';
import { postEvent } from '../../testUtils/eventing/cloudEvents.js';
import { mockEmitter } from '../../testUtils/eventing/mockEmitter.js';
import { setUpTestQueueServer } from '../../testUtils/queueServer';
import { CE_ID, CE_SOURCE } from '../../testUtils/eventing/stubs';


describe('example sink', () => {
  const getEvents = mockEmitter();

  const getTestServerFixture = setUpTestQueueServer();
  let server: FastifyTypedInstance;
  beforeEach(() => {
    ({ server } = getTestServerFixture());
  });

  test('Example Sink', async () => {
    const triggerEvent = new CloudEvent<{}>({
      id: CE_ID,
      type:'example',
      source: CE_SOURCE
    });

    await postEvent(triggerEvent, server);

    const publishedEvents = getEvents();
    expect(publishedEvents).toHaveLength(1);
  });
});
