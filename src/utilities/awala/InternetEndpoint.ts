import { Endpoint, type KeyStoreSet } from '@relaycorp/relaynet-core';

import type { Config } from '../config.js';

export class InternetEndpoint extends Endpoint {
  public constructor(
    id: string,
    identityPrivateKey: CryptoKey,
    keyStores: KeyStoreSet,
    public readonly config: Config,
  ) {
    super(id, identityPrivateKey, keyStores, {});
  }

  public async generateInitialSessionKeyIfMissing(): Promise<void> {
    throw new Error('Not implemented');
  }

  public async getConnectionParams(): Promise<ArrayBuffer> {
    throw new Error('Not implemented');
  }

  protected async getInitialSessionPublicKey(): Promise<CryptoKey> {
    throw new Error('Not implemented');
  }
}
