import { CloudEvent } from 'cloudevents';

export const INCOMING_SERVICE_MESSAGE_TYPE =
  'com.relaycorp.awala.endpoint-internet.incoming-service-message';

export interface IncomingServiceMessageOptions {
  readonly creationDate: Date;
  readonly expiryDate: Date;
  readonly parcelId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly contentType: string;
  readonly content: Buffer;
}

export function makeIncomingServiceMessageEvent(
  options: IncomingServiceMessageOptions,
): CloudEvent<Buffer> {
  return new CloudEvent({
    type: INCOMING_SERVICE_MESSAGE_TYPE,
    id: options.parcelId,
    source: options.senderId,
    subject: options.recipientId,
    datacontenttype: options.contentType,
    data: options.content,
    time: options.creationDate.toISOString(),
    expiry: options.expiryDate.toISOString(),
  });
}
