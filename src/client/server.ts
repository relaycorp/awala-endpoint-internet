import { type CloudEventV1, HTTP, type Message } from 'cloudevents';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { BaseLogger } from 'pino';
import {
  CertificationPath,
  PrivateEndpointConnParams,
  ServiceMessage,
  SessionEnvelopedData,
} from '@relaycorp/relaynet-core';
import { isValid } from 'date-fns';

import { makeFastify } from '../utilities/fastify/server.js';
import { HTTP_STATUS_CODES } from '../utilities/http.js';
import type { PluginDone } from '../utilities/fastify/PluginDone.js';

import { InternetPrivateEndpointChannel } from '../utilities/awala/InternetPrivateEndpointChannel';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { KEY_PAIR_SET, PEER_ADDRESS, PEER_KEY_PAIR } from '../testUtils/awala/stubs';
import { getModelForClass } from '@typegoose/typegoose';
import { PeerEndpoint } from '../models/PeerEndpoint.model';

interface EventData {
  id: string;
  peerId: string;
  dataContentType: string;
  data: Buffer;
  creationDate: Date;
  expiryDate: Date;
}

function getMessageData(event: CloudEventV1<unknown>): EventData {
  if (event.subject === undefined) {
    throw new Error('Ignoring event due to missing subject');
  }

  if (event.datacontenttype === undefined) {
    throw new Error('Ignoring event due to missing data content type');
  }

  const expiryDate = event.expiry;
  if (expiryDate === undefined){
    throw new Error('Ignoring event due to missing expiry');
  }

  if (typeof expiryDate !== 'string' || !isValid(new Date(expiryDate))) {
    throw new Error('Ignoring event due to malformed expiry');
  }

  if (event.data === undefined) {
    throw new Error('Ignoring event due to missing data');
  }

  let parcelBody: Buffer;

  if (typeof event.data === 'string') {
    parcelBody = Buffer.from(event.data);
  } else {
    throw new Error('Ignoring event due to invalid data');
  }

  return {
    id: event.id,
    peerId: event.subject,
    dataContentType: event.datacontenttype,
    data: parcelBody,
    creationDate: new Date(event.time!),
    expiryDate: new Date(expiryDate),
  };
}

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

  server.post('/test', async (_request, reply) => {
    const privateEndpointModel = getModelForClass(PeerEndpoint, {
      existingConnection: server.mongoose,
    });

      const peerEndpoint = await privateEndpointModel.findOne({
        peerId: '1',
      });
      console.log(peerEndpoint);


    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();


  })

  server.post('/', async (request, reply) => {
    const message: Message = { headers: request.headers, body: request.body };
    let event: CloudEventV1<unknown>;
    try {
      event = HTTP.toEvent(message) as CloudEventV1<unknown>;
    } catch {
      return reply
        .status(HTTP_STATUS_CODES.BAD_REQUEST)
        .send();
    }

    let eventData: EventData;
    try {
      eventData = getMessageData(event);
    } catch (err) {
      const msg = (err as Error).message;
      server.log.info({eventId: event.id}, msg);
      return reply.status(HTTP_STATUS_CODES.BAD_REQUEST).send();
    }

    let channel: InternetPrivateEndpointChannel | null;
    try{
      channel = await server.activeEndpoint.getPeerChannel(eventData.peerId, server.mongoose);
    }catch (e){
      server.log.warn({eventId: event.id}, 'Ignoring event due to not having a registered private endpoint');
      return reply
        .status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE)
        .send();
    }


    if (!channel) {
      server.log.warn({eventId: event.id}, 'Ignoring event due to not having a an peer endpoint db');
      return reply
        .status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE)
        .send();
    }

    try {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        pdaPath,
      );
      const privateEndpointChannel = await server.activeEndpoint.saveChannel(
        peerConnectionParams,
        server.mongoose
      );

      // const channel1 = await server.activeEndpoint.getPeerChannel(privateEndpointChannel.peer.id, server.mongoose);

      const serviceMessage = new ServiceMessage(eventData.dataContentType, eventData.data);

      const recipientSessionKey = await privateEndpointChannel!.keyStores.publicKeyStore.retrieveLastSessionKey(
        privateEndpointChannel.peer.id,
      );

      console.log(recipientSessionKey)

      const { envelopedData } = await SessionEnvelopedData.encrypt(
        serviceMessage.serialize(),
        recipientSessionKey!,
      );

      console.log(envelopedData);
      // const parcelSerialised = await channel.makeMessage(
      //   envelopedData.serialize(),
      //   Parcel,
      // );
      // await deliverParcel(channel.peer.internetAddress, parcelSerialised);
    }catch (e){
      console.log(e);
    }
    server.log.info({eventId: event.id}, 'Parcel sent');
    return reply.status(HTTP_STATUS_CODES.ACCEPTED).send();
  });
  done();
}

export async function makePohttpClient(logger?: BaseLogger): Promise<FastifyInstance> {
  return makeFastify(makePohttpClientPlugin, logger);
}
