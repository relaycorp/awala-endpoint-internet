import type { CloudEvent, EmitterFunction } from 'cloudevents';
import { makeEmitter } from '@relaycorp/cloudevents-transport';
import envVar from 'env-var';

const DEFAULT_TRANSPORT = 'ce-http-binary';

/**
 * Wrapper around CloudEvents Emitter.
 *
 * This initialises the underlying emitter lazily, to allow enough time for Knative Eventing to
 * patch the current container to inject the K_SINK environment variable.
 */
export class Emitter<Payload> {
  public static init(): Emitter<unknown> {
    // No processing needed, but this is implemented as a static method to facilitate unit testing
    return new Emitter();
  }

  protected emitterFunction: EmitterFunction | undefined;

  public async emit(event: CloudEvent<Payload>): Promise<void> {
    if (this.emitterFunction === undefined) {
      const transport = envVar.get('CE_TRANSPORT').default(DEFAULT_TRANSPORT).asString();
      this.emitterFunction = makeEmitter(transport);
    }
    await this.emitterFunction(event);
  }
}
