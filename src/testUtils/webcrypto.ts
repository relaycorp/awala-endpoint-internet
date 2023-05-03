import { Crypto } from '@peculiar/webcrypto';

import { RSA_PSS_IMPORT_ALGORITHM, RSA_PSS_KEY_USAGES } from '../utilities/webcrypto.js';

const F4_ARRAY = new Uint8Array([1, 0, 1]);
const RSA_PSS_CREATION_ALGORITHM: RsaHashedKeyGenParams = {
  ...RSA_PSS_IMPORT_ALGORITHM,
  modulusLength: 2048,
  publicExponent: F4_ARRAY,
};

export const NODEJS_PROVIDER = new Crypto().subtle;

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return NODEJS_PROVIDER.generateKey(RSA_PSS_CREATION_ALGORITHM, true, RSA_PSS_KEY_USAGES);
}

export async function derSerialisePrivateKey(key: CryptoKey): Promise<Buffer> {
  const serialisation = await NODEJS_PROVIDER.exportKey('pkcs8', key);
  return Buffer.from(serialisation);
}
