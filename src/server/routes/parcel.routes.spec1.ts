import { jest } from '@jest/globals';
import {
  getIdFromIdentityKey,
  InvalidMessageError,
  MockPrivateKeyStore,
  Recipient,
} from '@relaycorp/relaynet-core';
import {
  generateIdentityKeyPairSet,
  generatePDACertificationPath,
  NodeKeyPairSet,
  PDACertPath,
} from '@relaycorp/relaynet-testing';
import { subDays } from 'date-fns';
import { FastifyInstance, InjectOptions } from 'fastify';

import { GATEWAY_INTERNET_ADDRESS, generateParcel } from '../../testUtils/awala/parcel';
import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../testUtils/envVars';
import { makeTestPohttpServer } from '../../testUtils/pohttpServer';
import { MockLogSet, partialPinoLog } from '../../testUtils/logging';



configureMockEnvVars(REQUIRED_ENV_VARS);

const validRequestOptions: InjectOptions = {
  headers: {
    'Content-Type': 'application/vnd.awala.parcel',
    Host: `pohttp-${GATEWAY_INTERNET_ADDRESS}`,
  },
  method: 'POST',
  payload: {},
  url: '/',
};
describe('test', () => {
const getTestServerFixture = makeTestPohttpServer();
  let server: FastifyInstance;
  let logs: MockLogSet;
  beforeEach(() => {
    ({ server, logs } = getTestServerFixture());
  });

let keyPairSet: NodeKeyPairSet;
let certificatePath: PDACertPath;
let pongEndpointId: string;
let pingParcelRecipient: Recipient;
let parcelId: string;
beforeAll(async () => {
  keyPairSet = await generateIdentityKeyPairSet();
  certificatePath = await generatePDACertificationPath(keyPairSet);

  pongEndpointId = await getIdFromIdentityKey(keyPairSet.pdaGrantee.publicKey);
  pingParcelRecipient = {
    id: pongEndpointId,
    internetAddress: GATEWAY_INTERNET_ADDRESS,
  };
  const { parcelSerialized, parcel } = await generateParcel(
    pingParcelRecipient,
    certificatePath.privateEndpoint,
    keyPairSet,
    certificatePath,
  );
  // tslint:disable-next-line:no-object-mutation
  validRequestOptions.payload = parcelSerialized;
  // tslint:disable-next-line:readonly-keyword no-object-mutation
  (validRequestOptions.headers as { [key: string]: string })['Content-Length'] =
    parcelSerialized.byteLength.toString();

  parcelId = parcel.id;
});

const mockPrivateKeyStore = new MockPrivateKeyStore();
describe('receiveParcel', () => {
  let parcelLogAttributes: any;
  beforeEach(async () => {
    await mockPrivateKeyStore.saveIdentityKey(pongEndpointId, keyPairSet.pdaGrantee.privateKey);

    parcelLogAttributes = {
      parcelId,
      recipient: pingParcelRecipient,
      senderId: await getIdFromIdentityKey(keyPairSet.privateEndpoint.publicKey),
    };
  });
  beforeEach(async () => {
  });
  afterEach(() => {
    mockPrivateKeyStore.clear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
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

    const yesterday = subDays(new Date(), 1);
    const { parcelSerialized, parcel } = await generateParcel(
      pingParcelRecipient,
      keyPairSet,
      yesterday,
    );
    const response = await server.inject({
      ...validRequestOptions,
      headers: {
        ...validRequestOptions.headers,
        'Content-Length': parcelSerialized.byteLength.toString(),
      },
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', 403);
    expect(JSON.parse(response.payload)).toHaveProperty(
      'message',
      'Parcel is well-formed but invalid',
    );
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Refusing invalid parcel', {
        ...parcelLogAttributes,
        parcelId: parcel.id,
        err: expect.objectContaining({ type: InvalidMessageError.name }),
      }),
    );
  });

  test('Parcel should be ignored if recipient id does not match', async () => {
    const invalidRecipient = { ...pingParcelRecipient, id: `${pingParcelRecipient.id}abc` };
    const { parcelSerialized, parcel } = await generateParcel(
      invalidRecipient,
      certificatePath.privateEndpoint,
      keyPairSet,
      certificatePath,
    );
    const response = await server.inject({
      ...validRequestOptions,
      headers: {
        ...validRequestOptions.headers,
        'Content-Length': parcelSerialized.byteLength.toString(),
      },
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', 202);
    expect(JSON.parse(response.payload)).toBeEmptyObject();
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Parcel is bound for recipient with different id', {
        ...parcelLogAttributes,
        parcelId: parcel.id,
        recipient: invalidRecipient,
      }),
    );
  });

  test('Parcel should be refused if recipient Internet address does not match', async () => {
    const invalidRecipient = {
      ...pingParcelRecipient,
      internetAddress: `not-${GATEWAY_INTERNET_ADDRESS}`,
    };
    const { parcelSerialized, parcel } = await generateParcel(
      invalidRecipient,
      certificatePath.privateEndpoint,
      keyPairSet,
      certificatePath,
    );
    const response = await server.inject({
      ...validRequestOptions,
      headers: {
        ...validRequestOptions.headers,
        'Content-Length': parcelSerialized.byteLength.toString(),
      },
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', 403);
    expect(JSON.parse(response.payload)).toHaveProperty('message', 'Invalid parcel recipient');
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Parcel is bound for recipient with different Internet address', {
        ...parcelLogAttributes,
        parcelId: parcel.id,
        recipient: invalidRecipient,
      }),
    );
  });
});
})
