import { MAX_RAMF_MESSAGE_LENGTH } from '@relaycorp/relaynet-core';
import type { FastifyInstance, FastifyPluginCallback, RouteOptions } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeFastify } from '../utilities/fastify/server.js';
import healthcheckRoutes from '../utilities/fastify/plugins/healthCheck.js';

import connectionParamsRoutes from './routes/connectionParams.routes.js';
import parcelDeliveryRoutes from './routes/parcelDelivery.routes.js';

export async function makePohttpServerPlugin(server: FastifyInstance): Promise<void> {
  const rootRoutes: FastifyPluginCallback<RouteOptions>[] = [
    healthcheckRoutes,
    connectionParamsRoutes,
    parcelDeliveryRoutes,
  ];
  await Promise.all(rootRoutes.map((route) => server.register(route)));
}

export async function makePohttpServer(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpServerPlugin, { logger, bodyLimit: MAX_RAMF_MESSAGE_LENGTH });
}
