import type { FastifyInstance, InjectOptions } from 'fastify';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { subDays } from 'date-fns';
import { derDeserializeECDHPublicKey, derSerializePublicKey } from '@relaycorp/relaynet-core';

import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../testUtils/envVars.js';
import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import { type MockLogSet, partialPinoLog } from '../../testUtils/logging.js';
import type { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
import { KEY_PAIR_SET } from '../../testUtils/awala/stubs.js';
import { generateParcel } from '../../testUtils/awala/parcel.js';

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
    const sessionKey = await activeEndpoint.retrieveInitialSessionPublicKey();
    const serializedPublicKey = await derSerializePublicKey(sessionKey.publicKey);
    const publicKey = await derDeserializeECDHPublicKey(serializedPublicKey);
    const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      certificatePath,
      KEY_PAIR_SET,
      new Date(),
      {
        publicKey,
        keyId: sessionKey.keyId,
      },
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
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
    const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      certificatePath,
      KEY_PAIR_SET,
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

  test('Invalid service message should be refused', async () => {
    const parcelRecipient = {
      id: activeEndpoint.id,
      internetAddress: activeEndpoint.internetAddress,
    };
    const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      certificatePath,
      KEY_PAIR_SET,
      new Date(),
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.BAD_REQUEST);
    expect(logs).toContainEqual(partialPinoLog('info', 'Invalid service message'));
  });
});
