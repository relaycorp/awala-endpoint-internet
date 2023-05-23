import { type CloudEvent, HTTP } from 'cloudevents';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export async function postEvent(
  event: CloudEvent<unknown>,
  fastify: FastifyInstance,
): Promise<LightMyRequestResponse> {
  const message = HTTP.structured(event);

  return fastify.inject({
    method: 'POST',
    url: '/test',
    headers: message.headers,
    payload: message.body as string,
  });
}
