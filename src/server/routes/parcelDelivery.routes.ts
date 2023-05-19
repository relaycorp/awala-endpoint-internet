import type { FastifyBaseLogger, FastifyInstance, RouteOptions } from 'fastify';
import { Parcel, type ServiceMessage, PrivateEndpointConnParams } from '@relaycorp/relaynet-core';
import type { Connection } from 'mongoose';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';
import { bufferToArrayBuffer } from '../../utilities/buffer.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
import type { InternetEndpoint } from '../../utilities/awala/InternetEndpoint.js';
import { makeIncomingServiceMessageEvent } from '../../events/incomingServiceMessage.event.js';
import { Emitter } from '../../utilities/eventing/Emitter.js';

async function publishIncomingServiceMessage(parcel: Parcel, serviceMessage: ServiceMessage) {
  const event = makeIncomingServiceMessageEvent({
    creationDate: parcel.creationDate,
    expiryDate: parcel.expiryDate,
    parcelId: parcel.id,
    senderId: await parcel.senderCertificate.calculateSubjectId(),
    recipientId: parcel.recipient.id,
    contentType: serviceMessage.type,
    content: serviceMessage.content,
  });
  const emitter = Emitter.init();
  await emitter.emit(event);
}

async function deserializeParcel(
  payload: Buffer,
  logger: FastifyBaseLogger,
): Promise<Parcel | null> {
  try {
    return await Parcel.deserialize(bufferToArrayBuffer(payload));
  } catch (err) {
    // Don't log the full error because 99.99% of the time the reason will suffice.
    logger.info({ reason: (err as Error).message }, 'Refusing malformed parcel');
    return null;
  }
}

async function isMessageValid(
  parcel: Parcel,
  activeEndpoint: InternetEndpoint,
  logger: FastifyBaseLogger,
): Promise<boolean> {
  try {
    await activeEndpoint.validateMessage(parcel);
    return true;
  } catch (err) {
    logger.info({ err }, 'Refusing invalid parcel');
    return false;
  }
}

async function getDecryptedParcel(
  parcel: Parcel,
  activeEndpoint: InternetEndpoint,
  logger: FastifyBaseLogger,
): Promise<ServiceMessage | null> {
  try {
    const { payload } = await parcel.unwrapPayload(activeEndpoint.keyStores.privateKeyStore);
    return payload;
  } catch (err) {
    logger.info({ err }, 'Ignoring invalid service message');
    return null;
  }
}

async function createOrUpdateChannel(
  pdaBuffer: Buffer,
  activeEndpoint: InternetEndpoint,
  logger: FastifyBaseLogger,
  dbConnection: Connection,
): Promise<void> {
  let privateEndpointConnParams: PrivateEndpointConnParams;
  try {
    privateEndpointConnParams = await PrivateEndpointConnParams.deserialize(pdaBuffer);
  } catch (err) {
    logger.info({ err }, 'Refusing to store malformed peer connection params!');
    return;
  }

  try {
    await activeEndpoint.saveChannel(privateEndpointConnParams, dbConnection);
    logger.info('Peer connection params stored');
  } catch (err) {
    logger.info({ err }, 'Refusing to store invalid peer connection params!');
  }
}

export default function registerRoutes(
  fastify: FastifyInstance,
  _opts: RouteOptions,
  done: PluginDone,
): void {
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    'application/vnd.awala.parcel',
    { parseAs: 'buffer' },
    (_request, payload, next) => {
      next(null, payload);
    },
  );

  fastify.route<{
    // eslint-disable-next-line @typescript-eslint/naming-convention
    readonly Body: Buffer;
  }>({
    method: ['POST'],
    url: '/',

    async handler(request, reply): Promise<void> {
      const parcel = await deserializeParcel(request.body, fastify.log);
      if (!parcel) {
        return reply
          .code(HTTP_STATUS_CODES.BAD_REQUEST)
          .send({ message: 'Payload is not a valid RAMF-serialized parcel' });
      }

      const parcelAwareLogger = request.log.child({
        parcelId: parcel.id,
        recipient: parcel.recipient,
        senderId: await parcel.senderCertificate.calculateSubjectId(),
      });

      const { mongoose, log, activeEndpoint } = fastify;

      const isValid = await isMessageValid(parcel, activeEndpoint, log);
      if (!isValid) {
        return reply
          .code(HTTP_STATUS_CODES.FORBIDDEN)
          .send({ message: 'Parcel is well-formed but invalid' });
      }

      const serviceMessage = await getDecryptedParcel(parcel, activeEndpoint, log);
      if (!serviceMessage) {
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      if (serviceMessage.type === 'application/vnd+relaycorp.awala.pda-path') {
        await createOrUpdateChannel(serviceMessage.content, activeEndpoint, log, mongoose);
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      await publishIncomingServiceMessage(parcel, serviceMessage);

      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
    },
  });

  done();
}
