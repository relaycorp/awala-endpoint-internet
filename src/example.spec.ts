import type { Connection } from 'mongoose';
import type { CloudEventV1 } from 'cloudevents';

import { setUpTestDbConnection } from './testUtils/db.js';
import { makeMockLogging, partialPinoLog } from './testUtils/logging.js';
import type { ServiceOptions } from './serviceTypes.js';
import { exampleFunctionWithEmitter, examplePromiseRejection } from './example.js';
import { mockEmitter } from './testUtils/eventing/mockEmitter.js';
import { getPromiseRejection } from './testUtils/jest.js';
import { mockInternetEndpoint } from './testUtils/awala/mockInternetEndpoint.js';
import { InternetEndpointManager } from './utilities/awala/InternetEndpointManager.js';
import { ENDPOINT_ADDRESS } from './testUtils/awala/stubs.js';

describe('example', () => {
  const getConnection = setUpTestDbConnection();

  const mockLogging = makeMockLogging();
  let connection: Connection;
  let serviceOptions: ServiceOptions;
  const getEvents = mockEmitter();
  beforeEach(() => {
    connection = getConnection();
    serviceOptions = {
      dbConnection: connection,
      logger: mockLogging.logger,
    };
  });

  test('Example success result', async () => {
    const isSuccess = await exampleFunctionWithEmitter(serviceOptions);

    expect(mockLogging.logs).toContainEqual(
      partialPinoLog('info', 'Event sent to app', { example: 'test' }),
    );

    expect(isSuccess).toBe(true);
    expect(getEvents()).toContainEqual(
      expect.objectContaining<
        Partial<
          CloudEventV1<{
            testField: string;
          }>
        >
      >({
        id: 'testId',
        source: 'https://veraid.net/test-example-source',
        type: 'testType',

        data: {
          testField: 'test',
        },
      }),
    );
  });

  test('Example promise rejection', async () => {
    const error = await getPromiseRejection(async () => examplePromiseRejection(), Error);
    expect(error).toHaveProperty('message', 'Example error');
  });

  describe('Example endpoint manager usage in tests', () => {
    mockInternetEndpoint(getConnection);

    test('Example endpoint manager usage in tests', async () => {
      const manager = await InternetEndpointManager.init(connection);
      const endpoint = await manager.getActiveEndpoint();
      expect(endpoint.internetAddress).toBe(ENDPOINT_ADDRESS);
    });
  });
});
