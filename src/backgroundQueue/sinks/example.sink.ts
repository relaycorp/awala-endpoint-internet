import { CloudEvent } from 'cloudevents';
import { SinkOptions } from './sinkTypes';
import { Emitter } from '../../utilities/eventing/Emitter';

interface ExampleEmitterPayload {
  testField: string;
}

export default async function exampleSink(
  event: CloudEvent<unknown>,
  options: SinkOptions,
): Promise<void> {
  options.logger.debug({ eventId: event.id }, 'Example event started');



  const emitter = Emitter.init() as Emitter<ExampleEmitterPayload>;

  const eventToBeSent = new CloudEvent({
    id: 'testID',
    source: 'https://veraid.net/authority/awala-member-key-import',
    type: 'testType',

    data: {
      testField: "test"
    },
  });
  await emitter.emit(eventToBeSent);
}
