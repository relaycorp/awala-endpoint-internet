import { type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyBaseLogger, FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';
import { Parcel, ServiceMessage } from '@relaycorp/relaynet-core';
import type { Connection } from 'mongoose';
import envVar from 'env-var';
import {
  deliverParcel,
  PoHTTPClientBindingError,
  PoHTTPInvalidParcelError,
} from '@relaycorp/relaynet-pohttp';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';
import type { InternetEndpoint } from '../utilities/awala/InternetEndpoint.js';
import {
  getOutgoingServiceMessageOptions,
  type OutgoingServiceMessageOptions,
} from '../events/outgoingServiceMessage.event.js';

async function getChannel(
  eventData: OutgoingServiceMessageOptions,
  activeEndpoint: InternetEndpoint,
  logger: BaseLogger,
  dbConnection: Connection,
) {
  const channel = await activeEndpoint.getPeerChannel(eventData.peerId, dbConnection);

  if (!channel) {
    logger.warn('Could not find channel with peer');
    return null;
  }

  return channel;
}

async function deliverParcelAndHandleErrors(
  parcelSerialised: ArrayBuffer,
  internetAddress: string,
  shouldUseTls: boolean,
  logger: FastifyBaseLogger,
): Promise<(typeof HTTP_STATUS_CODES)[keyof typeof HTTP_STATUS_CODES] | null> {
  try {
    await deliverParcel(internetAddress, parcelSerialised, {
      useTls: shouldUseTls,
    });
  } catch (err) {
    if (err instanceof PoHTTPInvalidParcelError) {
      logger.info(
        { err, internetGatewayAddress: internetAddress },
        'Gateway refused parcel as invalid',
      );
    } else if (err instanceof PoHTTPClientBindingError) {
      logger.info(
        { err, internetGatewayAddress: internetAddress },
        'Gateway refused parcel delivery due to binding error',
      );
    } else {
      logger.warn({ err }, 'Failed to deliver parcel');
      return HTTP_STATUS_CODES.BAD_GATEWAY;
    }
  }
  return null;
}

export function makePohttpClientPlugin(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: PluginDone,
): void {
  const shouldUseTls = envVar.get('POHTTP_TLS_REQUIRED').default('true').asBool();
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, next) => {
    next(null, payload);
  });

  server.get('/', async (_request, reply) => {
    await reply.status(HTTP_STATUS_CODES.OK).send('It works');
  });

  server.post('/', async (request, reply) => {
    const message: Message = { headers: request.headers, body: request.body };
    let event;
    try {
      event = HTTP.toEvent(message) as CloudEventV1<unknown>;
    } catch {
      return reply.status(HTTP_STATUS_CODES.BAD_REQUEST).send();
    }

    const parcelAwareLogger = request.log.child({
      parcelId: event.id,
    });
    const messageOptions = getOutgoingServiceMessageOptions(event, parcelAwareLogger);
    if (!messageOptions) {
      return reply.status(HTTP_STATUS_CODES.BAD_REQUEST).send();
    }

    const channel = await getChannel(
      messageOptions,
      server.activeEndpoint,
      parcelAwareLogger,
      server.mongoose,
    );
    if (channel === null) {
      return reply.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).send();
    }

    const parcelSerialised = await channel.makeMessage(
      new ServiceMessage(messageOptions.contentType, messageOptions.content),
      Parcel,
      {
        ttl: messageOptions.ttl,
        id: messageOptions.parcelId,
        creationDate: messageOptions.creationDate,
      },
    );

    const failureStatusCode = await deliverParcelAndHandleErrors(
      parcelSerialised,
      channel.peer.internetAddress,
      shouldUseTls,
      parcelAwareLogger,
    );

    if (failureStatusCode) {
      return reply.status(failureStatusCode).send();
    }

    parcelAwareLogger.info('Parcel delivered');
    return reply.status(HTTP_STATUS_CODES.NO_CONTENT).send();
  });
  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
