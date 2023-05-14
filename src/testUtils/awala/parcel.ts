import {
  type Certificate,
  issueGatewayCertificate,
  Parcel,
  type Recipient,
  ServiceMessage,
  SessionEnvelopedData,
  type SessionKey,
  SessionlessEnvelopedData,
} from '@relaycorp/relaynet-core';
import type { NodeKeyPairSet, PDACertPath } from '@relaycorp/relaynet-testing';
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

async function generateSessionlessParcelPayload(
  recipientIdCertificate: Certificate,
): Promise<Buffer> {
  const serviceMessageEncrypted = await SessionlessEnvelopedData.encrypt(
    bufferToArrayBuffer(Buffer.from('Test')),
    recipientIdCertificate,
  );
  return Buffer.from(serviceMessageEncrypted.serialize());
}

async function generateParcelPayload(
  recipientSessionKey: SessionKey,
  messageContent: Buffer,
  messageType?: string,
): Promise<Buffer> {
  const serviceMessage = new ServiceMessage(
    messageType ?? 'application/vnd.awala.test',
    messageContent,
  );
  const { envelopedData } = await SessionEnvelopedData.encrypt(
    serviceMessage.serialize(),
    recipientSessionKey,
  );

  return Buffer.from(envelopedData.serialize());
}

export async function generateParcel(
  recipient: Recipient,
  certificatePath: PDACertPath,
  keyPairSet: NodeKeyPairSet,
  creationDate: Date,
  sessionKey?: SessionKey,
  messageType?: string,
  messageContent?: Buffer,
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await (sessionKey
    ? generateParcelPayload(sessionKey, messageContent ?? Buffer.from('test'), messageType)
    : generateSessionlessParcelPayload(certificatePath.privateEndpoint));

  const parcel = new Parcel(recipient, parcelSenderCertificate, parcelPayloadSerialized, {
    creationDate,
  });

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}
