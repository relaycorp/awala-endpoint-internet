import { type CloudEvent, type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';

import { PohttpClientProblemType } from './PohttpClientProblemType.js';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { KEY_PAIR_SET, PEER_ADDRESS, PEER_KEY_PAIR } from '../testUtils/awala/stubs';
import {
  CertificationPath,
  PrivateEndpointConnParams,
  SessionKeyPair,
} from '@relaycorp/relaynet-core';

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

  server.post('/', async (request, reply) => {
    const message: Message = { headers: request.headers, body: request.body };
    let events: CloudEventV1<unknown>;
    try {
      events = HTTP.toEvent(message) as CloudEventV1<unknown>;
    } catch {
      await reply
        .status(HTTP_STATUS_CODES.BAD_REQUEST)
        .send({ type: PohttpClientProblemType.INVALID_EVENT });
      return;
    }

    const event = events as CloudEvent;

    // Temporary log. Implement message sending functionality here
    server.log.info(event.id);
    await reply.status(HTTP_STATUS_CODES.NO_CONTENT).send();
  });

  server.get('/testsessionkey', async (_request, reply) => {
    const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
    const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
      certificatePath.privateEndpoint,
      certificatePath.privateGateway,
    ]);
    const peerSessionKeyPair = await SessionKeyPair.generate();
    const peerConnectionParams = new PrivateEndpointConnParams(
      PEER_KEY_PAIR.privateEndpoint.publicKey,
      PEER_ADDRESS,
      pdaPath,
      peerSessionKeyPair.sessionKey,
    );
    const privateEndpointChannel = await server.activeEndpoint.saveChannel(
      peerConnectionParams,
      server.mongoose,
    );

    const recipientSessionKey =
      await privateEndpointChannel.keyStores.publicKeyStore.retrieveLastSessionKey(
        privateEndpointChannel.peer.id,
      );

    await reply.status(HTTP_STATUS_CODES.OK).send({ recipientSessionKey });
  });
  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
