import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { InternetEndpoint } from '../../awala/InternetEndpoint.js';

async function fastifyActiveEndpoint(fastify: FastifyInstance) {
  const activeEndpoint = await InternetEndpoint.getActive(fastify.mongoose);

  fastify.decorate('activeEndpoint', activeEndpoint);
}

const fastifyActiveEndpointPlugin = fastifyPlugin(fastifyActiveEndpoint, {
  name: 'active-endpoint',
  dependencies: ['fastify-mongoose'],
});
export default fastifyActiveEndpointPlugin;
