import {
  type Certificate,
  issueGatewayCertificate,
  Parcel,
  type Recipient, SessionEnvelopedData, SessionKey,
  SessionlessEnvelopedData,
} from '@relaycorp/relaynet-core';
import type { NodeKeyPairSet } from '@relaycorp/relaynet-testing';

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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return issueGatewayCertificate({
    issuerCertificate: options.issuerCertificate,
    issuerPrivateKey,
    subjectPublicKey,
    validityEndDate: tomorrow,
  });
}

async function generateSessionlessParcelPayload(recipientIdCertificate: Certificate): Promise<Buffer> {
  const serviceMessageEncrypted = await SessionlessEnvelopedData.encrypt(
    bufferToArrayBuffer(Buffer.from('Test')),
    recipientIdCertificate,
  );
  return Buffer.from(serviceMessageEncrypted.serialize());
}

async function generateParcelPayload(recipientSessionKey: SessionKey): Promise<Buffer> {
  const { envelopedData } = await SessionEnvelopedData.encrypt(
    bufferToArrayBuffer(Buffer.from('Test')),
    recipientSessionKey
  );

  return Buffer.from(envelopedData.serialize());
}

export async function generateParcel(
  recipient: Recipient,
  recipientIdCertificate: Certificate,
  keyPairSet: NodeKeyPairSet,
  creationDate: Date,
  sessionKey?: SessionKey
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );


  let parcelPayloadSerialized: Buffer;
  if(sessionKey){
    parcelPayloadSerialized = await generateParcelPayload(sessionKey);
  }else{
    parcelPayloadSerialized = await generateSessionlessParcelPayload(recipientIdCertificate);
  }

  const parcel = new Parcel(
    recipient,
    parcelSenderCertificate,
    parcelPayloadSerialized,
    { creationDate },
  );

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}
