import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';

async function fastifyActiveEndpoint(fastify: FastifyInstance) {
  const endpointManager = await InternetEndpointManager.init(fastify.mongoose);
  const activeEndpoint = await endpointManager.getActiveEndpoint();

  fastify.decorate('getActiveEndpoint', async () => {
    await activeEndpoint.makeInitialSessionKeyIfMissing();
    return activeEndpoint;
  });
}

const fastifyActiveEndpointPlugin = fastifyPlugin(fastifyActiveEndpoint, {
  name: 'active-endpoint',
});
export default fastifyActiveEndpointPlugin;
