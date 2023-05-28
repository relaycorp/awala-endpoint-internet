import { type CloudEventV1, CloudEvent } from 'cloudevents';
import { addDays, differenceInSeconds, formatISO, subDays } from 'date-fns';

import { CE_CONTENT_TYPE, CE_DATA, CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { makeMockLogging, partialPinoLog } from '../testUtils/logging.js';
import { assertNotNull, assertNull } from '../testUtils/assertions.js';
import { PEER_ID } from '../testUtils/awala/stubs.js';

import {
  getOutgoingServiceMessageOptions,
  type OutgoingServiceMessageOptions,
} from './outgoingServiceMessage.event.js';

describe('getOutgoingServiceMessageOptions', () => {
  const mockLogging = makeMockLogging();
  const creationDate = new Date();
  const expiry = addDays(creationDate, 5);
  const cloudEventData: CloudEventV1<unknown> = new CloudEvent({
    specversion: '1.0',
    id: CE_ID,
    source: CE_SOURCE,
    type: 'testType',
    subject: PEER_ID,
    datacontenttype: CE_CONTENT_TYPE,
    expiry: formatISO(expiry),
    time: formatISO(creationDate),
    // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
    data_base64: CE_DATA,
  });

  describe('Success', () => {
    let outgoingServiceMessageOptions: OutgoingServiceMessageOptions;
    beforeEach(() => {
      const result = getOutgoingServiceMessageOptions(cloudEventData, mockLogging.logger);
      assertNotNull(result);
      outgoingServiceMessageOptions = result;
    });

    test('Parcel id should be the same as event id', () => {
      const { parcelId } = outgoingServiceMessageOptions;

      expect(parcelId).toBe(cloudEventData.id);
    });

    test('Peer id should be the same as subject', () => {
      const { peerId } = outgoingServiceMessageOptions;

      expect(peerId).toBe(cloudEventData.subject);
    });

    test('Content type should be the same as datacontenttype', () => {
      const { contentType } = outgoingServiceMessageOptions;

      expect(contentType).toBe(cloudEventData.datacontenttype);
    });

    test('content should be a buffer with the content of data_base64', () => {
      const { content } = outgoingServiceMessageOptions;

      expect(content).toStrictEqual(Buffer.from(CE_DATA, 'base64'));
    });

    test('Creation date should be correct', () => {
      const { creationDate: creation } = outgoingServiceMessageOptions;

      expect(creation).toStrictEqual(new Date(cloudEventData.time!));
    });

    test('TTL should be correct', () => {
      const difference = differenceInSeconds(expiry, creationDate);

      const { ttl } = outgoingServiceMessageOptions;

      expect(ttl).toBe(difference);
    });
  });

  describe('Failure', () => {
    test('Missing subject should return null', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        subject: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing subject', { parcelId: event.id }),
      );
    });

    test('Missing datacontenttype should throw an error', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        datacontenttype: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing data content type', { parcelId: event.id }),
      );
    });

    test('Missing expiry should return null', () => {
      const { expiry: ignore, ...eventData } = cloudEventData;
      const event = new CloudEvent(eventData);

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing expiry', { parcelId: event.id }),
      );
    });

    test('Non string expiry should return null', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        expiry: {},
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused malformed expiry', { parcelId: event.id }),
      );
    });

    test('Malformed expiry should return null', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        expiry: 'INVALID DATE',
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused malformed expiry', { parcelId: event.id }),
      );
    });

    test('Expiry less than time should return null', () => {
      const time = new Date();
      const past = subDays(time, 10);
      const event = new CloudEvent({
        ...cloudEventData,
        expiry: past.toISOString(),
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused expiry less than time', { parcelId: event.id }),
      );
    });

    test('Missing data should return null', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
        data_base64: undefined,
        data: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing data', { parcelId: event.id }),
      );
    });
  });
});
