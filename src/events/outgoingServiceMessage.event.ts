import type { CloudEventV1 } from 'cloudevents';
import { differenceInSeconds, isValid, parseISO } from 'date-fns';
import type { BaseLogger } from 'pino';
import type { FastifyBaseLogger } from 'fastify';

function getTtl(expiry: unknown, creationDate: Date, logger: BaseLogger) {
  if (expiry === undefined) {
    logger.info('Refused missing expiry');
    return null;
  }

  if (typeof expiry !== 'string') {
    logger.info('Refused malformed expiry');
    return null;
  }

  const expiryDate = parseISO(expiry);

  if (!isValid(expiryDate)) {
    logger.info('Refused malformed expiry');
    return null;
  }

  const difference = differenceInSeconds(expiryDate, creationDate);

  if (difference < 0) {
    logger.info('Refused expiry less than time');
    return null;
  }

  return difference;
}

export interface OutgoingServiceMessageOptions {
  parcelId: string;
  peerId: string;
  contentType: string;
  content: Buffer;
  ttl: number;
  creationDate: Date;
}

export const OUTGOING_SERVICE_MESSAGE_TYPE =
  'tech.relaycorp.awala.endpoint-internet.outgoing-service-message';

export function getOutgoingServiceMessageOptions(
  event: CloudEventV1<unknown>,
  logger: FastifyBaseLogger,
): OutgoingServiceMessageOptions | null {
  const parcelAwareLogger = logger.child({
    parcelId: event.id,
  });

  if (event.type !== OUTGOING_SERVICE_MESSAGE_TYPE) {
    parcelAwareLogger.error({ type: event.type }, 'Refused invalid type');
    return null;
  }

  if (event.subject === undefined) {
    parcelAwareLogger.info('Refused missing subject');
    return null;
  }

  if (event.datacontenttype === undefined) {
    parcelAwareLogger.info('Refused missing data content type');
    return null;
  }

  const content = event.data ?? Buffer.from('');
  if (!(content instanceof Buffer)) {
    parcelAwareLogger.info('Refused non-buffer service message content');
    return null;
  }

  const creationDate = new Date(event.time!);
  const ttl = getTtl(event.expiry, creationDate, parcelAwareLogger);

  if (ttl === null) {
    return null;
  }

  return {
    parcelId: event.id,
    peerId: event.subject,
    contentType: event.datacontenttype,
    content,
    ttl,
    creationDate,
  };
}
