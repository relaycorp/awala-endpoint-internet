import { Parcel } from '@relaycorp/relaynet-core';
import { subSeconds } from 'date-fns';

import { HTTP_STATUS_CODES } from '../utilities/http.js';

import { postParcel } from './utils/awala/pohttp.js';
import { PrivateEndpoint } from './utils/awala/PrivateEndpoint.js';

describe('PoHTTP server', () => {
  test('Expired parcel should be refused', async () => {
    const privateEndpoint = await PrivateEndpoint.generate();
    const channel = await privateEndpoint.saveInternetEndpointChannel();
    const expiredParcel = await channel.makeMessage(new ArrayBuffer(0), Parcel, {
      creationDate: subSeconds(new Date(), 2),
      ttl: 1,
    });

    const response = await postParcel(expiredParcel);

    expect(response.status).toBe(HTTP_STATUS_CODES.FORBIDDEN);
  });

  test('Valid parcel should be accepted', async () => {
    const privateEndpoint = await PrivateEndpoint.generate();
    const channel = await privateEndpoint.saveInternetEndpointChannel();
    const parcel = await channel.makeMessage(new ArrayBuffer(0), Parcel);

    const response = await postParcel(parcel);

    expect(response.status).toBe(HTTP_STATUS_CODES.ACCEPTED);
  });
});
