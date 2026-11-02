import {z} from 'zod';
import {defineContract,operation} from '@command-center/sdk/contracts';
export const contract=defineContract('NOTES',{
  read:operation(z.strictObject({}),z.array(z.strictObject({key:z.string(),text:z.string()}))),
  save:operation(z.strictObject({text:z.string().trim().min(1).max(10000)}),z.strictObject({saved:z.literal(true)}),true),
});
