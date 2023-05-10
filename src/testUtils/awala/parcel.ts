import {
  Certificate,
  CertificationPath,
  issueGatewayCertificate,
  Parcel,
  Recipient,
  ServiceMessage,
  SessionlessEnvelopedData,
} from '@relaycorp/relaynet-core';
import { NodeKeyPairSet, PDACertPath } from '@relaycorp/relaynet-testing';
import uuid4 from 'uuid4';
import { bufferToArrayBuffer } from '../../utilities/buffer';
import { ENDPOINT_ADDRESS } from './stubs';

export async function generateStubNodeCertificate(
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

interface GeneratedParcel {
  readonly parcelSerialized: Buffer;
  readonly parcel: Parcel;
}

export async function generatePingParcel(
  recipient: Recipient,
  recipientIdCertificate: Certificate,
  keyPairSet: NodeKeyPairSet,
  certificatePath: PDACertPath,
  creationDate: Date | null = null,
): Promise<GeneratedParcel> {

  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await generatePingParcelPayload(
    certificatePath,
    recipientIdCertificate,
    recipient.internetAddress ?? ENDPOINT_ADDRESS ,
  );
  const parcel = new Parcel(
    recipient,
    parcelSenderCertificate,
    parcelPayloadSerialized,
    creationDate ? { creationDate } : {},
  );

  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}


async function generatePingParcelPayload(
  certificatePath: PDACertPath,
  recipientIdCertificate: Certificate,
  recipientInternetAddress: string,
): Promise<Buffer> {
  const serviceMessageSerialized = generatePingServiceMessage(
    certificatePath,
    recipientInternetAddress,
  );
  const serviceMessageEncrypted = await SessionlessEnvelopedData.encrypt(
    serviceMessageSerialized,
    recipientIdCertificate,
  );
  return Buffer.from(serviceMessageEncrypted.serialize());
}

export async function generateParcel(
  recipient: Recipient,
  keyPairSet: NodeKeyPairSet,
  creationDate: Date | null = null,
): Promise<GeneratedParcel> {
  const parcelSenderCertificate = await generateStubNodeCertificate(
    keyPairSet.privateEndpoint.publicKey,
    keyPairSet.privateEndpoint.privateKey,
  );
  const parcelPayloadSerialized = await generateParcelPayload(
    parcelSenderCertificate
  );
  const parcel = new Parcel(
    recipient,
    parcelSenderCertificate,
    parcelPayloadSerialized,
    creationDate ? { creationDate } : {},
  );
  const serialization = Buffer.from(await parcel.serialize(keyPairSet.privateEndpoint.privateKey));
  return { parcelSerialized: serialization, parcel };
}

export function serializeMessage(
  pdaPath: CertificationPath,
  endpointInternetAddress: string,
  id?: string,
): Buffer {
  if (id?.length === 0) {
    throw new Error('Ping id should not be empty');
  }

  const pingSerialized = {
    id: id ?? uuid4(),
    pda_path: Buffer.from(pdaPath.serialize()).toString('base64'),
    endpoint_internet_address: endpointInternetAddress,
  };
  return Buffer.from(JSON.stringify(pingSerialized));
}

export function generatePingServiceMessage(
  certificatePath: PDACertPath,
  endpointInternetAddress: string,
  pingId?: string,
): ArrayBuffer {
  const pingMessage = serializeMessage(
    new CertificationPath(certificatePath.pdaGrantee, [
      certificatePath.privateEndpoint,
      certificatePath.privateGateway,
    ]),
    endpointInternetAddress,
    pingId,
  );
  const serviceMessage = new ServiceMessage('application/vnd.awala.ping-v1.ping', pingMessage);
  return serviceMessage.serialize();
}

export async function generateParcelPayload(
  recipientIdCertificate: Certificate,
): Promise<Buffer> {

  const serviceMessageEncrypted = await SessionlessEnvelopedData.encrypt(
    // change this to hardcoded array buffer
    bufferToArrayBuffer(Buffer.from('Test')),
    recipientIdCertificate,
  );
  return Buffer.from(serviceMessageEncrypted.serialize());
}
