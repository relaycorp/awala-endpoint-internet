import type { FastifyInstance, FastifyPluginCallback, RouteOptions } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeFastify } from '../utilities/fastify/server.js';

import healthcheckRoutes from './routes/healthcheck.routes.js';
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

export async function makePohttpServer(customLogger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpServerPlugin, customLogger);
}
