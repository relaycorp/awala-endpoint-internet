import { CloudEvent } from 'cloudevents';

import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { CE_ID } from '../testUtils/eventing/stubs.js';
import { OUTGOING_SERVICE_MESSAGE_TYPE } from '../events/outgoingServiceMessage.event.js';
import {
  PEER_ID,
  SERVICE_MESSAGE_CONTENT,
  SERVICE_MESSAGE_CONTENT_TYPE,
} from '../testUtils/awala/stubs.js';

import { postEventToPohttpClient } from './utils/awala/pohttp.js';

describe('PoHTTP client', () => {
  test('Invalid outgoing service message event should be refused', async () => {
    // An event with an invalid expiry
    const incompleteEvent = new CloudEvent({
      id: CE_ID,
      source: 'default',
      type: OUTGOING_SERVICE_MESSAGE_TYPE,
      expiry: 'invalid',
      subject: PEER_ID,
      datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
      data: SERVICE_MESSAGE_CONTENT,
    });

    const response = await postEventToPohttpClient(incompleteEvent);

    expect(response.status).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
  });
});
