import { type CloudEvent, type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';
import env from 'env-var';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';
import type { FastifyTypedInstance } from '../utilities/fastify/FastifyTypedInstance.js';

import type { Sink } from './Sink.js';
import { QueueProblemType } from './QueueProblemType.js';
import exampleSink from './sinks/example.sink';

const SINK_BY_TYPE: { [type: string]: Sink } = {
  'example': exampleSink,
};

export function makeQueueServerPlugin(
  server: FastifyTypedInstance,
  _opts: FastifyPluginOptions,
  done: PluginDone,
): void {
  server.addContentTypeParser(
    'application/cloudevents+json',
    { parseAs: 'string' },
    server.getDefaultJsonParser('ignore', 'ignore'),
  );

  const awalaMiddlewareEndpoint = env.get('AWALA_MIDDLEWARE_ENDPOINT').required().asUrlObject();

  server.get('/', async (_request, reply) => {
    await reply.status(HTTP_STATUS_CODES.OK).send('It works');
  });

  server.post('/', async (request, reply) => {
    const message: Message = { headers: request.headers, body: request.body };
    let events: CloudEventV1<unknown>;
    try {
      events = HTTP.toEvent(message) as CloudEventV1<unknown>;
    } catch {
      await reply
        .status(HTTP_STATUS_CODES.BAD_REQUEST)
        .send({ type: QueueProblemType.INVALID_EVENT });
      return;
    }

    const event = events as CloudEvent;
    const sink = SINK_BY_TYPE[event.type] as Sink | undefined;
    if (sink === undefined) {
      await reply
        .status(HTTP_STATUS_CODES.BAD_REQUEST)
        .send({ type: QueueProblemType.UNSUPPORTED_EVENT });
      return;
    }

    await sink(event, {
      logger: server.log,
      dbConnection: server.mongoose,
      awalaMiddlewareEndpoint,
    });
    await reply.status(HTTP_STATUS_CODES.NO_CONTENT).send();
  });

  done();
}

export async function makeQueueServer(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makeQueueServerPlugin, logger);
}
