import { type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';
import { Parcel, ServiceMessage, type Channel } from '@relaycorp/relaynet-core';
import { isValid, differenceInSeconds } from 'date-fns';
import type { Connection } from 'mongoose';
import {
  deliverParcel,
  PoHTTPClientBindingError,
  PoHTTPInvalidParcelError,
} from '@relaycorp/relaynet-pohttp';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';
import type { InternetEndpoint } from '../utilities/awala/InternetEndpoint.js';

interface EventData {
  id: string;
  peerId: string;
  dataContentType: string;
  data: Buffer;
  ttl: number;
  creationDate: Date;
}

function getTtl(expiry: unknown, creationDate: Date) {
  if (expiry === undefined) {
    throw new Error('Ignoring event due to missing expiry');
  }

  if (typeof expiry !== 'string') {
    throw new TypeError('Ignoring event due to malformed expiry');
  }

  const expiryDate = new Date(expiry);

  if (!isValid(expiryDate)) {
    throw new Error('Ignoring event due to malformed expiry');
  }

  const difference = differenceInSeconds(expiryDate, creationDate);

  if (difference < 0) {
    throw new Error('Ignoring expiry less than time');
  }

  return difference;
}

function getMessageData(event: CloudEventV1<unknown>): EventData {
  if (event.subject === undefined) {
    throw new Error('Ignoring event due to missing subject');
  }

  if (event.datacontenttype === undefined) {
    throw new Error('Ignoring event due to missing data content type');
  }

  if (event.data === undefined) {
    throw new Error('Ignoring event due to missing data');
  }

  let messageBody: Buffer;
  if (typeof event.data === 'string') {
    messageBody = Buffer.from(event.data);
  } else {
    throw new TypeError('Ignoring event due to invalid data');
  }

  const creationDate = new Date(event.time!);
  return {
    id: event.id,
    peerId: event.subject,
    dataContentType: event.datacontenttype,
    data: messageBody,
    ttl: getTtl(event.expiry, creationDate),
    creationDate,
  };
}

async function getChannel(
  eventData: EventData,
  activeEndpoint: InternetEndpoint,
  logger: BaseLogger,
  dbConnection: Connection,
) {
  let channel: Channel<ServiceMessage, string> | null;
  try {
    channel = await activeEndpoint.getPeerChannel(eventData.peerId, dbConnection);
  } catch {
    logger.warn(
      { eventId: eventData.id },
      'Ignoring event due to not having a registered private endpoint',
    );
    return null;
  }

  if (!channel) {
    logger.warn(
      { eventId: eventData.id },
      'Ignoring event due to not having a an peer endpoint db',
    );
    return null;
  }

  return channel;
}

function makePohttpClientPlugin(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: PluginDone,
): void {
  server.removeAllContentTypeParsers();
  server.addContentTypeParser(
    'application/cloudevents+json',
    { parseAs: 'string' },
    server.getDefaultJsonParser('ignore', 'ignore'),
  );

  server.get('/', async (_request, reply) => {
    await reply.status(HTTP_STATUS_CODES.OK).send('It works');
  });

  server.post('/', async (request, reply) => {
    const message: Message = { headers: request.headers, body: request.body };
    const event = HTTP.toEvent(message) as CloudEventV1<unknown>;

    let eventData: EventData;
    try {
      eventData = getMessageData(event);
    } catch (err) {
      const msg = (err as Error).message;
      server.log.info({ eventId: event.id }, msg);
      return reply.status(HTTP_STATUS_CODES.BAD_REQUEST).send();
    }

    const channel = await getChannel(eventData, server.activeEndpoint, server.log, server.mongoose);
    if (channel === null) {
      return reply.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).send();
    }

    const parcelSerialised = await channel.makeMessage(
      new ServiceMessage(eventData.dataContentType, eventData.data),
      Parcel,
      {
        ttl: eventData.ttl,
        // getting error: "Id should not span more than 64 characters (got 65)",
        // id: eventData.peerId,
        creationDate: eventData.creationDate,
      },
    );

    try {
      await deliverParcel(channel.peer.internetAddress, parcelSerialised, { useTls: true });
    } catch (err) {
      if (err instanceof PoHTTPInvalidParcelError || err instanceof PoHTTPClientBindingError) {
        server.log.info({ err }, 'Delivery failed due to server refusing parcel');
      } else {
        server.log.info({ err }, 'Retry due to failed delivery');
        return reply.status(HTTP_STATUS_CODES.BAD_GATEWAY).send();
      }
    }

    server.log.info({ eventId: event.id }, 'Parcel sent');
    return reply.status(HTTP_STATUS_CODES.NO_CONTENT).send();
  });
  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
