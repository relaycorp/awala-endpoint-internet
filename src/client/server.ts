import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';

import { getModelForClass } from '@typegoose/typegoose';
//import { PeerEndpoint } from '../models/PeerEndpoint.model';
import { ConfigItem } from '../models/ConfigItem.model';
import { ConfigItem2 } from '../models/ConfigItem2.model';

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

  server.get('/', async (_request, reply) => {
    await reply.status(HTTP_STATUS_CODES.OK).send('It works');
  });

  server.post('/test1', async (_request, reply) => {
    const privateEndpointModel = getModelForClass(ConfigItem2, {
      existingConnection: server.mongoose,
    });

    await privateEndpointModel.findOne({});

    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });

  server.post('/test2', async (_request, reply) => {
    const configItem2Model = getModelForClass(ConfigItem2, {
      existingConnection: server.mongoose,
    });

    await configItem2Model.findOne({});

    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });

  server.post('/test3', async (_request, reply) => {
    const configItemModel = getModelForClass(ConfigItem, {
      existingConnection: server.mongoose,
    });

    await configItemModel.findOne({});

    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });

  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  const server = await makeFastify(makePohttpClientPlugin, logger);


  return server;
}
