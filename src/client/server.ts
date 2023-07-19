import { makeReceiver } from '@relaycorp/cloudevents-transport';
import { Parcel, ServiceMessage } from '@relaycorp/relaynet-core';
import {
  deliverParcel,
  PoHTTPClientBindingError,
  PoHTTPInvalidParcelError,
} from '@relaycorp/relaynet-pohttp';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';
import type { Connection } from 'mongoose';
import envVar from 'env-var';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { InternetEndpoint } from '../utilities/awala/InternetEndpoint.js';
import {
  getOutgoingServiceMessageOptions,
  type OutgoingServiceMessageOptions,
} from '../events/outgoingServiceMessage.event.js';
import { DEFAULT_TRANSPORT } from '../utilities/eventing/transport.js';

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
): Promise<boolean> {
  const gatewayAwareLogger = logger.child({ internetGatewayAddress: internetAddress });
  try {
    await deliverParcel(internetAddress, parcelSerialised, { useTls: shouldUseTls });
    gatewayAwareLogger.info('Parcel delivered');
  } catch (err) {
    if (err instanceof PoHTTPInvalidParcelError) {
      gatewayAwareLogger.info({ err }, 'Gateway refused parcel as invalid');
    } else if (err instanceof PoHTTPClientBindingError) {
      gatewayAwareLogger.info({ err }, 'Gateway refused parcel delivery due to binding error');
    } else {
      // Let's try again later
      gatewayAwareLogger.warn({ err }, 'Failed to deliver parcel');
      return false;
    }
  }
  return true;
}

export async function makePohttpClientPlugin(server: FastifyInstance): Promise<void> {
  const shouldUseTls = envVar.get('POHTTP_TLS_REQUIRED').default('true').asBool();
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, next) => {
    next(null, payload);
  });

  server.get('/', async (_request, reply) => {
    await reply.status(HTTP_STATUS_CODES.OK).send('It works');
  });

  const transport = envVar.get('CE_TRANSPORT').default(DEFAULT_TRANSPORT).asString();
  const convertMessageToEvent = await makeReceiver(transport);

  server.post('/', async (request, reply) => {
    let event;
    try {
      event = convertMessageToEvent(request.headers, request.body as Buffer);
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

    const wasFulfilled = await deliverParcelAndHandleErrors(
      parcelSerialised,
      channel.peer.internetAddress,
      shouldUseTls,
      parcelAwareLogger,
    );
    if (wasFulfilled) {
      return reply.status(HTTP_STATUS_CODES.NO_CONTENT).send();
    }

    return reply.status(HTTP_STATUS_CODES.BAD_GATEWAY).send();
  });
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
