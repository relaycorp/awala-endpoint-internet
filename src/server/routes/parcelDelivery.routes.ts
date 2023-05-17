import type { FastifyInstance, RouteOptions } from 'fastify';
import { Parcel } from '@relaycorp/relaynet-core';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';
import { bufferToArrayBuffer } from '../../utilities/buffer.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';

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

      const activeEndpoint = await fastify.getActiveEndpoint();
      try {
        await activeEndpoint.validateMessage(parcel);
      } catch (err) {
        parcelAwareLogger.info({ err }, 'Refusing invalid parcel');
        return reply
          .code(HTTP_STATUS_CODES.FORBIDDEN)
          .send({ message: 'Parcel is well-formed but invalid' });
      }

      let decryptionResult;
      try {
        decryptionResult = await parcel.unwrapPayload(activeEndpoint.keyStores.privateKeyStore);
      } catch (err) {
        parcelAwareLogger.info({ err }, 'Ignoring invalid service message');
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      // This log is needed not to throw decryptionResult is unused error.
      // Will be removed in the next PR
      parcelAwareLogger.info({ test: decryptionResult.senderSessionKey.keyId }, 'test');

      // DECRYPT AND THEN EMIT EVENT (BUT THAT'S PART OF A DIFFERENT ISSUE)
      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
    },
  });

  done();
}