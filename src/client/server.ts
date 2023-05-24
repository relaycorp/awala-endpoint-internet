import { type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';
import { Parcel, ServiceMessage, type Channel } from '@relaycorp/relaynet-core';
import { isValid, differenceInSeconds } from 'date-fns';
import { deliverParcel } from '@relaycorp/relaynet-pohttp';
import type { Connection } from 'mongoose';

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
}

function getTtl(expiry: unknown, time: string) {
  if (expiry === undefined) {
    throw new Error('Ignoring event due to missing expiry');
  }

  if (typeof expiry !== 'string') {
    throw new TypeError('Ignoring event due to malformed expiry');
  }

  const expiryDate = new Date(expiry);
  const creationDate = new Date(time);

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

  return {
    id: event.id,
    peerId: event.subject,
    dataContentType: event.datacontenttype,
    data: messageBody,
    ttl: getTtl(event.expiry, event.time!),
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

    const serviceMessage = new ServiceMessage(eventData.dataContentType, eventData.data);
    const parcelSerialised = await channel.makeMessage(serviceMessage, Parcel, {
      ttl: eventData.ttl,
    });
    await deliverParcel(channel.peer.internetAddress, parcelSerialised);
    server.log.info({ eventId: event.id }, 'Parcel sent');
    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });
  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
