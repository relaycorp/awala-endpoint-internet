import {
  Endpoint,
  type KeyStoreSet,
  NodeConnectionParams,
  type SessionKey,
  SessionKeyPair,
} from '@relaycorp/relaynet-core';

import { type Config, ConfigKey } from '../config.js';

export class InternetEndpoint extends Endpoint {
  public constructor(
    id: string,
    public readonly internetAddress: string,
    identityPrivateKey: CryptoKey,
    keyStores: KeyStoreSet,
    public readonly config: Config,
  ) {
    super(id, identityPrivateKey, keyStores, {});
  }

  protected async retrieveInitialSessionKeyId(): Promise<Buffer | null> {
    const keyIdBase64 = await this.config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64);
    if (keyIdBase64 === null) {
      return null;
    }
    return Buffer.from(keyIdBase64, 'base64');
  }

  public async makeInitialSessionKeyIfMissing(): Promise<void> {
    const keyIdBase64 = await this.retrieveInitialSessionKeyId();
    if (keyIdBase64 !== null) {
      return;
    }

    const { privateKey, sessionKey } = await SessionKeyPair.generate();
    await this.keyStores.privateKeyStore.saveSessionKey(privateKey, sessionKey.keyId, this.id);
    await this.config.set(
      ConfigKey.INITIAL_SESSION_KEY_ID_BASE64,
      sessionKey.keyId.toString('base64'),
    );
  }

  protected async retrieveInitialSessionPublicKey(): Promise<SessionKey> {
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
      await this.getIdentityPublicKey(),
      initialSessionKey,
    );
    return Buffer.from(await params.serialize());
  }
}
