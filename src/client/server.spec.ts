import { jest } from '@jest/globals';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { CloudEvent } from 'cloudevents';
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

const { setUpTestPohttpClient } = await import('../testUtils/pohttpClient.js');

describe('makePohttpClient', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;
  let logs: MockLogSet;
  let dbConnection: Connection;

  beforeEach(() => {
    ({ server, logs, dbConnection } = getTestServerFixture());
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
      type: 'testType',
      subject: PEER_ID,
      datacontenttype: SERVICE_MESSAGE_CONTENT_TYPE,
      expiry: formatISO(expiry),
      data: SERVICE_MESSAGE_CONTENT.toString('base64'),
    };
    let sessionPrivateKey: CryptoKey;
    const tenSeconds: number = 10 * 1000;
    let event: CloudEvent<string>;

    beforeEach(async () => {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      const { sessionKey, privateKey } = await SessionKeyPair.generate();
      sessionPrivateKey = privateKey;
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
        ({ payload } = await parcel.unwrapPayload(sessionPrivateKey));
      });

      test('Successful result should be log', () => {
        expect(logs).toContainEqual(partialPinoLog('info', 'Parcel delivered'));
      });

      test('Should resolve into no content status', () => {
        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Parcel should have the correct id', () => {
        expect(parcel.id).toBe(cloudEventData.id);
      });

      test('Parcel payload should be a valid message', () => {
        const serviceMessage = new ServiceMessage(
          cloudEventData.datacontenttype,
          Buffer.from(cloudEventData.data),
        );

        expect(
          Buffer.from(payload.serialize()).equals(Buffer.from(serviceMessage.serialize())),
        ).toBeTrue();
      });

      test('Parcel should be sent to a valid address', () => {
        expect(internetAddress).toBe(PEER_ADDRESS);
      });

      test('Should set a correct ttl', () => {
        expect(parcel.ttl).toBeGreaterThan(ttl - tenSeconds);
        expect(parcel.ttl).toBeLessThan(ttl + tenSeconds);
      });

      test('Should set correct creation date', () => {
        expect(parcel.creationDate).toBeBetween(
          subSeconds(new Date(time), 20),
          addSeconds(time, 20),
        );
      });
    });

    test('Missing message body should resolve into bad request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/',

        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'content-type': 'application/cloudevents+json',
        },
      });

      expect(logs).toContainEqual(partialPinoLog('info', 'Refused missing data'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Malformed message body should resolve into bad request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/',
        payload: 'INVALID MESSAGE BODY',

        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'content-type': 'application/cloudevents+json',
        },
      });

      expect(logs).toContainEqual(partialPinoLog('info', 'Refused missing data'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Non existing gateway db entry should resolve into service unavailable', async () => {
      const cloudEvent = new CloudEvent(cloudEventData);

      const response = await postEvent(cloudEvent, server);

      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Ignoring event due to not having a an peer endpoint in the db'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    test('Problem constructing chanel should resolve into internal server error', async () => {
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
        partialPinoLog('error', `Failed to construct a channel for peerId ${PEER_ID}`),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
    });

    describe('Parcel Delivery error handling', () => {
      test('Invalid parcel error should be logged', async () => {
        const errorMessage = 'INVALID PARCEL ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPInvalidParcelError(errorMessage);
        });

        await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('info', 'Delivery failed due to server refusing parcel', {
            err: expect.objectContaining({
              message: errorMessage,
            }),
          }),
        );
      });

      test('Invalid parcel error should resolve into no content status', async () => {
        const errorMessage = 'INVALID PARCEL ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPInvalidParcelError(errorMessage);
        });

        const response = await postEvent(event, server);

        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Client binding parcel error should be logged', async () => {
        const errorMessage = 'CLIENT BINDING ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPClientBindingError(errorMessage);
        });

        await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('info', 'Delivery failed due to server binding', {
            err: expect.objectContaining({
              message: errorMessage,
            }),
          }),
        );
      });

      test('Client binding parcel error should resolve into no content status', async () => {
        const errorMessage = 'CLIENT BINDING ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new PoHTTPClientBindingError(errorMessage);
        });

        const response = await postEvent(event, server);

        expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
      });

      test('Unexpected error should resolve into bad gateway status', async () => {
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new Error('ERROR');
        });

        const response = await postEvent(event, server);

        expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_GATEWAY);
      });

      test('Unexpected error should be logged', async () => {
        const errorMessage = 'UNEXPECTED ERROR ERROR';
        mockDeliverParcel.mockImplementationOnce(() => {
          throw new Error(errorMessage);
        });

        await postEvent(event, server);

        expect(logs).toContainEqual(
          partialPinoLog('warn', 'Failed to deliver parcel', {
            err: expect.objectContaining({
              message: errorMessage,
            }),
          }),
        );
      });
    });
  });
});
