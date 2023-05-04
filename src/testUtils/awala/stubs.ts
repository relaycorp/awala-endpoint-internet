import { generateRSAKeyPair } from '@relaycorp/relaynet-core';

export const INTERNET_ENDPOINT_ID_KEY_PAIR = await generateRSAKeyPair();
