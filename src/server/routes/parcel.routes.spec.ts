import type { FastifyInstance, InjectOptions } from 'fastify';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { subDays } from 'date-fns';

import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../testUtils/envVars.js';
import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import { type MockLogSet, partialPinoLog } from '../../testUtils/logging.js';
import type { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
import { generateParcel } from '../../testUtils/awala/parcel.js';
import { KEY_PAIR_SET } from '../../testUtils/awala/stubs.js';

configureMockEnvVars(REQUIRED_ENV_VARS);

describe('parcel route', () => {
  const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let logs: MockLogSet;
  let activeEndpoint: InternetEndpoint;

  const validRequestOptions: InjectOptions = {
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Content-Type': 'application/vnd.awala.parcel',
    },

    method: 'POST',
    payload: {},
    url: '/',
  };
  beforeEach(async () => {
    ({ server, logs } = getTestServerFixture());
    activeEndpoint = await server.getActiveEndpoint();
  });

  test('Valid parcel should be accepted', async () => {
    const parcelRecipient = {
      id: activeEndpoint.id,
      internetAddress: activeEndpoint.internetAddress,
    };
    const keyPairSet = KEY_PAIR_SET;
    const certificatePath = await generatePDACertificationPath(keyPairSet);
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      certificatePath.privateEndpoint,
      keyPairSet,
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Parcel is valid and has been queued', {
        parcelId: parcel.id,
        recipient: parcel.recipient,
        senderId: await parcel.senderCertificate.calculateSubjectId(),
      }),
    );
  });

  test('Content-Type other than application/vnd.awala.parcel should be refused', async () => {
    const response = await server.inject({
      ...validRequestOptions,

      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Content-Type': 'application/json',
      },
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.UNSUPPORTED_MEDIA_TYPE);
  });

  test('Request body should be refused if it is not a valid RAMF-serialized parcel', async () => {
    const payload = Buffer.from('');
    const response = await server.inject({
      ...validRequestOptions,
      payload,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.BAD_REQUEST);
    expect(JSON.parse(response.payload)).toHaveProperty(
      'message',
      'Payload is not a valid RAMF-serialized parcel',
    );
    expect(logs).toContainEqual(partialPinoLog('info', 'Refusing malformed parcel'));
  });

  test('Parcel should be refused if it is well-formed but invalid', async () => {
    const parcelRecipient = {
      id: activeEndpoint.id,
      internetAddress: activeEndpoint.internetAddress,
    };
    const keyPairSet = KEY_PAIR_SET;
    const certificatePath = await generatePDACertificationPath(keyPairSet);
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      certificatePath.privateEndpoint,
      keyPairSet,
      subDays(new Date(), 1),
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.FORBIDDEN);
    expect(JSON.parse(response.payload)).toHaveProperty(
      'message',
      'Parcel is well-formed but invalid',
    );
    expect(logs).toContainEqual(partialPinoLog('info', 'Refusing invalid parcel'));
  });
});
