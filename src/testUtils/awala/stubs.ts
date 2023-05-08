import {
  derSerializePublicKey,
  generateRSAKeyPair,
  getIdFromIdentityKey,
} from '@relaycorp/relaynet-core';

export const ENDPOINT_ADDRESS = 'example.com';

export const ENDPOINT_ID_KEY_REF = Buffer.from('reference to KMS-managed key');

export const ENDPOINT_ID_KEY_PAIR = await generateRSAKeyPair();

export const ENDPOINT_ID_PUBLIC_KEY_DER = await derSerializePublicKey(
  ENDPOINT_ID_KEY_PAIR.publicKey,
);

export const ENDPOINT_ID = await getIdFromIdentityKey(ENDPOINT_ID_KEY_PAIR.publicKey);
