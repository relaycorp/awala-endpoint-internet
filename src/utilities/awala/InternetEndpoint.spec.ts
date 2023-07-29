import { jest } from '@jest/globals';
import {
  type Certificate,
  CertificationPath,
  derDeserializeECDHPrivateKey,
  derSerializePrivateKey,
  derSerializePublicKey,
  generateRSAKeyPair,
  InvalidMessageError,
  issueEndpointCertificate,
  MockKeyStoreSet,
  NodeConnectionParams,
  Parcel,
  type PrivateKeyStore,
  type Recipient,
  SessionKeyPair,
  PrivateEndpointConnParams,
  getIdFromIdentityKey,
} from '@relaycorp/relaynet-core';
import { MongoCertificateStore, MongoPublicKeyStore } from '@relaycorp/awala-keystore-mongodb';
import { addMinutes, subSeconds } from 'date-fns';
import envVar from 'env-var';
import type { Connection } from 'mongoose';
import { generatePDACertificationPath } from '@relaycorp/relaynet-testing';
import { getModelForClass, type ReturnModelType } from '@typegoose/typegoose';

import { bufferToArrayBuffer } from '../buffer.js';
import { Config, ConfigKey } from '../config.js';
import { setUpTestDbConnection } from '../../testUtils/db.js';
import {
  ENDPOINT_ADDRESS,
  ENDPOINT_ID,
  ENDPOINT_ID_KEY_PAIR,
  ENDPOINT_ID_KEY_REF,
  ENDPOINT_ID_PUBLIC_KEY_DER,
  KEY_PAIR_SET,
  PEER_ADDRESS,
  PEER_KEY_PAIR,
} from '../../testUtils/awala/stubs.js';
import { getPromiseRejection, mockSpy } from '../../testUtils/jest.js';
import { mockKms } from '../../testUtils/kms/mockKms.js';
import { configureMockEnvVars } from '../../testUtils/envVars.js';
import { PeerEndpoint } from '../../models/PeerEndpoint.model.js';

import type { InternetEndpoint as InternetEndpointType } from './InternetEndpoint.js';

const mockCloudKeystoreInit = mockSpy(jest.fn<() => PrivateKeyStore>());
jest.unstable_mockModule('@relaycorp/awala-keystore-cloud', () => ({
  initPrivateKeystoreFromEnv: mockCloudKeystoreInit,
}));

// eslint-disable-next-line @typescript-eslint/naming-convention
const { InternetEndpoint } = await import('./InternetEndpoint.js');

const REQUIRED_ENV_VARS = {
  INTERNET_ADDRESS: ENDPOINT_ADDRESS,
  ACTIVE_ID_KEY_REF: ENDPOINT_ID_KEY_REF.toString(),
  ACTIVE_ID_PUBLIC_KEY: ENDPOINT_ID_PUBLIC_KEY_DER.toString('base64'),
  PRIVATE_KEY_STORE_ADAPTER: 'GCP',
};

function hexToBase64(keyIdHex: string) {
  return Buffer.from(keyIdHex, 'hex').toString('base64');
}

const getMockKms = mockKms();
const getDbConnection = setUpTestDbConnection();

const keyStores = new MockKeyStoreSet();
beforeEach(() => {
  keyStores.clear();
});

