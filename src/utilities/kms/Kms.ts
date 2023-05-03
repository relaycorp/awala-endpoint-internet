import type { KmsRsaPssProvider } from '@relaycorp/webcrypto-kms';

import { bufferToArrayBuffer } from '../buffer.js';
import { RSA_PSS_KEY_USAGES, RSA_PSS_IMPORT_ALGORITHM } from '../webcrypto.js';

import { getKmsProvider } from './provider.js';

export class Kms {
  public static async init(): Promise<Kms> {
    const provider = await getKmsProvider();
    return new Kms(provider);
  }

  public constructor(protected readonly provider: KmsRsaPssProvider) {}

  public async retrievePrivateKeyByRef(ref: Buffer): Promise<CryptoKey> {
    const keyRaw = bufferToArrayBuffer(ref);
    return this.provider.importKey(
      'raw',
      keyRaw,
      RSA_PSS_IMPORT_ALGORITHM,
      true,
      RSA_PSS_KEY_USAGES,
    );
  }
}
