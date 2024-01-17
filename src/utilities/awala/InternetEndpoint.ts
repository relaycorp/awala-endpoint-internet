import {
  derDeserializeRSAPublicKey,
  Endpoint,
  getIdFromIdentityKey,
  InvalidMessageError,
  type KeyStoreSet,
  NodeConnectionParams,
  type Parcel,
  type PrivateEndpointConnParams,
  type SessionKey,
} from '@relaycorp/relaynet-core';
import envVar from 'env-var';
import type { Connection } from 'mongoose';
import { initPrivateKeystoreFromEnv } from '@relaycorp/awala-keystore-cloud';
import { MongoCertificateStore, MongoPublicKeyStore } from '@relaycorp/awala-keystore-mongodb';
import { getModelForClass } from '@typegoose/typegoose';

import { Kms } from '../kms/Kms.js';
import { PeerEndpoint } from '../../models/PeerEndpoint.model.js';

import { InternetPrivateEndpointChannel } from './InternetPrivateEndpointChannel.js';

function initKeyStoreSet(dbConnection: Connection): KeyStoreSet {
  const privateKeyStoreAdapter = envVar.get('PRIVATE_KEY_STORE_ADAPTER').required().asString();
  const privateKeyStore = initPrivateKeystoreFromEnv(privateKeyStoreAdapter, dbConnection);
  return {
    certificateStore: new MongoCertificateStore(dbConnection),
    publicKeyStore: new MongoPublicKeyStore(dbConnection),
    privateKeyStore,
  };
}

async function retrieveIdentityPrivateKeyRef(): Promise<CryptoKey> {
  const activeIdKeyRef = envVar.get('ACTIVE_ID_KEY_REF').required().asString();
  const kms = await Kms.init();
  return kms.retrievePrivateKeyByRef(Buffer.from(activeIdKeyRef));
}

function convertPemToDer(pem: string): Buffer {
  const pemLines = pem.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  const pemBody = pemLines.length === 1 ? pemLines[0] : pemLines.slice(1, -1).join('');
  return Buffer.from(pemBody, 'base64');
}

async function getIdentityPublicKey() {
  const keyPem = envVar.get('ACTIVE_ID_PUBLIC_KEY').required().asString();
  const keyDer = convertPemToDer(keyPem);
  return derDeserializeRSAPublicKey(keyDer);
}

export class InternetEndpoint extends Endpoint {
  public static async getActive(dbConnection: Connection): Promise<InternetEndpoint> {
    const privateKey = await retrieveIdentityPrivateKeyRef();
    const publicKey = await getIdentityPublicKey();
    const endpointId = await getIdFromIdentityKey(publicKey);
    const internetAddress = envVar.get('INTERNET_ADDRESS').required().asString();
    const keyStoreSet = initKeyStoreSet(dbConnection);
    return new InternetEndpoint(
      endpointId,
      internetAddress,
      { privateKey, publicKey },
      keyStoreSet,
    );
  }

  protected readonly channelConstructor = InternetPrivateEndpointChannel;

  public constructor(
    id: string,
    public readonly internetAddress: string,
    identityKeyPair: CryptoKeyPair,
    keyStores: KeyStoreSet,
  ) {
    super(id, identityKeyPair, keyStores, {});
  }

  public async saveChannel(
    connectionParams: PrivateEndpointConnParams,
    dbConnection: Connection,
  ): Promise<InternetPrivateEndpointChannel> {
    const channel = await this.savePrivateEndpointChannel(connectionParams);
    const peerId = channel.peer.id;
    const { internetGatewayAddress } = connectionParams;

    const privateEndpointModel = getModelForClass(PeerEndpoint, {
      existingConnection: dbConnection,
    });

    await privateEndpointModel.updateOne(
      {
        peerId,
      },
      {
        internetGatewayAddress,
      },
      {
        upsert: true,
      },
    );
    return channel;
  }

  public async getPeerChannel(
    peerId: string,
    dbConnection: Connection,
  ): Promise<InternetPrivateEndpointChannel | null> {
    const privateEndpointModel = getModelForClass(PeerEndpoint, {
      existingConnection: dbConnection,
    });

    const peerEndpoint = await privateEndpointModel.findOne({
      peerId,
    });
    if (peerEndpoint === null) {
      return null;
    }

    const channel = await this.getChannel(peerId, peerEndpoint.internetGatewayAddress);
    if (channel === null) {
      throw new Error(`Could not find channel for peer ${peerId}`);
    }

    return channel;
  }

  /**
   * Generate the initial session key if it doesn't exist yet.
   * @returns Whether the initial session key was created.
   */
  public async makeInitialSessionKeyIfMissing(): Promise<boolean> {
    const existingKey = await this.keyStores.privateKeyStore.retrieveUnboundSessionPublicKey(
      this.id,
    );
    if (existingKey !== null) {
      return false;
    }

    await this.generateSessionKey();
    return true;
  }

  public async retrieveInitialSessionKey(): Promise<SessionKey> {
    const key = await this.keyStores.privateKeyStore.retrieveUnboundSessionPublicKey(this.id);
    if (!key) {
      throw new Error('Initial session key id is missing');
    }
    return key;
  }

  public async getConnectionParams(): Promise<Buffer> {
    const initialSessionKey = await this.retrieveInitialSessionKey();
    const params = new NodeConnectionParams(
      this.internetAddress,
      this.identityKeyPair.publicKey,
      initialSessionKey,
    );
    return Buffer.from(await params.serialize());
  }

  public override async validateMessage(message: Parcel): Promise<void> {
    await super.validateMessage(message);

    if (message.recipient.internetAddress !== this.internetAddress) {
      const errorMessage =
        message.recipient.internetAddress === undefined
          ? 'Parcel recipient is missing Internet address'
          : `Parcel is bound for different Internet address (${message.recipient.internetAddress})`;
      throw new InvalidMessageError(errorMessage);
    }
  }
}
