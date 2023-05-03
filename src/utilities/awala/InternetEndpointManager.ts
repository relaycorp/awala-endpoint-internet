import {
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
    const activeIdKeyRefBase64 = envVar.get('ACTIVE_ID_KEY_REF').required().asString();
    const activeIdKeyRef = Buffer.from(activeIdKeyRefBase64, 'base64');
    const kms = await Kms.init();
    const keyStoreSet = initKeyStoreSet(dbConnection);
    const config = new Config(dbConnection);
    return new InternetEndpointManager(activeIdKeyRef, kms, config, keyStoreSet);
  }

  public constructor(
    protected readonly activeEndpointIdKeyRef: Buffer,
    protected readonly kms: Kms,
    protected readonly config: Config,
    keyStoreSet: KeyStoreSet,
  ) {
    super(keyStoreSet);
  }

  public async getActiveEndpoint(): Promise<InternetEndpoint> {
    const privateKey = await this.kms.retrievePrivateKeyByRef(this.activeEndpointIdKeyRef);
    const endpointId = await getIdFromIdentityKey(privateKey);
    return new InternetEndpoint(endpointId, privateKey, this.keyStores, this.config);
  }
}
