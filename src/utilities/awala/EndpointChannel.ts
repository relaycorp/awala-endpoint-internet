import { Channel, type ServiceMessage } from '@relaycorp/relaynet-core';

export class EndpointChannel extends Channel<ServiceMessage, string> {}
