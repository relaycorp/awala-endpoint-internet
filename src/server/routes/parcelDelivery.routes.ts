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

  async function getDeserializedParcel(
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

  async function storePda(
    pdaBuffer: Buffer,
    activeEndpoint: InternetEndpoint,
    logger: FastifyBaseLogger,
    dbConnection: Connection,
  ): Promise<void> {
    try {
      const privateEndpointConnParams = await PrivateEndpointConnParams.deserialize(pdaBuffer);
      await activeEndpoint.savePeerEndpointChannel(privateEndpointConnParams, dbConnection);
      logger.info('Private endpoint connection params stored');
    } catch (err) {
      logger.info({ err }, 'Refusing to store invalid endpoint connection params!');
    }
  }

  fastify.route<{
    // eslint-disable-next-line @typescript-eslint/naming-convention
    readonly Body: Buffer;
  }>({
    method: ['POST'],
    url: '/',

    async handler(request, reply): Promise<void> {
      const parcel = await getDeserializedParcel(request.body, fastify.log);
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
        await storePda(serviceMessage.content, activeEndpoint, log, mongoose);
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      await publishIncomingServiceMessage(parcel, serviceMessage);

      // DECRYPT AND THEN EMIT EVENT (BUT THAT'S PART OF A DIFFERENT ISSUE)
      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
    },
  });

  done();
}
