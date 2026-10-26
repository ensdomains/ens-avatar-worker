export const getErrorMessage = (e: unknown, prefix = "") => {
  if (e instanceof Error) return prefix + e.message;
  else if (typeof e === "string") return prefix + e;
  return prefix + JSON.stringify(e);
};
import {
  AbiDecodingDataSizeTooSmallError, AbiDecodingZeroDataError, BaseError,
  ContractFunctionRevertedError, ContractFunctionZeroDataError,
  ExecutionRevertedError, InvalidBytesBooleanError,
} from "viem";

export const isContractFailure = (error: unknown) => error instanceof BaseError && !!error.walk(
  cause => cause instanceof ExecutionRevertedError
    || cause instanceof ContractFunctionRevertedError
    || cause instanceof ContractFunctionZeroDataError
    || cause instanceof AbiDecodingDataSizeTooSmallError
    || cause instanceof AbiDecodingZeroDataError
    || cause instanceof InvalidBytesBooleanError,
);
