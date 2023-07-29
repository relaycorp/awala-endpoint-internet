import { Parcel, ServiceMessage } from '@relaycorp/relaynet-core';
import { CloudEvent } from 'cloudevents';
import { addSeconds, formatISO } from 'date-fns';

import { SERVICE_MESSAGE_CONTENT, SERVICE_MESSAGE_CONTENT_TYPE } from '../testUtils/awala/stubs.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { INCOMING_SERVICE_MESSAGE_TYPE } from '../events/incomingServiceMessage.event.js';
import { CE_CONTENT_TYPE, CE_DATA, CE_ID } from '../testUtils/eventing/stubs.js';
import { OUTGOING_SERVICE_MESSAGE_TYPE } from '../events/outgoingServiceMessage.event.js';

import { PrivateEndpoint } from './utils/awala/PrivateEndpoint.js';
import { postEventToPohttpClient, postParcel } from './utils/awala/pohttp.js';
import {
  type BinaryBody,
  getMockServerRequests,
  decodeBinaryBody,
  setMockServerExpectation,
} from './utils/mockServer.js';
import { sleep } from './utils/time.js';
// eslint-disable-next-line max-len
import type { PrivateInternetEndpointChannel } from './utils/awala/PrivateInternetEndpointChannel.js';

async function postPda(channel: PrivateInternetEndpointChannel) {
  const pdaServiceMessage = new ServiceMessage(
    'application/vnd+relaycorp.awala.pda-path',
    await channel.issuePda(),
  );
  const pdaParcel = await channel.makeMessage(pdaServiceMessage, Parcel);
  await postParcel(pdaParcel);
}

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

    await sleep(1500);
    const requests = await getMockServerRequests('mock-app');
    // eslint-disable-next-line no-console
    console.log(new Date(), 'BADGER, got mock requests');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.headers).toHaveProperty('Ce-Type', [INCOMING_SERVICE_MESSAGE_TYPE]);
    expect(
      decodeBinaryBody(request.body as BinaryBody, SERVICE_MESSAGE_CONTENT_TYPE),
    ).toStrictEqual(SERVICE_MESSAGE_CONTENT);
  }, 15_000);

  test('Outgoing service message should be sent to gateway', async () => {
    const privateEndpoint = await PrivateEndpoint.generate();
    const channel = await privateEndpoint.saveInternetEndpointChannel();
    await postPda(channel);

    const now = new Date();
    const outgoingServiceMessageEvent = new CloudEvent({
      id: CE_ID,
      source: channel.peer.id,
      type: OUTGOING_SERVICE_MESSAGE_TYPE,
      subject: privateEndpoint.id,
      datacontenttype: CE_CONTENT_TYPE,
      expiry: formatISO(addSeconds(now, 60)),
      time: formatISO(now),
      data: CE_DATA,
    });
    await setMockServerExpectation('mock-gateway', {
      httpResponse: { statusCode: HTTP_STATUS_CODES.ACCEPTED },
    });
    await postEventToPohttpClient(outgoingServiceMessageEvent);

    await sleep(1000);
    const requests = await getMockServerRequests('mock-gateway');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.headers).toHaveProperty('Content-Type', ['application/vnd.awala.parcel']);
  }, 10_000);
});
