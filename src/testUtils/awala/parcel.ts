import {
  type Certificate,
  issueGatewayCertificate,
  Parcel,
  type Recipient,
  SessionlessEnvelopedData,
} from '@relaycorp/relaynet-core';
import type { NodeKeyPairSet } from '@relaycorp/relaynet-testing';
import { addDays } from 'date-fns';

import { bufferToArrayBuffer } from '../../utilities/buffer.js';

interface GeneratedParcel {
  readonly parcelSerialized: Buffer;
  readonly parcel: Parcel;
}
async function generateStubNodeCertificate(
  subjectPublicKey: CryptoKey,
  issuerPrivateKey: CryptoKey,
  options: Partial<{ readonly issuerCertificate: Certificate }> = {},
): Promise<Certificate> {
  const tomorrow = addDays(new Date(), 1);

  return issueGatewayCertificate({
    issuerCertificate: options.issuerCertificate,
    issuerPrivateKey,
    subjectPublicKey,
    validityEndDate: tomorrow,
  });
}

async function generateParcelPayload(recipientIdCertificate: Certificate): Promise<Buffer> {
  const serviceMessageEncrypted = await SessionlessEnvelopedData.encrypt(
    bufferToArrayBuffer(Buffer.from('Test')),
    recipientIdCertificate,
  );
  return Buffer.from(serviceMessageEncrypted.serialize());
}

export async function generateParcel(
  recipient: Recipient,
  recipientIdCertificate: Certificate,
  keyPairSet: NodeKeyPairSet,
  creationDate: Date | null = null,
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await generateParcelPayload(recipientIdCertificate);
  const parcel = new Parcel(
    recipient,
    parcelSenderCertificate,
    parcelPayloadSerialized,
    creationDate ? { creationDate } : {},
  );

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}
