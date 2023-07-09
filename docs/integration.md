---
permalink: /integration
nav_order: 2
---

# App integration

The app sitting behind this middleware may be written in any language and run on any platform. The only requirement is that it can send and receive the CloudEvents described below, and transmit them in binary mode.

## Sending messages to gateways

Every outgoing service message MUST be sent as a CloudEvent with the following attributes:

- `specversion`: `1.0`
- `id`: The parcel id.
- `type`: `tech.relaycorp.awala.endpoint-internet.outgoing-service-message`
- `source`: The parcel sender's id, or the constant `https://relaycorp.tech/awala-endpoint-internet`.
- `subject`: The parcel recipient's id.
- `datacontenttype`: The content type of the service message.
- `data`: The service message.
- `time`: The creation time of the parcel.
- `expiry` (`Timestamp`, custom attribute): The time at which the parcel expires.

## Receiving messages from gateways

Every incoming service message is received as a CloudEvent with the following attributes:

- `specversion`: `1.0`
- `id`: The parcel id.
- `type`: `tech.relaycorp.awala.endpoint-internet.incoming-service-message`
- `source`: The parcel sender's id.
- `subject`: The parcel recipient's id.
- `datacontenttype`: The content type of the service message.
- `data`: The service message.
- `time`: The creation time of the parcel.
- `expiry` (`Timestamp`, custom attribute): The time at which the parcel expires.

## Dead Letter Channel

The [dead letter channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html) is a mechanism to handle messages that couldn't be delivered to their intended recipient. It's a common pattern in messaging systems, and you're highly encouraged to use it in production environments -- please refer to your broker's documentation on this topic (e.g., [Google PubSub](https://cloud.google.com/pubsub/docs/handling-failures)).

## Security considerations

Because there's no authentication mechanism between the middleware and the app, the app should be available in a private network, and be only accessible by the middleware or its broker. Such communication should also be encrypted; e.g., using TLS.

## Embrace asynchronous messaging

As a developer, you should embrace [asynchronous messaging](https://www.enterpriseintegrationpatterns.com/patterns/messaging/Messaging.html) and not try to emulate [Remote Procedure Calls (RPCs)](https://www.enterpriseintegrationpatterns.com/patterns/messaging/EncapsulatedSynchronousIntegration.html). Not just because this is the pattern employed by Awala, but also because it's a better pattern for distributed systems, as Hohpe and Woolf eloquently summarise in [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com):

   > Asynchronous messaging is fundamentally a pragmatic reaction to the problems of distributed systems. Sending a message does not require both systems to be up and ready at the same time. Furthermore, thinking about the communication in an asynchronous manner forces developers to recognize that working with a remote application is slower, which encourages design of components with high cohesion (lots of work locally) and low adhesion (selective work remotely).
