import type { FastifyInstance, RouteOptions } from 'fastify';

import type { PluginDone } from '../../utilities/fastify/PluginDone.js';

const DER_CONTENT_TYPE = 'application/vnd.etsi.tsl.der';

export default function registerRoutes(
  fastify: FastifyInstance,
  _opts: RouteOptions,
  done: PluginDone,
): void {
  fastify.route({
    method: ['GET'],
    url: '/connection-params.der',

    async handler(_request, reply): Promise<void> {
      const activeEndpoint = await fastify.getActiveEndpoint();
      const connectionParams = await activeEndpoint.getConnectionParams();

      await reply.type(DER_CONTENT_TYPE).send(connectionParams);
    },
  });

  done();
}
