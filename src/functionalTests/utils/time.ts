import envVar from 'env-var';

const isCi = envVar.get('CI').default('false').asBool();
const CI_WAIT_FACTOR = 2;

const MILLISECONDS_IN_SECOND = 1000;

export async function sleep(seconds: number): Promise<void> {
  const milliseconds = seconds * MILLISECONDS_IN_SECOND;
  const waitMilliseconds = isCi ? milliseconds * CI_WAIT_FACTOR : milliseconds;
  // eslint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    setTimeout(resolve, waitMilliseconds);
  });
}
