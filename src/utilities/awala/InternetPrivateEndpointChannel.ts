import { Channel, type ServiceMessage } from '@relaycorp/relaynet-core';

export class InternetPrivateEndpointChannel extends Channel<ServiceMessage, string> {}
