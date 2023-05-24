import { getModelForClass } from '@typegoose/typegoose';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';
import { ConfigItem2 } from '../models/ConfigItem2.model.js';

function makePohttpClientPlugin(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: PluginDone,
): void {
  server.addContentTypeParser(
    'application/cloudevents+json',
    { parseAs: 'string' },
    server.getDefaultJsonParser('ignore', 'ignore'),
  );

  server.post('/test1', async (_request, reply) => {
    const privateEndpointModel = getModelForClass(ConfigItem2, {
      existingConnection: server.mongoose,
    });

    await privateEndpointModel.findOne({});

    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });

  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
