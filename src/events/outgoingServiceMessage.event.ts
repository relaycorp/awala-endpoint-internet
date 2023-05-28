import type { CloudEventV1 } from 'cloudevents';
import { differenceInSeconds, isValid, parseISO } from 'date-fns';
import type { BaseLogger } from 'pino';

function getTtl(parcelId: string, expiry: unknown, creationDate: Date, logger: BaseLogger) {
  if (expiry === undefined) {
    logger.info({ parcelId }, 'Refused missing expiry');
    return null;
  }

  if (typeof expiry !== 'string') {
    logger.info({ parcelId }, 'Refused malformed expiry');
    return null;
  }

  const expiryDate = parseISO(expiry);

  if (!isValid(expiryDate)) {
    logger.info({ parcelId }, 'Refused malformed expiry');
    return null;
  }

  const difference = differenceInSeconds(expiryDate, creationDate);

  if (difference < 0) {
    logger.info({ parcelId }, 'Refused expiry less than time');
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

export function getOutgoingServiceMessageOptions(
  event: CloudEventV1<unknown>,
  logger: BaseLogger,
): OutgoingServiceMessageOptions | null {
  if (event.data_base64 === undefined) {
    logger.info({ parcelId: event.id }, 'Refused missing data', event);
    return null;
  }

  if (event.subject === undefined) {
    logger.info({ parcelId: event.id }, 'Refused missing subject');
    return null;
  }

  if (event.datacontenttype === undefined) {
    logger.info({ parcelId: event.id }, 'Refused missing data content type', event);
    return null;
  }

  const creationDate = new Date(event.time!);
  const ttl = getTtl(event.id, event.expiry, creationDate, logger);

  if (ttl === null) {
    return null;
  }

  return {
    parcelId: event.id,
    peerId: event.subject,
    contentType: event.datacontenttype,
    content: Buffer.from(event.data_base64, 'base64'),
    ttl,
    creationDate,
  };
}
