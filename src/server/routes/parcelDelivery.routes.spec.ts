import { jest } from '@jest/globals';
import type { CloudEvent } from 'cloudevents';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { subDays } from 'date-fns';
import {
  CertificationPath,
  derDeserializeECDHPublicKey,
  derSerializePublicKey,
  PrivateEndpointConnParams,
  type Recipient,
  type SessionKey,
} from '@relaycorp/relaynet-core';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';

import { configureMockEnvVars, REQUIRED_ENV_VARS } from '../../testUtils/envVars.js';
import { makeTestPohttpServer } from '../../testUtils/pohttpServer.js';
import { type MockLogSet, partialPinoLog } from '../../testUtils/logging.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
import {
  KEY_PAIR_SET,
  PEER_ADDRESS,
  PEER_KEY_PAIR,
  SERVICE_MESSAGE_CONTENT,
  SERVICE_MESSAGE_CONTENT_TYPE,
} from '../../testUtils/awala/stubs.js';
import { generateParcel } from '../../testUtils/awala/parcel.js';
import { mockEmitter } from '../../testUtils/eventing/mockEmitter.js';

configureMockEnvVars(REQUIRED_ENV_VARS);

describe('Parcel delivery route', () => {
  const getTestServerFixture = makeTestPohttpServer();
  const getEmittedEvents = mockEmitter();
  const validRequestOptions: InjectOptions = {
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Content-Type': 'application/vnd.awala.parcel',
    },

    method: 'POST',
    payload: {},
    url: '/',
  };

  let server: FastifyInstance;
  let logs: MockLogSet;
  let parcelRecipient: Recipient;
  let sessionKey: SessionKey;

  beforeEach(async () => {
    ({ server, logs } = getTestServerFixture());

    parcelRecipient = {
      id: server.activeEndpoint.id,
      internetAddress: server.activeEndpoint.internetAddress,
    };
    const { keyId, publicKey: privateKey } =
      await server.activeEndpoint.retrieveInitialSessionPublicKey();
    const serializedPublicKey = await derSerializePublicKey(privateKey);
    sessionKey = { keyId, publicKey: await derDeserializeECDHPublicKey(serializedPublicKey) };
  });

  test('Valid parcel should be accepted', async () => {
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      sessionKey,
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
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
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      subDays(new Date(), 1),
      sessionKey,
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
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

  test('Invalid service message should be ignored', async () => {
    const { parcelSerialized } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      { ...sessionKey, keyId: Buffer.from('invalid key id') },
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
    expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring invalid service message'));
  });

  test('Non-PDA service message should be published as a CloudEvent', async () => {
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      sessionKey,
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
    );

    await server.inject({ ...validRequestOptions, payload: parcelSerialized });

    const events = getEmittedEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject<Partial<CloudEvent>>({
      time: parcel.creationDate.toISOString(),
      expiry: parcel.expiryDate.toISOString(),
      id: parcel.id,
      source: await parcel.senderCertificate.calculateSubjectId(),
      subject: parcel.recipient.id,
      datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
      // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
      data_base64: SERVICE_MESSAGE_CONTENT.toString('base64'),
    });
  });

  describe('Incoming PDA', () => {
    const pdaContentType = 'application/vnd+relaycorp.awala.pda-path';

    test('Valid PDA should be stored', async () => {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        pdaPath,
      );
      const { parcelSerialized } = await generateParcel(
        parcelRecipient,
        KEY_PAIR_SET,
        new Date(),
        sessionKey,
        pdaContentType,
        Buffer.from(await peerConnectionParams.serialize()),
      );
      const spyOnSaveChannel = jest.spyOn(server.activeEndpoint, 'saveChannel');

      const response = await server.inject({
        ...validRequestOptions,
        payload: parcelSerialized,
      });

      expect(spyOnSaveChannel).toHaveBeenCalledOnceWith(
        expect.objectContaining({
          internetGatewayAddress: peerConnectionParams.internetGatewayAddress,
        }),
        server.mongoose,
      );
      expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
      expect(logs).toContainEqual(partialPinoLog('info', 'Peer connection params stored'));
    });

    test('Invalid connection params should be accepted but not stored', async () => {
      const certificatePath = await generatePDACertificationPath(PEER_KEY_PAIR);
      const invalidPdaGrantee = certificatePath.privateGateway;
      const invalidPda = new CertificationPath(invalidPdaGrantee, []);
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        invalidPda,
      );
      const { parcelSerialized } = await generateParcel(
        parcelRecipient,
        KEY_PAIR_SET,
        new Date(),
        sessionKey,
        pdaContentType,
        Buffer.from(await peerConnectionParams.serialize()),
      );
      const spyOnSaveChannel = jest.spyOn(server.activeEndpoint, 'saveChannel');

      const response = await server.inject({
        ...validRequestOptions,
        payload: parcelSerialized,
      });

      expect(spyOnSaveChannel).toHaveBeenCalledOnceWith(
        expect.objectContaining({
          internetGatewayAddress: peerConnectionParams.internetGatewayAddress,
        }),
        server.mongoose,
      );
      expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
      expect(logs).toContainEqual(
        partialPinoLog('info', 'Refusing to store invalid peer connection params'),
      );
    });

    test('Malformed connection params should be accepted but not stored', async () => {
      const { parcelSerialized } = await generateParcel(
        parcelRecipient,
        KEY_PAIR_SET,
        new Date(),
        sessionKey,
        pdaContentType,
        Buffer.from('Malformed PDA'),
      );
      const spyOnSaveChannel = jest.spyOn(server.activeEndpoint, 'saveChannel');

      const response = await server.inject({
        ...validRequestOptions,
        payload: parcelSerialized,
      });

      expect(spyOnSaveChannel).not.toHaveBeenCalled();
      expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
      expect(logs).toContainEqual(
        partialPinoLog('info', 'Refusing to store malformed peer connection params'),
      );
    });
  });
});
