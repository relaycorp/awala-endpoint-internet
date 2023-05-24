import { jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
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
import { addDays, formatISO, subDays } from 'date-fns';

import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';
import { mockSpy } from '../testUtils/jest.js';
import { type MockLogSet, partialPinoLog } from '../testUtils/logging.js';
import { PeerEndpoint } from '../models/PeerEndpoint.model.js';
import { KEY_PAIR_SET, PEER_ADDRESS, PEER_KEY_PAIR } from '../testUtils/awala/stubs.js';
import { InternetPrivateEndpointChannel } from '../utilities/awala/InternetPrivateEndpointChannel.js';

const mockDeliverParcel = mockSpy(
  jest.fn<
    (
      recipientInternetAddressOrURL: string,
      parcelSerialized: ArrayBuffer | Buffer,
      options?: Partial<DeliveryOptions> | undefined,
    ) => Promise<void>
  >(),
);
jest.unstable_mockModule('@relaycorp/relaynet-pohttp', () => ({
  deliverParcel: mockDeliverParcel,
}));

const { setUpTestPohttpClient } = await import('../testUtils/pohttpClient.js');

const CLOUD_EVENT_DATA = {
  id: CE_ID,
  source: CE_SOURCE,
  type: 'testType',
  subject: 'peerId',
  datacontenttype: 'test/content-type',
  time: formatISO(Date.now()),
  expiry: formatISO(addDays(Date.now(), 1)),
  data: 'test data',
};


describe('makePohttpClient', () => {
  const getTestServerFixture = setUpTestPohttpClient();
  let server: FastifyInstance;
  let logs: MockLogSet;
  let dbConnection: Connection;
  let sessionPrivateKey: CryptoKey;
  let privateEndpointChannel: InternetPrivateEndpointChannel;
  beforeEach(async() => {
    ({ server, logs, dbConnection } = getTestServerFixture());
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
    privateEndpointChannel = await server.activeEndpoint.saveChannel(
      peerConnectionParams,
      dbConnection,
    );
  });

  beforeAll(async() => {
    jest.resetModules();
  });

  describe('GET', () => {
    test('Response should be 200 OK', async () => {
      const response = await server.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.OK);
      expect(response.body).toBe('It works');
    });
  });

  describe('POST', () => {
    test('Parcel should be sent', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        subject: privateEndpointChannel.peer.id,
      });

      const response = await postEvent(event, server);

      const serviceMessage = new ServiceMessage(
        CLOUD_EVENT_DATA.datacontenttype,
        Buffer.from(CLOUD_EVENT_DATA.data),
      );

      const [[, parcelBuffer]] = mockDeliverParcel.mock.calls;
      const parcel = await Parcel.deserialize(parcelBuffer);
      const { payload } = await parcel.unwrapPayload(sessionPrivateKey);
      expect(
        Buffer.from(payload.serialize()).equals(Buffer.from(serviceMessage.serialize())),
      ).toBeTrue();
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.NO_CONTENT);
    });

    test('Missing subject should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        subject: undefined,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to missing subject'));
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

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing datacontenttype should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        datacontenttype: undefined,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to missing data content type'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing expiry should resolve into bad request', async () => {
      const eventData: { [key: string]: unknown } = { ...CLOUD_EVENT_DATA };
      delete eventData.expiry;
      const event = new CloudEvent(eventData);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to missing expiry'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Non string expiry should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        expiry: {},
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to malformed expiry'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Malformed expiry should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        expiry: 'invalid Date',
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to malformed expiry'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Expiry less than time should resolve into bad request', async () => {
      const past = subDays(new Date(CLOUD_EVENT_DATA.time), 10);
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        expiry: past,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring expiry less than time'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing data should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        data: undefined,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to missing data'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Malformed data should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        data: 1,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(partialPinoLog('info', 'Ignoring event due to invalid data'));
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Non existing gateway db entry should resolve into service unavailable', async () => {
      const event = new CloudEvent(CLOUD_EVENT_DATA);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Ignoring event due to not having a an peer endpoint db'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    test('Non existing saved channel should resolve into service unavailable', async () => {
      const event = new CloudEvent(CLOUD_EVENT_DATA);
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: CLOUD_EVENT_DATA.subject,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Ignoring event due to not having a registered private endpoint'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });

    test('Non existing saved channel should resolve into service unavailable', async () => {
      const event = new CloudEvent(CLOUD_EVENT_DATA);
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: CLOUD_EVENT_DATA.subject,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('warn', 'Ignoring event due to not having a registered private endpoint'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE);
    });
  });
});
