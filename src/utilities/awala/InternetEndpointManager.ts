import {
  derDeserializeRSAPublicKey,
  EndpointManager,
  getIdFromIdentityKey,
  type KeyStoreSet,
  MockCertificateStore,
  MockPublicKeyStore,
} from '@relaycorp/relaynet-core';
import { initPrivateKeystoreFromEnv } from '@relaycorp/awala-keystore-cloud';
import envVar from 'env-var';
import type { Connection } from 'mongoose';

import { Config } from '../config.js';
import { Kms } from '../kms/Kms.js';

import { InternetEndpoint } from './InternetEndpoint.js';

function initKeyStoreSet(dbConnection: Connection): KeyStoreSet {
  const privateKeyStoreAdapter = envVar.get('PRIVATE_KEY_STORE_ADAPTER').required().asString();
  const privateKeyStore = initPrivateKeystoreFromEnv(privateKeyStoreAdapter, dbConnection);
  return {
    certificateStore: new MockCertificateStore(),
    publicKeyStore: new MockPublicKeyStore(),
    privateKeyStore,
  };
}

export class InternetEndpointManager extends EndpointManager {
  public static async init(dbConnection: Connection): Promise<InternetEndpointManager> {
    const activeIdKeyRef = envVar.get('ACTIVE_ID_KEY_REF').required().asString();
    const activeIdPublicKeyBase64 = envVar.get('ACTIVE_ID_PUBLIC_KEY').required().asString();
    const activeEndpointInternetAddress = envVar.get('INTERNET_ADDRESS').required().asString();
    const kms = await Kms.init();
    const keyStoreSet = initKeyStoreSet(dbConnection);
    const config = new Config(dbConnection);
    return new InternetEndpointManager(
      Buffer.from(activeIdKeyRef),
      Buffer.from(activeIdPublicKeyBase64, 'base64'),
      activeEndpointInternetAddress,
      kms,
      config,
      keyStoreSet,
    );
  }

  public constructor(
    protected readonly activeEndpointIdKeyRef: Buffer,
    public readonly activeEndpointIdPublicKeyDer: Buffer,
    protected readonly activeEndpointInternetAddress: string,
    protected readonly kms: Kms,
    protected readonly config: Config,
    keyStoreSet: KeyStoreSet,
  ) {
    super(keyStoreSet);
  }

  public async getActiveEndpoint(): Promise<InternetEndpoint> {
    const privateKey = await this.kms.retrievePrivateKeyByRef(this.activeEndpointIdKeyRef);
    const publicKey = await derDeserializeRSAPublicKey(this.activeEndpointIdPublicKeyDer);
    const endpointId = await getIdFromIdentityKey(privateKey);
    return new InternetEndpoint(
      endpointId,
      this.activeEndpointInternetAddress,
      { privateKey, publicKey },
      this.keyStores,
      this.config,
    );
  }
}
