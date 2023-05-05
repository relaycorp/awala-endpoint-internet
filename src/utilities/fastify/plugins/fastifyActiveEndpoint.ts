import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';

async function fastifyActiveEndpoint(fastify: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (fastify.mongoose === undefined) {
    throw new Error('MongoDB not configured!');
  }
  const endpointManager = await InternetEndpointManager.init(fastify.mongoose);
  const activeEndpoint = await endpointManager.getActiveEndpoint();
  await activeEndpoint.makeInitialSessionKeyIfMissing();
  fastify.decorate('activeEndpoint', activeEndpoint);
}

const fastifyActiveEndpointPlugin = fastifyPlugin(fastifyActiveEndpoint, {
  name: 'active-endpoint',
});
export default fastifyActiveEndpointPlugin;
