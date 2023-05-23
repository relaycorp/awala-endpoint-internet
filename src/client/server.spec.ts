import type { FastifyInstance } from 'fastify';
import { CloudEvent } from 'cloudevents';
import { jest } from '@jest/globals';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import { CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { postEvent } from '../testUtils/eventing/cloudEvents.js';
import { AxiosResponse } from 'axios';
import { DeliveryOptions } from '@relaycorp/relaynet-pohttp/build/main/lib/client';
import { mockSpy } from '../testUtils/jest';
import { MockLogSet, partialPinoLog } from '../testUtils/logging';
import { getModelForClass } from '@typegoose/typegoose';
import { PeerEndpoint } from '../models/PeerEndpoint.model';
import { KEY_PAIR_SET, PEER_ADDRESS, PEER_KEY_PAIR } from '../testUtils/awala/stubs';
import { Connection } from 'mongoose';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { CertificationPath, PrivateEndpointConnParams } from '@relaycorp/relaynet-core';



const mockDeliverParcel = mockSpy(jest.fn<() => Promise<(recipientInternetAddressOrURL: string, parcelSerialized: ArrayBuffer | Buffer, options?: Partial<DeliveryOptions>) => Promise<AxiosResponse>>>());
jest.unstable_mockModule('@relaycorp/relaynet-pohttp', () => ({
  deliverParcel: mockDeliverParcel
}));

const { setUpTestPohttpClient } = await import('../testUtils/pohttpClient.js');


const CLOUD_EVENT_DATA =  {
  id: CE_ID,
  source: CE_SOURCE,
  type: 'testType',
  subject: 'peerId',
  datacontenttype: 'test/content-type',
  time: '2023-05-23T07:13:39.871Z',
  expiry: '2023-05-24T07:13:39.871Z',
  data: "asd",
};
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
    test('Missing subject should resolve into bad request', async () => {
      const { subject, ...eventData } = CLOUD_EVENT_DATA;
      const event = new CloudEvent(eventData);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to missing subject'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing datacontenttype should resolve into bad request', async () => {
      const { datacontenttype, ...eventData } = CLOUD_EVENT_DATA;
      const event = new CloudEvent(eventData);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to missing data content type'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing expiry should resolve into bad request', async () => {
      const { expiry, ...eventData } = CLOUD_EVENT_DATA;
      const event = new CloudEvent(eventData);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to missing expiry'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Malformed expiry should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        expiry: 'invalid Date'
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to malformed expiry'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Missing data should resolve into bad request', async () => {
      const { data, ...eventData } = CLOUD_EVENT_DATA;
      const event = new CloudEvent(eventData);

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to missing data'),
      );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
    });

    test('Malformed data should resolve into bad request', async () => {
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        data: 1
      });

      const response = await postEvent(event, server);

      expect(logs).toContainEqual(
        partialPinoLog('info', 'Ignoring event due to invalid data'),
      );
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

    test('Parcel should be send', async () => {
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
      const privateEndpointChannel = await server.activeEndpoint.saveChannel(
        peerConnectionParams,
        dbConnection
      );
      const event = new CloudEvent({
        ...CLOUD_EVENT_DATA,
        subject: privateEndpointChannel.peer.id
      });


      const response = await postEvent(event, server);

      // expect(logs).toContainEqual(
      //   partialPinoLog('info', 'Parcel sent', {eventId: CLOUD_EVENT_DATA.id}),
      // );
      expect(response.statusCode).toBe(HTTP_STATUS_CODES.ACCEPTED);
    });
  });

  })
});



