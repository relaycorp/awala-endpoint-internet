import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { InternetEndpointManager } from '../../awala/InternetEndpointManager.js';

async function fastifyActiveEndpoint(fastify: FastifyInstance): Promise<void> {

  fastify.addHook('onReady', async ()=>{
    const endpointManager = await InternetEndpointManager.init(fastify.mongoose);
    const activeEndpoint = await endpointManager.getActiveEndpoint();
    await activeEndpoint.makeInitialSessionKeyIfMissing();
    fastify.decorate('activeEndpoint', activeEndpoint,['mongoose']);
  })
}


const fastifyActiveEndpointPlugin = fastifyPlugin(fastifyActiveEndpoint, {
  name: 'active-endpoint',
});
export default fastifyActiveEndpointPlugin;
