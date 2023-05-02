import type {FastifyInstance, FastifyPluginCallback, RouteOptions} from 'fastify';
import type { BaseLogger } from 'pino';

import healthcheckRoutes from './routes/healthcheck.routes.js';
import { makeFastify } from "../utilities/fastify/server";

export async function makeApiServerPlugin(server: FastifyInstance): Promise<void> {
  const rootRoutes: FastifyPluginCallback<RouteOptions>[] = [healthcheckRoutes];
  await Promise.all(rootRoutes.map((route) => server.register(route)));
}

export async function makeApiServer(customLogger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makeApiServerPlugin, customLogger);
}
