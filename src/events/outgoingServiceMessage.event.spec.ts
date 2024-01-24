import { CloudEvent } from 'cloudevents';
import { addDays, differenceInSeconds, formatISO, subDays, subHours } from 'date-fns';

import { CE_CONTENT_TYPE, CE_DATA, CE_ID, CE_SOURCE } from '../testUtils/eventing/stubs.js';
import { makeMockLogging, partialPinoLog } from '../testUtils/logging.js';
import { assertNotNull, assertNull } from '../testUtils/assertions.js';
import { PEER_ID } from '../testUtils/awala/stubs.js';

import {
  CLOCK_DRIFT_TOLERANCE_HOURS,
  getOutgoingServiceMessageOptions,
  OUTGOING_SERVICE_MESSAGE_TYPE,
  type OutgoingServiceMessageOptions,
} from './outgoingServiceMessage.event.js';

describe('getOutgoingServiceMessageOptions', () => {
  const mockLogging = makeMockLogging();
  const creationDate = new Date();
  const expiry = addDays(creationDate, 5);
  const cloudEventAttributes = {
    specversion: '1.0',
    id: CE_ID,
    source: CE_SOURCE,
    type: OUTGOING_SERVICE_MESSAGE_TYPE,
    subject: PEER_ID,
    datacontenttype: CE_CONTENT_TYPE,
    expiry: formatISO(expiry),
    time: formatISO(creationDate),
    data: CE_DATA,
  };
  const cloudEvent = new CloudEvent(cloudEventAttributes);

  describe('Success', () => {
    let outgoingServiceMessageOptions: OutgoingServiceMessageOptions;
    beforeEach(() => {
      const result = getOutgoingServiceMessageOptions(cloudEvent, mockLogging.logger);
      assertNotNull(result);
      outgoingServiceMessageOptions = result;
    });

    test('Parcel id should be the same as event id', () => {
      const { parcelId } = outgoingServiceMessageOptions;

      expect(parcelId).toBe(cloudEvent.id);
    });

    test('Peer id should be the same as subject', () => {
      const { peerId } = outgoingServiceMessageOptions;

      expect(peerId).toBe(cloudEvent.subject);
    });

    test('Content type should be the same as datacontenttype', () => {
      const { contentType } = outgoingServiceMessageOptions;

      expect(contentType).toBe(cloudEvent.datacontenttype);
    });

    test('Content should be a buffer with the content of data', () => {
      const { content } = outgoingServiceMessageOptions;

      expect(content).toStrictEqual(CE_DATA);
    });

    test('Empty data should be accepted', () => {
      const event = cloudEvent.cloneWith({
        // eslint-disable-next-line @typescript-eslint/naming-convention,camelcase
        data_base64: undefined,
        data: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      expect(result?.content).toStrictEqual(Buffer.from(''));
    });

    test('Creation date should allow for clock drift tolerance', () => {
      const { creationDate: creation } = outgoingServiceMessageOptions;

      const expectedCreationDate = subHours(
        new Date(cloudEvent.time!),
        CLOCK_DRIFT_TOLERANCE_HOURS,
      );
      expect(creation).toStrictEqual(expectedCreationDate);
    });

    describe('TTL', () => {
      test('TTL should be computed from event creation and expiry', () => {
        const { ttl } = outgoingServiceMessageOptions;

        const difference = differenceInSeconds(expiry, creationDate);
        expect(ttl).toBe(difference);
      });

      test('TTL should default to 6 months', () => {
        const attrs = Object.fromEntries(
          Object.entries(cloudEventAttributes).filter(([key]) => key !== 'expiry'),
        );
        const event = new CloudEvent(attrs);

        const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

        const secondsInMonths = 2_629_746;
        expect(result?.ttl).toBe(secondsInMonths * 6);
      });
    });
  });

  describe('Failure', () => {
    test('Invalid type should be refused', () => {
      const event = new CloudEvent({
        ...cloudEvent,
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
        ...cloudEvent,
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
        ...cloudEvent,
        datacontenttype: undefined,
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused missing data content type', { parcelId: event.id }),
      );
    });

    test('Non string expiry should be refused', () => {
      const event = new CloudEvent({
        ...cloudEvent,
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
        ...cloudEvent,
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
        ...cloudEvent,
        expiry: past.toISOString(),
      });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused expiry less than time', { parcelId: event.id }),
      );
    });

    test('Non-buffer data should be refused', () => {
      const event = cloudEvent.cloneWith({ data: { foo: 'bar' } });

      const result = getOutgoingServiceMessageOptions(event, mockLogging.logger);

      assertNull(result);
      expect(mockLogging.logs).toContainEqual(
        partialPinoLog('info', 'Refused non-buffer service message content', {
          parcelId: event.id,
        }),
      );
    });
  });
});
