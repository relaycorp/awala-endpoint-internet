import { KmsRsaPssProvider } from '@relaycorp/webcrypto-kms';
import { jest } from '@jest/globals';

import { NODEJS_PROVIDER } from '../webcrypto.js';
import { INTERNET_ENDPOINT_ID_KEY_PAIR, INTERNET_ENDPOINT_ID_KEY_REF } from '../awala/stubs.js';
import { bufferToArrayBuffer } from '../../utilities/buffer.js';

type SupportedFormat = Exclude<KeyFormat, 'jwk'>;

export class MockKmsRsaPssProvider extends KmsRsaPssProvider {
  public readonly close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  public readonly destroyKey = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  public async onSign(
    algorithm: RsaPssParams,
    key: CryptoKey,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return NODEJS_PROVIDER.sign(algorithm, key, data);
  }

  public async onVerify(
    algorithm: RsaPssParams,
    key: CryptoKey,
    signature: ArrayBuffer,
    data: ArrayBuffer,
  ): Promise<boolean> {
    return NODEJS_PROVIDER.verify(algorithm, key, signature, data);
  }

  public async onGenerateKey(
    algorithm: RsaHashedKeyGenParams,
    isExtractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKeyPair> {
    return NODEJS_PROVIDER.generateKey(algorithm, isExtractable, keyUsages);
  }

  public async onExportKey(format: SupportedFormat, key: CryptoKey): Promise<ArrayBuffer> {
    if (format === 'raw' && key === INTERNET_ENDPOINT_ID_KEY_PAIR.privateKey) {
      return bufferToArrayBuffer(INTERNET_ENDPOINT_ID_KEY_REF);
    }
    return NODEJS_PROVIDER.exportKey(format, key);
  }

  public async onImportKey(
    format: SupportedFormat,
    keyData: ArrayBuffer,
    algorithm: RsaHashedImportParams,
    isExtractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey> {
    if (format === 'raw' && Buffer.from(keyData).equals(INTERNET_ENDPOINT_ID_KEY_REF)) {
      return INTERNET_ENDPOINT_ID_KEY_PAIR.privateKey;
    }
    return NODEJS_PROVIDER.importKey(format, keyData, algorithm, isExtractable, keyUsages);
  }
}
