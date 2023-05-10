import type { FastifyInstance, RouteOptions } from 'fastify';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';
import { bufferToArrayBuffer } from '../../utilities/buffer';
import { Parcel } from '@relaycorp/relaynet-core';

export default function registerRoutes(
  fastify: FastifyInstance,
  _opts: RouteOptions,
  done: PluginDone,
): void {

  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    'application/vnd.awala.parcel',
    { parseAs: 'buffer' },
    (_request, payload, done) => {
      done(null, payload)
    })

  fastify.route<{ readonly Body: Buffer }>({
    method: ['POST'],
    url: '/',

    async handler(request, reply): Promise<void> {
      let parcel;
      try {
        parcel = await Parcel.deserialize(bufferToArrayBuffer(request.body));
      } catch (err) {
        // Don't log the full error because 99.99% of the time the reason will suffice.
        request.log.info({ reason: (err as Error).message }, 'Refusing malformed parcel');
        return reply.code(403).send({ reason: 'Payload is not a valid RAMF-serialized parcel' });
      }

      const parcelAwareLogger = request.log.child({
        parcelId: parcel.id,
        recipient: parcel.recipient,
        senderId: await parcel.senderCertificate.calculateSubjectId(),
      });

      try {
        const activeEndpoint = await fastify.getActiveEndpoint();
        activeEndpoint.validateMessage(parcel);
      } catch (err) {
        parcelAwareLogger.info({ err }, 'Refusing invalid parcel');
        return reply.code(403).send({ message: 'Parcel is well-formed but invalid' });
      }

      // DECRYPT AND THEN EMIT EVENT (BUT THAT'S PART OF A DIFFERENT ISSUE)

      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(202).send({});
    },
  });

  done();
}
