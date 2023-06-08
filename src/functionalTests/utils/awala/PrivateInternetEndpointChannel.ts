import {
  CertificationPath,
  Channel,
  issueDeliveryAuthorization,
  issueEndpointCertificate,
  PrivateEndpointConnParams,
  type ServiceMessage,
  SessionKeyPair,
} from '@relaycorp/relaynet-core';
import { addMinutes } from 'date-fns';

import { MOCK_GATEWAY_URL } from './mockGateway.js';

export class PrivateInternetEndpointChannel extends Channel<ServiceMessage, string> {
  public async issuePda(): Promise<Buffer> {
    const issuerCertificate = await issueEndpointCertificate({
      issuerPrivateKey: this.node.identityKeyPair.privateKey,
      subjectPublicKey: this.node.identityKeyPair.publicKey,
      validityEndDate: addMinutes(new Date(), 1),
    });
    const pda = await issueDeliveryAuthorization({
      issuerCertificate,
      issuerPrivateKey: this.node.identityKeyPair.privateKey,
      subjectPublicKey: this.peer.identityPublicKey,
      validityEndDate: issuerCertificate.expiryDate,
    });
    const pdaPath = new CertificationPath(pda, [issuerCertificate]);

    const sessionKeyPair = await SessionKeyPair.generate();
    await this.keyStores.privateKeyStore.saveSessionKey(
      sessionKeyPair.privateKey,
      sessionKeyPair.sessionKey.keyId,
      this.node.id,
      this.peer.id,
    );

    const params = new PrivateEndpointConnParams(
      this.node.identityKeyPair.publicKey,
      MOCK_GATEWAY_URL,
      pdaPath,
      sessionKeyPair.sessionKey,
    );
    return Buffer.from(await params.serialize());
  }
}
