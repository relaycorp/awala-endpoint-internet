import { CloudEvent } from 'cloudevents';

import type { ServiceOptions } from './serviceTypes.js';
import type { Result } from './utilities/result.js';
import { Emitter } from './utilities/eventing/Emitter.js';

export async function exampleFunctionWithEmitter(
  options: ServiceOptions,
): Promise<Result<undefined, undefined>> {
  const emitter = Emitter.init() as Emitter<{
    testField: string;
  }>;
  const eventToBeSent = new CloudEvent({
    id: 'testId',
    source: 'https://veraid.net/test-example-source',
    type: 'testType',

    data: {
      testField: 'test',
    },
  });
  await emitter.emit(eventToBeSent);

  options.logger.info({ example: 'test' }, 'Event sent to app');

  return {
    didSucceed: true,
  };
}

export async function examplePromiseRejection() {
  await Promise.reject(new Error('Example error'));
}

export function exampleFunctionReturnFalse(): Result<undefined, undefined> {
  return {
    didSucceed: false,
  };
}

export const FOO = 'bar';
