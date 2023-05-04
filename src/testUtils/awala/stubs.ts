import { generateRSAKeyPair, getIdFromIdentityKey } from '@relaycorp/relaynet-core';

export const INTERNET_ADDRESS = 'example.com';

export const INTERNET_ENDPOINT_ID_KEY_REF = Buffer.from('reference to KMS-managed key');

export const INTERNET_ENDPOINT_ID_KEY_PAIR = await generateRSAKeyPair();

export const INTERNET_ENDPOINT_ID = await getIdFromIdentityKey(
  INTERNET_ENDPOINT_ID_KEY_PAIR.publicKey,
);
