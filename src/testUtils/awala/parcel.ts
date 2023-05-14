import {
  type Certificate,
  issueGatewayCertificate,
  Parcel,
  type Recipient,
  ServiceMessage,
  SessionEnvelopedData,
  type SessionKey,
} from '@relaycorp/relaynet-core';
import type { NodeKeyPairSet } from '@relaycorp/relaynet-testing';
import { addDays } from 'date-fns';

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
  keyPairSet: NodeKeyPairSet,
  creationDate: Date,
  sessionKey: SessionKey,
  messageType: string,
  messageContent: Buffer,
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await generateParcelPayload(
    sessionKey,
    messageContent,
    messageType,
  );

  const parcel = new Parcel(recipient, parcelSenderCertificate, parcelPayloadSerialized, {
    creationDate,
  });

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}