describe('getActive', () => {
  const mockEnvVars = configureMockEnvVars(REQUIRED_ENV_VARS);

  let dbConnection: Connection;
  beforeEach(() => {
    dbConnection = getDbConnection();

    mockCloudKeystoreInit.mockReturnValue(keyStores.privateKeyStore);
  });

  test.each(Object.keys(REQUIRED_ENV_VARS))('%s should be defined', async (envVarName) => {
    mockEnvVars({ ...REQUIRED_ENV_VARS, [envVarName]: undefined });

    await expect(InternetEndpoint.getActive(dbConnection)).rejects.toThrow(envVar.EnvVarError);
  });

  test('KMS should be initialised', async () => {
    const kmsInitMock = getMockKms();
    expect(kmsInitMock).not.toHaveBeenCalled();

    await InternetEndpoint.getActive(dbConnection);

    expect(kmsInitMock).toHaveBeenCalledOnce();
  });

  test('Internet address should be set', async () => {
    const { internetAddress } = await InternetEndpoint.getActive(dbConnection);

    expect(internetAddress).toBe(ENDPOINT_ADDRESS);
  });

  test('Private key should be loaded by reference from KMS', async () => {
    const {
      identityKeyPair: { privateKey },
    } = await InternetEndpoint.getActive(dbConnection);

    await expect(derSerializePrivateKey(privateKey)).resolves.toStrictEqual(
      await derSerializePrivateKey(ENDPOINT_ID_KEY_PAIR.privateKey),
    );
  });

  test('Id should be derived from public key', async () => {
    const { id } = await InternetEndpoint.getActive(dbConnection);

    expect(id).toBe(ENDPOINT_ID);
  });

  describe('Identity public key', () => {
    test('Key should be base64-decoded if ACTIVE_ID_PUBLIC_KEY is in DER format', async () => {
      const {
        identityKeyPair: { publicKey },
      } = await InternetEndpoint.getActive(dbConnection);

      await expect(derSerializePublicKey(publicKey)).resolves.toMatchObject(
        ENDPOINT_ID_PUBLIC_KEY_DER,
      );
    });

    test('Key should be converted to DER if ACTIVE_ID_PUBLIC_KEY is in PEM format', async () => {
      const publicKeyPem = [
        '-----BEGIN PUBLIC KEY-----',
        ENDPOINT_ID_PUBLIC_KEY_DER.toString('base64'),
        '-----END PUBLIC KEY-----',
      ].join('\n');
      mockEnvVars({ ...REQUIRED_ENV_VARS, ACTIVE_ID_PUBLIC_KEY: publicKeyPem });

      const {
        identityKeyPair: { publicKey },
      } = await InternetEndpoint.getActive(dbConnection);

      await expect(derSerializePublicKey(publicKey)).resolves.toMatchObject(
        ENDPOINT_ID_PUBLIC_KEY_DER,
      );
    });
  });

  describe('Key stores', () => {
    test('Certificate key store should be MongoDB one', async () => {
      const {
        keyStores: { certificateStore },
      } = await InternetEndpoint.getActive(dbConnection);

      expect(certificateStore).toBeInstanceOf(MongoCertificateStore);
    });

    test('Public key store should be MongoDB one', async () => {
      const manager = await InternetEndpoint.getActive(dbConnection);

      expect(manager.keyStores.publicKeyStore).toBeInstanceOf(MongoPublicKeyStore);
    });

    test('Private key store should be the cloud-based one', async () => {
      const manager = await InternetEndpoint.getActive(dbConnection);

      expect(mockCloudKeystoreInit).toHaveBeenCalledOnceWith(
        REQUIRED_ENV_VARS.PRIVATE_KEY_STORE_ADAPTER,
        dbConnection,
      );
      expect(manager.keyStores.privateKeyStore).toBe(keyStores.privateKeyStore);
    });
  });
});

