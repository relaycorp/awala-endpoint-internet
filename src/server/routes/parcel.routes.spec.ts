import { FastifyInstance, InjectOptions } from 'fastify';

import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../testUtils/envVars';
import { makeTestPohttpServer } from '../../testUtils/pohttpServer';
import { MockLogSet, partialPinoLog } from '../../testUtils/logging';
import { generatePingParcel } from '../../testUtils/awala/parcel';
import { InternetEndpoint } from '../../utilities/awala/InternetEndpoint';
import {
  generateIdentityKeyPairSet, generatePDACertificationPath,
} from '@relaycorp/relaynet-testing';
import { Parcel } from '@relaycorp/relaynet-core';
import { bufferToArrayBuffer } from '../../utilities/buffer';
import { subDays } from 'date-fns';



configureMockEnvVars(REQUIRED_ENV_VARS);

describe('parcel route', () => {
const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let logs: MockLogSet;
  let activeEndpoint: InternetEndpoint;

  const validRequestOptions: InjectOptions = {
    headers: {
      'Content-Type': 'application/vnd.awala.parcel'
    },
    method: 'POST',
    payload: {},
    url: '/',
  };
  beforeEach(async() => {
    ({ server, logs } = getTestServerFixture());
    activeEndpoint = await server.getActiveEndpoint();
  });

  test('Content-Type other than application/vnd.awala.parcel should be refused', async () => {
    const response = await server.inject({
      ...validRequestOptions,
      headers: {
        ...validRequestOptions.headers,
        'Content-Length': '2',
        'Content-Type': 'application/json',
      },
      payload: {},
    });

    expect(response).toHaveProperty('statusCode', 415);
  });

  test('Request body should be refused if it is not a valid RAMF-serialized parcel', async () => {
    const payload = Buffer.from('');
    const response = await server.inject({
      ...validRequestOptions,
      headers: { ...validRequestOptions.headers, 'Content-Length': payload.byteLength.toString() },
      payload,
    });

    expect(response).toHaveProperty('statusCode', 403);
    expect(JSON.parse(response.payload)).toHaveProperty(
      'reason',
      'Payload is not a valid RAMF-serialized parcel',
    );
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Refusing malformed parcel'),
    );
  });

  test('Parcel should be refused if it is well-formed but invalid', async () => {
    const pingParcelRecipient = {
      id: activeEndpoint.id,
      internetAddress: activeEndpoint.internetAddress,
    };
    const keyPairSet = await generateIdentityKeyPairSet();
    const certificatePath = await generatePDACertificationPath(keyPairSet);


    const { parcelSerialized } = await generatePingParcel(
      pingParcelRecipient,
      certificatePath.privateEndpoint,
      keyPairSet,
      certificatePath,
      subDays(new Date, 10)

    );

    console.log( await Parcel.deserialize(bufferToArrayBuffer(parcelSerialized)))

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', 403);
    expect(JSON.parse(response.payload)).toHaveProperty(
      'message',
      'Parcel is well-formed but invalid',
    );
    // expect(logs).toContainEqual(
    //   partialPinoLog('info', 'Refusing invalid parcel', {
    //     parcelId: parcel.id,
    //     err: expect.objectContaining({ type: InvalidMessageError.name }),
    //   }),
    // );
  });

})
