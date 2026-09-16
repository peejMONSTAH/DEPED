export function templateForRequirement(name: string): string | undefined {
  if (/justification|request|verification/i.test(name)) return undefined;
  if (/work experience/i.test(name)) return 'wes';
  if (/personal data sheet|\bpds\b|form.*212(?!.*attachment)/i.test(name)) return 'pds-2025';
  if (/omnibus/i.test(name)) return 'omnibus-2023';
  if (/saln|statement of assets/i.test(name)) return 'saln-2025';
  if (/oath of office|panunumpa/i.test(name)) return 'oath-2025';
  if (/medical certificate/i.test(name)) return 'medical-2025';
  if (/position description/i.test(name)) return 'position-2017';
  return undefined;
}
