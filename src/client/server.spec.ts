import { jest } from '@jest/globals';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { CloudEvent, HTTP } from 'cloudevents';
import type { DeliveryOptions } from '@relaycorp/relaynet-pohttp/build/main/lib/client.js';
import { getModelForClass } from '@typegoose/typegoose';
import type { Connection } from 'mongoose';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import {
  CertificationPath,
  Parcel,
  PrivateEndpointConnParams,
  ServiceMessage,
  SessionKeyPair,
} from '@relaycorp/relaynet-core';
import { addDays, addSeconds, differenceInSeconds, formatISO, subSeconds } from 'date-fns';
import envVar from 'env-var';

import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { CE_ID } from '../testUtils/eventing/stubs.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';
import { mockSpy } from '../testUtils/jest.js';
import { type MockLogSet, partialPinoLog } from '../testUtils/logging.js';
import { PeerEndpoint } from '../models/PeerEndpoint.model.js';
import {
  KEY_PAIR_SET,
  PEER_ADDRESS,
  PEER_KEY_PAIR,
  SERVICE_MESSAGE_CONTENT,
  SERVICE_MESSAGE_CONTENT_TYPE,
} from '../testUtils/awala/stubs.js';
import type { EnvVarMocker } from '../testUtils/envVars.js';
import { OUTGOING_SERVICE_MESSAGE_TYPE } from '../events/outgoingServiceMessage.event.js';

const mockDeliverParcel = mockSpy(
  jest.fn<
    (
      recipientInternetAddressOrURL: string,
      parcelSerialized: ArrayBuffer | Buffer,
      options?: Partial<DeliveryOptions>,
    ) => Promise<void>
  >(),
);

// eslint-disable-next-line @typescript-eslint/naming-convention
class PoHTTPInvalidParcelError extends Error {}

// eslint-disable-next-line @typescript-eslint/naming-convention
class PoHTTPClientBindingError extends Error {}

jest.unstable_mockModule('@relaycorp/relaynet-pohttp', () => ({
  deliverParcel: mockDeliverParcel,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  PoHTTPInvalidParcelError,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  PoHTTPClientBindingError,
}));

const { setUpTestPohttpClient, POHTTP_CLIENT_REQUIRED_ENV_VARS } = await import(
  '../testUtils/pohttpClient.js'
);
const { makePohttpClientPlugin } = await import('./server.js');

