import {
  derDeserializeRSAPublicKey,
  Endpoint,
  getIdFromIdentityKey,
  InvalidMessageError,
  type KeyStoreSet,
  MockCertificateStore,
  MockPublicKeyStore,
  NodeConnectionParams,
  type Parcel,
  type SessionKey,
  SessionKeyPair,
  type PrivateEndpointConnParams,
} from '@relaycorp/relaynet-core';
import envVar from 'env-var';
import type { Connection } from 'mongoose';
import { initPrivateKeystoreFromEnv } from '@relaycorp/awala-keystore-cloud';
import { getModelForClass } from '@typegoose/typegoose';

import { Config, ConfigKey } from '../config.js';
import { Kms } from '../kms/Kms.js';
import { PeerEndpoint } from '../../models/PeerEndpoint.model.js';

import { InternetPrivateEndpointChannel } from './InternetPrivateEndpointChannel.js';

function initKeyStoreSet(dbConnection: Connection): KeyStoreSet {
  const privateKeyStoreAdapter = envVar.get('PRIVATE_KEY_STORE_ADAPTER').required().asString();
  const privateKeyStore = initPrivateKeystoreFromEnv(privateKeyStoreAdapter, dbConnection);
  return {
    certificateStore: new MockCertificateStore(),
    publicKeyStore: new MockPublicKeyStore(),
    privateKeyStore,
  };
}

async function retrieveIdentityPrivateKeyRef(): Promise<CryptoKey> {
  const activeIdKeyRef = envVar.get('ACTIVE_ID_KEY_REF').required().asString();
  const kms = await Kms.init();
  return kms.retrievePrivateKeyByRef(Buffer.from(activeIdKeyRef));
}

async function getIdentityPublicKey() {
  const activeIdPublicKeyBase64 = envVar.get('ACTIVE_ID_PUBLIC_KEY').required().asString();
  return derDeserializeRSAPublicKey(Buffer.from(activeIdPublicKeyBase64, 'base64'));
}

export class InternetEndpoint extends Endpoint {
  public static async getActive(dbConnection: Connection): Promise<InternetEndpoint> {
    const privateKey = await retrieveIdentityPrivateKeyRef();
    const publicKey = await getIdentityPublicKey();
    const endpointId = await getIdFromIdentityKey(publicKey);
    const internetAddress = envVar.get('INTERNET_ADDRESS').required().asString();
    const keyStoreSet = initKeyStoreSet(dbConnection);
    const config = new Config(dbConnection);
    return new InternetEndpoint(
      endpointId,
      internetAddress,
      { privateKey, publicKey },
      keyStoreSet,
      config,
    );
  }

  protected readonly channelConstructor = InternetPrivateEndpointChannel;

  public constructor(
    id: string,
    public readonly internetAddress: string,
    identityKeyPair: CryptoKeyPair,
    keyStores: KeyStoreSet,
    protected readonly config: Config,
  ) {
    super(id, identityKeyPair, keyStores, {});
  }

  public async saveChannel(
    connectionParams: PrivateEndpointConnParams,
    dbConnection: Connection,
  ): Promise<void> {
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
  }

  protected async retrieveInitialSessionKeyId(): Promise<Buffer | null> {
    const keyIdBase64 = await this.config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64);
    if (keyIdBase64 === null) {
      return null;
    }
    return Buffer.from(keyIdBase64, 'base64');
  }

  /**
   * Generate the initial session key if it doesn't exist yet.
   * @returns Whether the initial session key was created.
   */
  public async makeInitialSessionKeyIfMissing(): Promise<boolean> {
    const keyIdBase64 = await this.retrieveInitialSessionKeyId();
    if (keyIdBase64 !== null) {
      return false;
    }

    const { privateKey, sessionKey } = await SessionKeyPair.generate();
    await this.keyStores.privateKeyStore.saveSessionKey(privateKey, sessionKey.keyId, this.id);
    await this.config.set(
      ConfigKey.INITIAL_SESSION_KEY_ID_BASE64,
      sessionKey.keyId.toString('base64'),
    );
    return true;
  }

  public async retrieveInitialSessionPublicKey(): Promise<SessionKey> {
    const keyId = await this.retrieveInitialSessionKeyId();
    if (keyId === null) {
      throw new Error('Initial session key id is missing from config');
    }

    const publicKey = await this.keyStores.privateKeyStore.retrieveUnboundSessionKey(
      keyId,
      this.id,
    );
    return { keyId, publicKey };
  }

  public async getConnectionParams(): Promise<Buffer> {
    const initialSessionKey = await this.retrieveInitialSessionPublicKey();
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
