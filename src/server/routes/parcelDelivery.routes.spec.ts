import { jest } from '@jest/globals';
import type { CloudEvent } from 'cloudevents';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { subDays } from 'date-fns';
import {
  CertificationPath,
  PrivateEndpointConnParams,
  type Recipient,
  type SessionKey,
  SessionKeyPair,
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

const getEmittedEvents = mockEmitter();
configureMockEnvVars(REQUIRED_ENV_VARS);

const { sessionKey: peerSessionKey } = await SessionKeyPair.generate();

describe('Parcel delivery route', () => {
  const getTestServerFixture = makeTestPohttpServer();
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
  let ownSessionKey: SessionKey;

  beforeEach(async () => {
    ({ server, logs } = getTestServerFixture());

    parcelRecipient = {
      id: server.activeEndpoint.id,
      internetAddress: server.activeEndpoint.internetAddress,
    };
    ownSessionKey = await server.activeEndpoint.retrieveInitialSessionKey();
  });

  test('Valid parcel should be accepted', async () => {
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      ownSessionKey,
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
        peerId: await parcel.senderCertificate.calculateSubjectId(),
        contentType: SERVICE_MESSAGE_CONTENT_TYPE,
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
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      subDays(new Date(), 1),
      ownSessionKey,
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
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Refusing invalid parcel', {
        peerId: await parcel.senderCertificate.calculateSubjectId(),
        recipient: parcelRecipient,
        parcelId: parcel.id,
      }),
    );
  });

  test('Invalid service message should be ignored', async () => {
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      { ...ownSessionKey, keyId: Buffer.from('invalid key id') },
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
    );

    const response = await server.inject({
      ...validRequestOptions,
      payload: parcelSerialized,
    });

    expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
    expect(logs).toContainEqual(
      partialPinoLog('info', 'Ignoring invalid service message', {
        parcelId: parcel.id,
        recipient: parcelRecipient,
        peerId: await parcel.senderCertificate.calculateSubjectId(),
      }),
    );
  });

  test('Non-PDA service message should be published as a CloudEvent', async () => {
    const { parcelSerialized, parcel } = await generateParcel(
      parcelRecipient,
      KEY_PAIR_SET,
      new Date(),
      ownSessionKey,
      SERVICE_MESSAGE_CONTENT_TYPE,
      SERVICE_MESSAGE_CONTENT,
    );

    await server.inject({ ...validRequestOptions, payload: parcelSerialized });

    const events = getEmittedEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject<Partial<CloudEvent<Buffer>>>({
      time: parcel.creationDate.toISOString(),
      expiry: parcel.expiryDate.toISOString(),
      id: parcel.id,
      source: await parcel.senderCertificate.calculateSubjectId(),
      subject: parcel.recipient.id,
      datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
      data: SERVICE_MESSAGE_CONTENT,
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
        peerSessionKey,
      );
      const messageContent = Buffer.from(await peerConnectionParams.serialize());
      const { parcelSerialized } = await generateParcel(
        parcelRecipient,
        KEY_PAIR_SET,
        new Date(),
        ownSessionKey,
        pdaContentType,
        messageContent,
      );
      const spyOnSaveChannel = jest.spyOn(server.activeEndpoint, 'saveChannel');

      const response = await server.inject({
        ...validRequestOptions,
        payload: parcelSerialized,
      });

      const [[connectionParams]] = spyOnSaveChannel.mock.calls;
      expect(Buffer.from(await connectionParams.serialize())).toStrictEqual(messageContent);
      expect(response).toHaveProperty('statusCode', HTTP_STATUS_CODES.ACCEPTED);
      expect(logs).toContainEqual(
        partialPinoLog('info', 'Peer connection params stored', {
          authExpiry: certificatePath.pdaGrantee.expiryDate.toISOString(),
        }),
      );
    });

    test('Invalid connection params should be accepted but not stored', async () => {
      const certificatePath = await generatePDACertificationPath(PEER_KEY_PAIR);
      const invalidPdaGrantee = certificatePath.privateGateway;
      const invalidPda = new CertificationPath(invalidPdaGrantee, []);
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        invalidPda,
        peerSessionKey,
      );
      const messageContent = Buffer.from(await peerConnectionParams.serialize());
      const { parcelSerialized } = await generateParcel(
        parcelRecipient,
        KEY_PAIR_SET,
        new Date(),
        ownSessionKey,
        pdaContentType,
        messageContent,
      );
      const spyOnSaveChannel = jest.spyOn(server.activeEndpoint, 'saveChannel');

      const response = await server.inject({
        ...validRequestOptions,
        payload: parcelSerialized,
      });

      const [[connectionParams]] = spyOnSaveChannel.mock.calls;
      expect(Buffer.from(await connectionParams.serialize())).toStrictEqual(messageContent);
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
        ownSessionKey,
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
