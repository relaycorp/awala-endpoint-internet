import type { FastifyInstance, RouteOptions } from 'fastify';
import { Parcel, type ServiceMessage } from '@relaycorp/relaynet-core';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';
import { bufferToArrayBuffer } from '../../utilities/buffer.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
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

  fastify.route<{
    // eslint-disable-next-line @typescript-eslint/naming-convention
    readonly Body: Buffer;
  }>({
    method: ['POST'],
    url: '/',

    async handler(request, reply): Promise<void> {
      let parcel;
      try {
        parcel = await Parcel.deserialize(bufferToArrayBuffer(request.body));
      } catch (err) {
        // Don't log the full error because 99.99% of the time the reason will suffice.
        request.log.info({ reason: (err as Error).message }, 'Refusing malformed parcel');
        return reply
          .code(HTTP_STATUS_CODES.BAD_REQUEST)
          .send({ message: 'Payload is not a valid RAMF-serialized parcel' });
      }

      const parcelAwareLogger = request.log.child({
        parcelId: parcel.id,
        recipient: parcel.recipient,
        senderId: await parcel.senderCertificate.calculateSubjectId(),
      });

      const { activeEndpoint } = fastify;
      try {
        await activeEndpoint.validateMessage(parcel);
      } catch (err) {
        parcelAwareLogger.info({ err }, 'Refusing invalid parcel');
        return reply
          .code(HTTP_STATUS_CODES.FORBIDDEN)
          .send({ message: 'Parcel is well-formed but invalid' });
      }

      let serviceMessage: ServiceMessage;
      try {
        ({ payload: serviceMessage } = await parcel.unwrapPayload(
          activeEndpoint.keyStores.privateKeyStore,
        ));
      } catch (err) {
        parcelAwareLogger.info({ err }, 'Ignoring invalid service message');
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      await publishIncomingServiceMessage(parcel, serviceMessage);

      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
    },
  });

  done();
}
