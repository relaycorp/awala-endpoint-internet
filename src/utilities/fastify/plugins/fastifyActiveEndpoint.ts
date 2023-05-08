import type { FastifyInstance } from 'fastify';
import fastifyPlugin, { type PluginMetadata } from 'fastify-plugin';

import { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';
import type { PluginDone } from '../PluginDone.js';

function fastifyActiveEndpoint(
  fastify: FastifyInstance,
  _opts: PluginMetadata,
  done: PluginDone,
): void {
  fastify.addHook('onReady', async () => {
    const endpointManager = await InternetEndpointManager.init(fastify.mongoose);
    const activeEndpoint = await endpointManager.getActiveEndpoint();
    await activeEndpoint.makeInitialSessionKeyIfMissing();
    fastify.decorate('activeEndpoint', activeEndpoint, ['mongoose']);
  });
  done();
}

const fastifyActiveEndpointPlugin = fastifyPlugin(fastifyActiveEndpoint, {
  name: 'active-endpoint',
});
export default fastifyActiveEndpointPlugin;
