/** Personal names are stored in capitals, as on the CS Form 212 (PDS), whichever screen or API wrote them. */
export const NAME_FIELDS = ['firstName', 'middleName', 'lastName', 'suffix'] as const;
export const NAME_MODELS = new Set(['Personnel', 'AccountCreationRequest']);

export const upperName = (value: string): string => value.replace(/\s+/g, ' ').trim().toLocaleUpperCase('en-PH');

/** Uppercase the name fields of one Prisma `data` object, including `{ set: '...' }` update forms. */
export const upperNameFields = (data: any): void => {
  if (!data || typeof data !== 'object') return;
  for (const field of NAME_FIELDS) {
    const value = data[field];
    if (typeof value === 'string') data[field] = upperName(value);
    else if (value && typeof value === 'object' && typeof value.set === 'string') value.set = upperName(value.set);
  }
};

/** Prisma middleware: applies to every write path, including those inside transactions. */
export const nameCaseMiddleware = async (params: any, next: (params: any) => Promise<any>) => {
  if (params.model && NAME_MODELS.has(params.model)) {
    const args = params.args || {};
    switch (params.action) {
      case 'create': case 'update': case 'updateMany': upperNameFields(args.data); break;
      case 'upsert': upperNameFields(args.create); upperNameFields(args.update); break;
      case 'createMany': (Array.isArray(args.data) ? args.data : [args.data]).forEach(upperNameFields); break;
    }
  }
  return next(params);
};
