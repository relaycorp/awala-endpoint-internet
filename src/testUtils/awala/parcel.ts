import { randomUUID } from 'node:crypto';

import {
  type Certificate,
  CertificationPath,
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

import { ENDPOINT_ADDRESS } from './stubs.js';

interface GeneratedParcel {
  readonly parcelSerialized: Buffer;
  readonly parcel: Parcel;
}

function serializeMessage(pdaPath: CertificationPath, endpointInternetAddress: string): Buffer {
  const message = {
    id: randomUUID(),
    // eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
    pda_path: Buffer.from(pdaPath.serialize()).toString('base64'),
    // eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
    endpoint_internet_address: endpointInternetAddress,
  };
  return Buffer.from(JSON.stringify(message));
}
function generateServiceMessage(certificatePath: PDACertPath, messageType?: string): ArrayBuffer {
  const message = serializeMessage(
    new CertificationPath(certificatePath.pdaGrantee, [
      certificatePath.privateEndpoint,
      certificatePath.privateGateway,
    ]),
    ENDPOINT_ADDRESS,
  );
  const serviceMessage = new ServiceMessage(messageType ?? 'application/vnd.awala.test', message);
  return serviceMessage.serialize();
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
  certificatePath: PDACertPath,
  messageType?: string,
): Promise<Buffer> {
  const { envelopedData } = await SessionEnvelopedData.encrypt(
    generateServiceMessage(certificatePath, messageType),
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
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await (sessionKey
    ? generateParcelPayload(sessionKey, certificatePath, messageType)
    : generateSessionlessParcelPayload(certificatePath.privateEndpoint));

  const parcel = new Parcel(recipient, parcelSenderCertificate, parcelPayloadSerialized, {
    creationDate,
  });

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}
