import type { FailureResult, Result, SuccessfulResult } from '../utilities/result.js';

export function requireSuccessfulResult<Type>(
  result: Result<Type, undefined>,
): asserts result is SuccessfulResult<Type> {
  expect(result.didSucceed).toBe(true);
}

export function requireFailureResult<FailureReason>(
  result: Result<undefined, FailureReason>,
): asserts result is FailureResult<FailureReason> {
  expect(result.didSucceed).toBe(false);
}
