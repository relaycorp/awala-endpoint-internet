import {
  CertificationPath,
  type Channel,
  Endpoint,
  generateRSAKeyPair,
  getIdFromIdentityKey,
  issueEndpointCertificate,
  type KeyStoreSet,
  MockKeyStoreSet,
  type NodeCryptoOptions,
  type ServiceMessage,
} from '@relaycorp/relaynet-core';
import { addMinutes } from 'date-fns';

import { getConnectionParams } from './pohttp.js';
import { PrivateInternetEndpointChannel } from './PrivateInternetEndpointChannel.js';

const CONNECTION_PARAMS = await getConnectionParams();

export class PrivateEndpoint extends Endpoint {
  public static async generate(): Promise<PrivateEndpoint> {
    const identityKeyPair = await generateRSAKeyPair();
    const id = await getIdFromIdentityKey(identityKeyPair.publicKey);

    const certificate = await issueEndpointCertificate({
      issuerPrivateKey: identityKeyPair.privateKey,
      subjectPublicKey: identityKeyPair.publicKey,
      validityEndDate: addMinutes(new Date(), 1),
    });
    const pda = new CertificationPath(certificate, []);

    const keyStores = new MockKeyStoreSet();
    return new PrivateEndpoint(id, identityKeyPair, pda, keyStores, {});
  }

  public channelConstructor = PrivateInternetEndpointChannel;

  private constructor(
    id: string,
    identityKeyPair: CryptoKeyPair,
    protected readonly deliveryAuth: CertificationPath,
    keyStores: KeyStoreSet,
    cryptoOptions: Partial<NodeCryptoOptions>,
  ) {
    super(id, identityKeyPair, keyStores, cryptoOptions);
  }

  public async saveInternetEndpointChannel(): Promise<Channel<ServiceMessage, string>> {
    const peerId = await getIdFromIdentityKey(CONNECTION_PARAMS.identityKey);

    await this.keyStores.publicKeyStore.saveIdentityKey(CONNECTION_PARAMS.identityKey);

    await this.keyStores.publicKeyStore.saveSessionKey(
      CONNECTION_PARAMS.sessionKey,
      peerId,
      new Date(),
    );

    // eslint-disable-next-line new-cap
    return new this.channelConstructor(
      this,
      {
        id: peerId,
        internetAddress: CONNECTION_PARAMS.internetAddress,
        identityPublicKey: CONNECTION_PARAMS.identityKey,
      },
      this.deliveryAuth,
      this.keyStores,
      this.cryptoOptions,
    );
  }
}
