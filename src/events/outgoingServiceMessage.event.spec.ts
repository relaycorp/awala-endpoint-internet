import { CloudEvent } from 'cloudevents';
import { addDays, differenceInSeconds, formatISO, subDays } from 'date-fns';

import { CE_CONTENT_TYPE, CE_DATA_BASE64, CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { makeMockLogging, partialPinoLog } from '../testUtils/logging.js';
import { assertNotNull, assertNull } from '../testUtils/assertions.js';
import { PEER_ID } from '../testUtils/awala/stubs.js';

import {
  getOutgoingServiceMessageOptions,
  OUTGOING_SERVICE_MESSAGE_TYPE,
  type OutgoingServiceMessageOptions,
} from './outgoingServiceMessage.event.js';

describe('getOutgoingServiceMessageOptions', () => {
  const mockLogging = makeMockLogging();
  const creationDate = new Date();
  const expiry = addDays(creationDate, 5);
  const cloudEventData = new CloudEvent({
    specversion: '1.0',
    id: CE_ID,
    source: CE_SOURCE,
    type: OUTGOING_SERVICE_MESSAGE_TYPE,
    subject: PEER_ID,
    datacontenttype: CE_CONTENT_TYPE,
    expiry: formatISO(expiry),
    time: formatISO(creationDate),
    // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
    data_base64: CE_DATA_BASE64,
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

    test('Content should be a buffer with the content of data_base64', () => {
      const { content } = outgoingServiceMessageOptions;

      expect(content).toStrictEqual(Buffer.from(CE_DATA_BASE64, 'base64'));
    });

    test('Missing data_base64 should be accepted', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
        data_base64: undefined,
        data: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      expect(result?.content).toStrictEqual(Buffer.from('', 'base64'));
    });

    test('Creation date should be taken from event time', () => {
      const { creationDate: creation } = outgoingServiceMessageOptions;

      expect(creation).toStrictEqual(new Date(cloudEventData.time!));
    });

    test('TTL should be computed from event creation and expiry', () => {
      const { ttl } = outgoingServiceMessageOptions;

      const difference = differenceInSeconds(expiry, creationDate);
      expect(ttl).toBe(difference);
    });
  });

  describe('Failure', () => {
    test('Invalid type should be refused', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        type: 'INVALID',
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('error', 'Refused invalid type', { parcelId: event.id, type: event.type }),
      );
    });

    test('Missing subject should be refused', () => {
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

    test('Missing datacontenttype should be refused', () => {
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

    test('Missing expiry should be refused', () => {
      const { expiry: ignore, ...eventData } = cloudEventData;
      const event = new CloudEvent(eventData);

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing expiry', { parcelId: event.id }),
      );
    });

    test('Non string expiry should be refused', () => {
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

    test('Malformed expiry should be refused', () => {
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

    test('Expiry less than time should be refused', () => {
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

    test('Missing data should be refused', () => {
      const event = new CloudEvent({
        ...cloudEventData,
        // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
        data_base64: undefined,
        data: undefined,
      });

      const result = getOutgoingServiceMessageOptions(
        { ...event, data: Buffer.from('') },
        mockLogging.logger,
      );

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Got textual data instead of binary', { parcelId: event.id }),
      );
    });
  });
});
