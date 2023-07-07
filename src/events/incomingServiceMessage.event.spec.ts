import { randomUUID } from 'node:crypto';

import { addMinutes } from 'date-fns';

import {
  ENDPOINT_ID,
  PEER_ID,
  SERVICE_MESSAGE_CONTENT,
  SERVICE_MESSAGE_CONTENT_TYPE,
} from '../testUtils/awala/stubs.js';

import {
  type IncomingServiceMessageOptions,
  makeIncomingServiceMessageEvent,
} from './incomingServiceMessage.event.js';

describe('makeIncomingServiceMessageEvent', () => {
  const options: IncomingServiceMessageOptions = {
    creationDate: new Date(),
    expiryDate: addMinutes(new Date(), 5),
    parcelId: randomUUID(),
    senderId: PEER_ID,
    recipientId: ENDPOINT_ID,
    contentType: SERVICE_MESSAGE_CONTENT_TYPE,
    content: SERVICE_MESSAGE_CONTENT,
  };

  test('Event spec version should be 1.0', () => {
    const { specversion: version } = makeIncomingServiceMessageEvent(options);

    expect(version).toBe('1.0');
  });

  test('Event id should be the parcel id', () => {
    const { id } = makeIncomingServiceMessageEvent(options);

    expect(id).toBe(options.parcelId);
  });

  test('Event type should be incoming-service-message', () => {
    const { type } = makeIncomingServiceMessageEvent(options);

    expect(type).toBe('com.relaycorp.awala.endpoint-internet.incoming-service-message');
  });

  test('Event source should be the sender id', () => {
    const { source } = makeIncomingServiceMessageEvent(options);

    expect(source).toBe(options.senderId);
  });

  test('Event subject should be the recipient id', () => {
    const { subject } = makeIncomingServiceMessageEvent(options);

    expect(subject).toBe(options.recipientId);
  });

  test('Event data content type should be that of the service message', () => {
    const { datacontenttype: contentType } = makeIncomingServiceMessageEvent(options);

    expect(contentType).toBe(options.contentType);
  });

  test('Event data should be the service message content', () => {
    const { data } = makeIncomingServiceMessageEvent(options);

    expect(data).toMatchObject(options.content);
  });

  test('Event time should be parcel creation time', () => {
    const { time } = makeIncomingServiceMessageEvent(options);

    expect(time).toBe(options.creationDate.toISOString());
  });

  test('Event expiry should be parcel expiry time', () => {
    const { expiry } = makeIncomingServiceMessageEvent(options);

    expect(expiry).toBe(options.expiryDate.toISOString());
  });

  test('Event should be valid', () => {
    const event = makeIncomingServiceMessageEvent(options);

    expect(event.validate()).toBeTrue();
  });
});