describe('makePohttpClient', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;
  let logs: MockLogSet;
  let dbConnection: Connection;
  let envVarMocker: EnvVarMocker;
  let recreateServer: () => Promise<FastifyInstance>;

  beforeEach(() => {
    ({ server, logs, dbConnection, envVarMocker, recreateServer } = getTestServerFixture());
  });

  describe('makePohttpClientPlugin', () => {
    const mockFastify: FastifyInstance = {
      addContentTypeParser: jest.fn(),
      removeAllContentTypeParsers: jest.fn(),
      register: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
    } as any;

    test('Malformed POHTTP_TLS_REQUIRED should be refused', async () => {
      envVarMocker({
        POHTTP_TLS_REQUIRED: 'INVALID_POHTTP_TLS_REQUIRED',
      });

      await expect(makePohttpClientPlugin(mockFastify)).rejects.toThrowWithMessage(
        envVar.EnvVarError,
        /POHTTP_TLS_REQUIRED/u,
      );
    });

    test('Missing POHTTP_TLS_REQUIRED should be allowed', async () => {
      envVarMocker({
        POHTTP_TLS_REQUIRED: undefined,
      });

      await expect(makePohttpClientPlugin(mockFastify)).toResolve();
    });

    test('Missing CE_TRANSPORT should be allowed', async () => {
      envVarMocker({
        CE_TRANSPORT: undefined,
      });

      await expect(makePohttpClientPlugin(mockFastify)).toResolve();
    });
  });

  describe('POST', () => {
    const expiry = addDays(Date.now(), 5);
    let peerSessionPrivateKey: CryptoKey;
    const tenSecondsInMilliseconds: number = 10 * 1000;
    let event: CloudEvent<string>;

    const parcelDeliveryLog = partialPinoLog('info', 'Parcel delivered');

    beforeEach(async () => {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      const { sessionKey, privateKey } = await SessionKeyPair.generate();
      peerSessionPrivateKey = privateKey;
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        pdaPath,
        sessionKey,
      );
      const privateEndpointChannel = await server.activeEndpoint.saveChannel(
        peerConnectionParams,
        dbConnection,
      );
      event = new CloudEvent({
        id: CE_ID,
        source: server.activeEndpoint.id,
        subject: privateEndpointChannel.peer.id,
        type: OUTGOING_SERVICE_MESSAGE_TYPE,
        datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
        expiry: formatISO(expiry),
        data: SERVICE_MESSAGE_CONTENT.toString('base64'),
      });
    });

    describe('Successful delivery', () => {
      let response: LightMyRequestResponse;
      let internetAddress: string;
      let parcelBuffer: ArrayBuffer | Buffer;
      let payload: ServiceMessage;
      let parcel: Parcel;
      let ttl: number;
      let time: Date;

      beforeEach(async () => {
        time = new Date();
        ttl = differenceInSeconds(expiry, time);
        response = await postEvent(event, server);

        [[internetAddress, parcelBuffer]] = mockDeliverParcel.mock.calls;
        parcel = await Parcel.deserialize(parcelBuffer);
        ({ payload } = await parcel.unwrapPayload(peerSessionPrivateKey));
      });

      test('Successful result should be logged', () => {
        expect(logs).toContainEqual(parcelDeliveryLog);
      });

      test('Should resolve into no content status', () => {
        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Parcel should have id set from event id', () => {
        expect(parcel.id).toBe(event.id);
      });

      test('Encapsulated service message should be event data', () => {
        const serviceMessage = new ServiceMessage(event.datacontenttype!, Buffer.from(event.data!));

        expect(
          Buffer.from(payload.serialize()).equals(Buffer.from(serviceMessage.serialize())),
        ).toBeTrue();
      });

      test('Parcel should be sent to the peer Internet address', () => {
        expect(internetAddress).toBe(PEER_ADDRESS);
      });

      test('Parcel TTL should be seconds between event time and expiry', () => {
        expect(parcel.ttl).toBeGreaterThan(ttl - tenSecondsInMilliseconds);
        expect(parcel.ttl).toBeLessThan(ttl + tenSecondsInMilliseconds);
      });

      test('Parcel creation should be event time', () => {
        expect(parcel.creationDate).toBeBetween(
          subSeconds(new Date(time), 20),
          addSeconds(time, 20),
        );
      });
    });

    describe('TLS enablement', () => {
      test('TLS should be disabled if POHTTP_TLS_REQUIRED is false', async () => {
        envVarMocker({ ...POHTTP_CLIENT_REQUIRED_ENV_VARS, POHTTP_TLS_REQUIRED: 'false' });
        const fastifyServer = await recreateServer();

        await postEvent(event, fastifyServer);

        expect(mockDeliverParcel).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            useTls: false,
          }),
        );
      });

      test('TLS should be enabled if POHTTP_TLS_REQUIRED is true', async () => {
        envVarMocker({ ...POHTTP_CLIENT_REQUIRED_ENV_VARS, POHTTP_TLS_REQUIRED: 'true' });
        const fastifyServer = await recreateServer();

        await postEvent(event, fastifyServer);

        expect(mockDeliverParcel).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            useTls: true,
          }),
        );
      });

      test('TLS should be disabled if POHTTP_TLS_REQUIRED is unset', async () => {
        envVarMocker({ ...POHTTP_CLIENT_REQUIRED_ENV_VARS, POHTTP_TLS_REQUIRED: undefined });
        const fastifyServer = await recreateServer();

        await postEvent(event, fastifyServer);

        expect(mockDeliverParcel).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            useTls: true,
          }),
        );
      });
    });

    test('Failure in event data extraction should resolve into bad request', async () => {
      const message = HTTP.binary({
        ...event,
        expiry: 'INVALID_EXPIRY',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/',
        headers: message.headers,
        payload: message.body as string,
      });

      expect(logs).toContainEqual(partialPinoLog('info', 'Refused malformed expiry'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing headers should resolve into bad request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/',
      });

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Unknown sender endpoint id should resolve into bad request', async () => {
      const invalidEvent = event.cloneWith({ source: `not-${event.source}` });

      const response = await postEvent(invalidEvent, server);

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Unknown sender endpoint id', {
          senderId: invalidEvent.source,
          parcelId: invalidEvent.id,
        }),
      );
    });

    test('Using "default" as event source should use active endpoint', async () => {
      const defaultSenderEvent = event.cloneWith({ source: 'default' });

      const response = await postEvent(defaultSenderEvent, server);

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      expect(logs).toContainEqual(parcelDeliveryLog);
    });

    test('Unknown peer should result in service unavailable', async () => {
      const invalidEvent = event.cloneWith({ subject: `not-${event.subject!}` });

      const response = await postEvent(invalidEvent, server);

      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Could not find channel with peer', {
          peerId: invalidEvent.subject,
        }),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    test('Failure to get channel should result in service unavailable', async () => {
      const invalidEvent = event.cloneWith({ subject: `not-${event.subject!}` });
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: invalidEvent.subject,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const response = await postEvent(invalidEvent, server);

      expect(logs).toContainEqual(
        partialPinoLog('error', 'Failed to get channel with peer', {
          parcelId: invalidEvent.id,

          err: expect.objectContaining({
            message: `Could not find channel for peer ${invalidEvent.subject!}`,
          }),
        }),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    describe('Parcel Delivery error handling', () => {
      test('Invalid parcel error should resolve into no content status', async () => {
        const errorMessage = 'INVALID PARCEL ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPInvalidParcelError(errorMessage);
        });

        const response = await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('info', 'Gateway refused parcel as invalid', {
            err: expect.objectContaining({
              message: errorMessage,
            }),

            internetGatewayAddress: PEER_ADDRESS,
          }),
        );
        expect(logs).not.toContainEqual(parcelDeliveryLog);
        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Client binding error should resolve into no content status', async () => {
        const errorMessage = 'CLIENT BINDING ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPClientBindingError(errorMessage);
        });

        const response = await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('info', 'Gateway refused parcel delivery due to binding error', {
            err: expect.objectContaining({
              message: errorMessage,
            }),

            internetGatewayAddress: PEER_ADDRESS,
          }),
        );
        expect(logs).not.toContainEqual(parcelDeliveryLog);
        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Unexpected error should resolve into bad gateway status', async () => {
        const errorMessage = 'UNEXPECTED ERROR ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new Error(errorMessage);
        });

        const response = await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('warn', 'Failed to deliver parcel', {
            err: expect.objectContaining({ message: errorMessage }),
            internetGatewayAddress: PEER_ADDRESS,
          }),
        );
        expect(logs).not.toContainEqual(parcelDeliveryLog);
        expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_GATEWAY);
      });
    });
  });
});
