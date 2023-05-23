# Awala Internet Endpoint

This is a Message-Oriented Middleware (MOM) for server-side apps to communicate over [Awala](https://awala.network/) without implementing any of the networking or cryptography from the protocol suite.

## Installation and usage

Documentation for operators and app developers is available on [docs.relaycorp.tech](https://docs.relaycorp.tech/awala-endpoint-internet/).

## Development

This app requires the following system dependencies:

- Node.js 18.
- Kubernetes 1.22+ (we strongly recommend [Minikube](https://minikube.sigs.k8s.io/docs/start/) with Docker).
- [Knative](https://knative.dev/docs/install/quickstart-install/#install-the-knative-cli) v1.9+.
- [Skaffold](https://skaffold.dev/docs/install/) v2.1+.

To start the app, simply get Skaffold to deploy the [relevant Kubernetes resources](./k8s) by running `npm start`.

### Automated testing

The unit test suite can be run with the standard `npm test`.

If you'd like to run some tests against the real instance of the app managed by Skaffold, the simplest way to do that is to add/modify [functional tests](./src/functionalTests) and then run `npm run test:integration` (alternatively, you can use your IDE to only run the test you're interested in).

### Manual testing

If for whatever reason you want to manually test the app, you first need to get the local URLs to the services by running:

```
kn service list
```

## Contributions

We love contributions! If you haven't contributed to a Relaycorp project before, please take a minute to [read our guidelines](https://github.com/relaycorp/.github/blob/master/CONTRIBUTING.md) first.
