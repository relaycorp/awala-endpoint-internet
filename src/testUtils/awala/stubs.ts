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

export const PEER_KEY_PAIR = await generateIdentityKeyPairSet();

export const PEER_ADDRESS = 'private.example.com';

export const PEER_ID = await getIdFromIdentityKey(KEY_PAIR_SET.privateEndpoint.publicKey);

export const SERVICE_MESSAGE_CONTENT_TYPE = 'application/test';

export const SERVICE_MESSAGE_CONTENT = Buffer.from('Test');