describe('InternetEndpoint instance', () => {
  let config: Config;
  let endpoint: InternetEndpointType;
  let dbConnection: Connection;
  beforeEach(() => {
    dbConnection = getDbConnection();
    config = new Config(dbConnection);

    endpoint = new InternetEndpoint(
      ENDPOINT_ID,
      ENDPOINT_ADDRESS,
      ENDPOINT_ID_KEY_PAIR,
      keyStores,
      config,
    );
  });

  describe('makeInitialSessionKeyIfMissing', () => {
    test('Key should be generated if config item is unset', async () => {
      await expect(endpoint.makeInitialSessionKeyIfMissing()).resolves.toBeTrue();

      const { sessionKeys } = keyStores.privateKeyStore;
      const [[keyIdHex, keyData]] = Object.entries(sessionKeys);
      expect(keyData.nodeId).toBe(ENDPOINT_ID);
      expect(keyData.peerId).toBeUndefined();
      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toBe(
        hexToBase64(keyIdHex),
      );
    });

    test('Key should not be generated if config item is set', async () => {
      const { privateKey, sessionKey } = await SessionKeyPair.generate();
      const keyIdBase64 = sessionKey.keyId.toString('base64');
      await config.set(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64, keyIdBase64);
      await keyStores.privateKeyStore.saveSessionKey(privateKey, sessionKey.keyId, ENDPOINT_ID);

      await expect(endpoint.makeInitialSessionKeyIfMissing()).resolves.toBeFalse();

      expect(keyStores.privateKeyStore.sessionKeys).toHaveProperty(
        sessionKey.keyId.toString('hex'),
      );
      await expect(config.get(ConfigKey.INITIAL_SESSION_KEY_ID_BASE64)).resolves.toBe(keyIdBase64);
    });
  });

  describe('saveChannel', () => {
    let peerConnectionParams: PrivateEndpointConnParams;
    let peerEndpointModel: ReturnModelType<typeof PeerEndpoint>;

    beforeEach(async () => {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        pdaPath,
      );
      peerEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
    });

    test('Valid channel should be stored', async () => {
      await endpoint.saveChannel(peerConnectionParams, dbConnection);

      const peerId = await getIdFromIdentityKey(peerConnectionParams.identityKey);
      const peerEndpointCheckResult = await peerEndpointModel.exists({
        peerId,
        internetGatewayAddress: peerConnectionParams.internetGatewayAddress,
      });
      expect(peerEndpointCheckResult).not.toBeNull();
    });

    test('Save private endpoint channel method should be called', async () => {
      const spyOnSavePrivateEndpointChannel = jest.spyOn(endpoint, 'savePrivateEndpointChannel');

      await endpoint.saveChannel(peerConnectionParams, dbConnection);

      expect(spyOnSavePrivateEndpointChannel).toHaveBeenCalledWith(peerConnectionParams);
    });

    test('Resulting channel should returned', async () => {
      const result = await endpoint.saveChannel(peerConnectionParams, dbConnection);

      const peerId = await getIdFromIdentityKey(peerConnectionParams.identityKey);
      expect(result.peer.id).toBe(peerId);
      expect(result.node).toBe(endpoint);
    });
  });

  describe('getPeerChannel', () => {
    test('Channel should be returned if it exists', async () => {
      const certificatePath = await generatePDACertificationPath(KEY_PAIR_SET);
      const pdaPath = new CertificationPath(certificatePath.pdaGrantee, [
        certificatePath.privateEndpoint,
        certificatePath.privateGateway,
      ]);
      const peerConnectionParams = new PrivateEndpointConnParams(
        PEER_KEY_PAIR.privateGateway.publicKey,
        PEER_ADDRESS,
        pdaPath,
      );
      const privateEndpointChannel = await endpoint.savePrivateEndpointChannel(
        peerConnectionParams,
      );
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: privateEndpointChannel.peer.id,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const channel = await endpoint.getPeerChannel(privateEndpointChannel.peer.id, dbConnection);

      expect(channel?.peer.id).toBe(privateEndpointChannel.peer.id);
      expect(channel?.peer.internetAddress).toBe(PEER_ADDRESS);
      const checkPeerConnectionParams = new PrivateEndpointConnParams(
        channel!.peer.identityPublicKey,
        channel!.peer.internetAddress,
        channel!.deliveryAuthPath,
      );
      expect(Buffer.from(await peerConnectionParams.serialize())).toStrictEqual(
        Buffer.from(await checkPeerConnectionParams.serialize()),
      );
    });

    test('Missing peer from DB should return null', async () => {
      const channel = await endpoint.getPeerChannel('Non existing ID', dbConnection);

      expect(channel).toBeNull();
    });

    test('Missing peer from keystores should throw error', async () => {
      const testPeerId = 'TEST_PEER_ID';
      const privateEndpointModel = getModelForClass(PeerEndpoint, {
        existingConnection: dbConnection,
      });
      await privateEndpointModel.create({
        peerId: testPeerId,
        internetGatewayAddress: PEER_ADDRESS,
      });

      const error = await getPromiseRejection(
        async () => endpoint.getPeerChannel(testPeerId, dbConnection),
        Error,
      );

      expect(error.message).toBe(`Could not find channel for peer ${testPeerId}`);
    });
  });

  describe('getConnectionParams', () => {
    test('Error should be thrown if config item is unset', async () => {
      await expect(endpoint.getConnectionParams()).rejects.toThrowWithMessage(
        Error,
        'Initial session key id is missing from config',
      );
    });

    describe('Connection params', () => {
      test('Internet address should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        expect(connectionParams.internetAddress).toBe(ENDPOINT_ADDRESS);
      });

      test('Session public key should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        const { sessionKeys } = keyStores.privateKeyStore;
        const [[keyIdHex, keyData]] = Object.entries(sessionKeys);
        expect(connectionParams.sessionKey.keyId).toMatchObject(Buffer.from(keyIdHex, 'hex'));
        const expectedPrivateKey = await derDeserializeECDHPrivateKey(keyData.keySerialized);
        await expect(
          derSerializePublicKey(connectionParams.sessionKey.publicKey),
        ).resolves.toMatchObject(await derSerializePublicKey(expectedPrivateKey));
      });

      test('Identity public key should be included', async () => {
        await endpoint.makeInitialSessionKeyIfMissing();

        const connectionParamsSerialised = await endpoint.getConnectionParams();

        const connectionParams = await NodeConnectionParams.deserialize(
          bufferToArrayBuffer(connectionParamsSerialised),
        );
        await expect(derSerializePublicKey(connectionParams.identityKey)).resolves.toMatchObject(
          await derSerializePublicKey(ENDPOINT_ID_KEY_PAIR.publicKey),
        );
      });
    });
  });

  describe('validateMessage', () => {
    const payload = Buffer.from('payload');
    const recipient: Recipient = {
      id: ENDPOINT_ID,
      internetAddress: ENDPOINT_ADDRESS,
    };

    let senderCertificate: Certificate;
    beforeAll(async () => {
      const senderKeyPair = await generateRSAKeyPair();
      senderCertificate = await issueEndpointCertificate({
        issuerPrivateKey: senderKeyPair.privateKey,
        subjectPublicKey: senderKeyPair.publicKey,
        validityEndDate: addMinutes(new Date(), 1),
      });
    });

    test('Invalid parcel bound for correct Internet address should be refused', async () => {
      const expiredParcel = new Parcel(recipient, senderCertificate, payload, {
        creationDate: subSeconds(new Date(), 1),
        ttl: 0,
      });

      await expect(endpoint.validateMessage(expiredParcel)).rejects.toThrow(InvalidMessageError);
    });

    test('Valid parcel bound for no Internet address should be refused', async () => {
      const parcel = new Parcel(
        { ...recipient, internetAddress: undefined },
        senderCertificate,
        payload,
      );

      await expect(endpoint.validateMessage(parcel)).rejects.toThrowWithMessage(
        InvalidMessageError,
        'Parcel recipient is missing Internet address',
      );
    });

    test('Valid parcel bound for incorrect Internet address should be allowed', async () => {
      const otherInternetAddress = `not-${ENDPOINT_ADDRESS}`;
      const parcel = new Parcel(
        { ...recipient, internetAddress: otherInternetAddress },
        senderCertificate,
        payload,
      );

      await expect(endpoint.validateMessage(parcel)).rejects.toThrowWithMessage(
        InvalidMessageError,
        `Parcel is bound for different Internet address (${otherInternetAddress})`,
      );
    });

    test('Valid parcel bound for correct Internet address should be allowed', async () => {
      const parcel = new Parcel(recipient, senderCertificate, payload);

      await expect(endpoint.validateMessage(parcel)).toResolve();
    });
  });
});
