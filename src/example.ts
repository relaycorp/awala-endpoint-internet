import { CloudEvent } from 'cloudevents';

import type { ServiceOptions } from './serviceTypes.js';
import { Emitter } from './utilities/eventing/Emitter.js';

export async function exampleFunctionWithEmitter(options: ServiceOptions): Promise<boolean> {
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

  return true;
}

export async function examplePromiseRejection() {
  await Promise.reject(new Error('Example error'));
}

export const FOO = 'bar';
