import {z} from 'zod';
import type {Operation} from './core.ts';
export * from './core.ts';
export * from './builtins.ts';
import {contracts} from '../../../.generated/contracts.ts';
export {contracts};
export type FunctionName = keyof typeof contracts;
export type OperationName<F extends FunctionName> = keyof typeof contracts[F] & string;
export type OperationFor<F extends FunctionName, K extends OperationName<F>> = (typeof contracts)[F][K] extends Operation ? (typeof contracts)[F][K] : never;
export type InputFor<F extends FunctionName, K extends OperationName<F>> = z.input<OperationFor<F,K>['input']>;
export type OutputFor<F extends FunctionName, K extends OperationName<F>> = z.output<OperationFor<F,K>['output']>;
// REQ-QL-001: classify author APIs from literal registry metadata, never caller flags.
export type ClassifiedOperationName<F extends FunctionName, M extends boolean> = {
  [K in OperationName<F>]: (typeof contracts)[F][K] extends { mutating: M } ? K : never
}[OperationName<F>];
export type ReadOperationName<F extends FunctionName> = ClassifiedOperationName<F,false>;
export type WriteOperationName<F extends FunctionName> = ClassifiedOperationName<F,true>;
export function lookupOperation(functionName: string, operationName: string): Operation | undefined {
  if (!Object.hasOwn(contracts, functionName)) return undefined;
  const worker = contracts[functionName as FunctionName];
  return Object.hasOwn(worker, operationName) ? (worker as Record<string, Operation>)[operationName] : undefined;
}
