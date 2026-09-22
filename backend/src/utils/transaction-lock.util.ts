import { Prisma } from '@prisma/client';

/** All document edits and workflow transitions lock the parent row first. */
export async function lockTransaction(db: Prisma.TransactionClient, id: number): Promise<void> {
  await db.$queryRaw`SELECT id FROM transactions WHERE id = ${id} FOR UPDATE`;
}

export const workflowConflict = (message: string) => Object.assign(new Error(message), { statusCode: 409, code: 'WORKFLOW_CONFLICT' });
