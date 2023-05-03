import type { Connection } from 'mongoose';
import type { CloudEventV1 } from 'cloudevents';

import { setUpTestDbConnection } from './testUtils/db.js';
import { makeMockLogging, partialPinoLog } from './testUtils/logging.js';
import { requireFailureResult, requireSuccessfulResult } from './testUtils/result.js';
import type { ServiceOptions } from './serviceTypes.js';
import {
  exampleFunctionReturnFalse,
  exampleFunctionWithEmitter,
  examplePromiseRejection,
} from './example.js';
import { mockEmitter } from './testUtils/eventing/mockEmitter.js';
import { getPromiseRejection } from './testUtils/jest.js';

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
    const result = await exampleFunctionWithEmitter(serviceOptions);

    expect(mockLogging.logs).toContainEqual(
      partialPinoLog('info', 'Event sent to app', { example: 'test' }),
    );

    requireSuccessfulResult(result);
    expect(result.didSucceed).toBe(true);
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

  test('Example failure result', () => {
    const result = exampleFunctionReturnFalse();
    requireFailureResult(result);
    expect(result.didSucceed).toBe(false);
  });

  test('Example promise rejection', async () => {
    const error = await getPromiseRejection(async () => examplePromiseRejection(), Error);
    expect(error).toHaveProperty('message', 'Example error');
  });
});
