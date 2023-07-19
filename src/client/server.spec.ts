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
import { CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';
import { mockSpy } from '../testUtils/jest.js';
import { type MockLogSet, partialPinoLog } from '../testUtils/logging.js';
import { PeerEndpoint } from '../models/PeerEndpoint.model.js';
import {
  KEY_PAIR_SET,
  PEER_ADDRESS,
  PEER_ID,
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

  describe('GET', () => {
    test('Response should be 200 OK', async () => {
      const response = await server.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.OK);
      expect(response.body).toBe('It works');
    });
  });

  describe('POST', () => {
    const expiry = addDays(Date.now(), 5);
    const cloudEventData = {
      id: CE_ID,
      source: CE_SOURCE,
      type: OUTGOING_SERVICE_MESSAGE_TYPE,
      subject: PEER_ID,
      datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
      expiry: formatISO(expiry),
      data: SERVICE_MESSAGE_CONTENT.toString('base64'),
    };
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
        ...cloudEventData,
        subject: privateEndpointChannel.peer.id,
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
        expect(parcel.id).toBe(cloudEventData.id);
      });

      test('Encapsulated service message should be event data', () => {
        const serviceMessage = new ServiceMessage(
          cloudEventData.datacontenttype,
          Buffer.from(cloudEventData.data),
        );

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

        expect(mockDeliverParcel).toHaveBeenCalledOnceWith(
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

        expect(mockDeliverParcel).toHaveBeenCalledOnceWith(
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

        expect(mockDeliverParcel).toHaveBeenCalledOnceWith(
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

    test('Unknown peer should resolve into service unavailable', async () => {
      const cloudEvent = new CloudEvent(cloudEventData);

      const response = await postEvent(cloudEvent, server);

      expect(logs).toContainEqual(partialPinoLog('warn', 'Could not find channel with peer'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    test('Failure to get channel should resolve into internal server error', async () => {
      const cloudEvent = new CloudEvent(cloudEventData);
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: cloudEventData.subject,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const response = await postEvent(cloudEvent, server);

      expect(logs).toContainEqual(
        partialPinoLog('error', `Could not find channel for peer ${PEER_ID}`),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
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
