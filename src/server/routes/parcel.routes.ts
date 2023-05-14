import type { FastifyBaseLogger, FastifyInstance, RouteOptions } from 'fastify';
import { Parcel } from '@relaycorp/relaynet-core';
import { PrivateEndpointConnParams } from '@relaycorp/relaynet-core/build/main/lib/nodes/PrivateEndpointConnParams.js';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';
import { bufferToArrayBuffer } from '../../utilities/buffer.js';
import { HTTP_STATUS_CODES } from '../../utilities/http.js';
import type { ServiceOptions } from '../../serviceTypes.js';

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

  async function getDeserializedParcel(payload: Buffer, logger: FastifyBaseLogger) {
    try {
      return await Parcel.deserialize(bufferToArrayBuffer(payload));
    } catch (err) {
      // Don't log the full error because 99.99% of the time the reason will suffice.
      logger.info({ reason: (err as Error).message }, 'Refusing malformed parcel');
      return null;
    }
  }

  async function isMessageValid(parcel: Parcel, serviceOptions: ServiceOptions) {
    try {
      await serviceOptions.activeEndpoint.validateMessage(parcel);
      return true;
    } catch (err) {
      serviceOptions.logger.info({ err }, 'Refusing invalid parcel');
      return false;
    }
  }

  async function getDecryptedParcel(parcel: Parcel, serviceOptions: ServiceOptions) {
    try {
      return await parcel.unwrapPayload(serviceOptions.activeEndpoint.keyStores.privateKeyStore);
    } catch (err) {
      serviceOptions.logger.info({ err }, 'Invalid service message');
      return null;
    }
  }

  async function storePda(pdaBuffer: Buffer, serviceOptions: ServiceOptions) {
    try {
      const privateEndpointConnParams = await PrivateEndpointConnParams.deserialize(pdaBuffer);
      await serviceOptions.activeEndpoint.savePrivateEndpointChannel(
        privateEndpointConnParams,
        fastify.mongoose,
      );
      serviceOptions.logger.info('Private endpoint connection params stored');
    } catch (err) {
      serviceOptions.logger.info({ err }, 'Private endpoint connection params malformed!');
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

      const activeEndpoint = await fastify.getActiveEndpoint();
      const serviceOptions: ServiceOptions = {
        logger: parcelAwareLogger,
        dbConnection: fastify.mongoose,
        activeEndpoint,
      };

      const isValid = await isMessageValid(parcel, serviceOptions);
      if (!isValid) {
        return reply
          .code(HTTP_STATUS_CODES.FORBIDDEN)
          .send({ message: 'Parcel is well-formed but invalid' });
      }

      const decryptionResult = await getDecryptedParcel(parcel, serviceOptions);
      if (!decryptionResult) {
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      if (decryptionResult.payload.type === 'application/vnd+relaycorp.awala.pda-path') {
        await storePda(decryptionResult.payload.content, serviceOptions);
        return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
      }

      // DECRYPT AND THEN EMIT EVENT (BUT THAT'S PART OF A DIFFERENT ISSUE)
      parcelAwareLogger.info('Parcel is valid and has been queued');
      return reply.code(HTTP_STATUS_CODES.ACCEPTED).send();
    },
  });

  done();
}
