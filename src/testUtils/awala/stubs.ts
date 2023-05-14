import { derSerializePublicKey, getIdFromIdentityKey } from '@relaycorp/relaynet-core';
import { generateIdentityKeyPairSet } from '@relaycorp/relaynet-testing';

export const ENDPOINT_ADDRESS = 'example.com';

export const ENDPOINT_ID_KEY_REF = Buffer.from('reference to KMS-managed key');

export const KEY_PAIR_SET = await generateIdentityKeyPairSet();

export const ENDPOINT_ID_KEY_PAIR = KEY_PAIR_SET.pdaGrantee;

export const ENDPOINT_ID_PUBLIC_KEY_DER = await derSerializePublicKey(
  ENDPOINT_ID_KEY_PAIR.publicKey,
);

export const ENDPOINT_ID = await getIdFromIdentityKey(ENDPOINT_ID_KEY_PAIR.publicKey);

export const SERVICE_MESSAGE_CONTENT = Buffer.from('Test');
