import { Parcel, ServiceMessage } from '@relaycorp/relaynet-core';

import { SERVICE_MESSAGE_CONTENT, SERVICE_MESSAGE_CONTENT_TYPE } from '../testUtils/awala/stubs.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { INCOMING_SERVICE_MESSAGE_TYPE } from '../events/incomingServiceMessage.event.js';

import { PrivateEndpoint } from './utils/awala/PrivateEndpoint.js';
import { postParcel } from './utils/awala/pohttp.js';
import {
  type BinaryBody,
  getMockServerRequests,
  decodeBinaryBody,
  setMockServerExpectation,
} from './utils/mockServer.js';
import { sleep } from './utils/time.js';

describe('E2E', () => {
  test('Incoming service message should be sent to app', async () => {
    const privateEndpoint = await PrivateEndpoint.generate();
    const channel = await privateEndpoint.saveInternetEndpointChannel();
    const serviceMessage = new ServiceMessage(
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
    );
    const parcel = await channel.makeMessage(serviceMessage, Parcel);
    await setMockServerExpectation('mock-app', {
      httpResponse: {
        statusCode: HTTP_STATUS_CODES.ACCEPTED,
      },
    });

    await postParcel(parcel);

    await sleep(1000);
    const requests = await getMockServerRequests('mock-app');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.headers).toHaveProperty('Ce-Type', [INCOMING_SERVICE_MESSAGE_TYPE]);
    expect(
      decodeBinaryBody(request.body as BinaryBody, SERVICE_MESSAGE_CONTENT_TYPE),
    ).toStrictEqual(SERVICE_MESSAGE_CONTENT);
  });

  test.todo('Outgoing service message should be sent to gateway');
});
