// Bounds measured on the pinned source pages rendered at 90 DPI. All coordinates
// are normalized to the complete page (including the annex margins), never a crop.
export type TemplateField = {
  key: string; label: string; page: number; x: number; y: number;
  width: number; height: number; size: number;
  type?: 'text' | 'multiline' | 'checkbox'; group?: string;
};
type Column = [key: string, label: string, left: number, right: number];
function sheet(width: number, height: number) {
  const box = (key: string, label: string, page: number, left: number, top: number, right: number, bottom: number, type: TemplateField['type'] = 'text'): TemplateField => ({
    key, label, page, x: left / width, y: top / height,
    width: (right - left) / width, height: (bottom - top) / height, size: 7, type,
  });
  const table = (prefix: string, page: number, tops: number[], columns: Column[]) => tops.slice(0, -1).flatMap((top, i) => columns.map(([key, label, left, right]) =>
    box(`${prefix}.${i + 1}.${key}`, `${label} ${i + 1}`, page, left + 2, top + 2, right - 2, tops[i + 1] - 2)));
  const check = (key: string, label: string, page: number, x: number, y: number, side = 7) => box(key, label, page, x, y, x + side, y + side, 'checkbox');
  return { box, table, check };
}
const { box: p, table: pt, check: pc } = sheet(675, 945);
const pds: TemplateField[] = [
  p('surname', 'Surname', 0, 190, 196, 584, 207),
  p('firstName', 'First name', 0, 190, 211, 466, 222),
  p('nameExtension', 'Name extension (Jr., Sr.)', 0, 526, 211, 584, 222),
  p('middleName', 'Middle name', 0, 190, 226, 584, 237),
  p('birthDate', 'Date of birth (mm/dd/yyyy)', 0, 190, 244, 301, 259),
  p('birthPlace', 'Place of birth', 0, 190, 265, 301, 277),
  pc('sex.male', 'Male', 0, 193, 283), pc('sex.female', 'Female', 0, 261, 283),
  ...[['single', 'Single', 193, 297], ['married', 'Married', 261, 297], ['widowed', 'Widowed', 193, 307], ['separated', 'Separated', 261, 307], ['other', 'Other civil status', 193, 317]].map(([key, label, x, y]) => pc(`civilStatus.${key}`, String(label), 0, Number(x), Number(y))),
  pc('citizenship.filipino', 'Filipino', 0, 418, 245), pc('citizenship.dual', 'Dual citizenship', 0, 462, 245),
  pc('citizenship.birth', 'Dual citizenship by birth', 0, 474, 255), pc('citizenship.naturalization', 'Dual citizenship by naturalization', 0, 511, 255),
  p('citizenship.country', 'Country of dual citizenship', 0, 413, 278, 565, 291),
  ...[['height', 'Height (m)'], ['weight', 'Weight (kg)'], ['bloodType', 'Blood type'], ['gsis', 'UMID ID number'], ['pagibig', 'Pag-IBIG ID number'], ['philhealth', 'PhilHealth number'], ['sss', 'PhilSys number (PSN)'], ['tin', 'TIN'], ['agencyEmployeeNo', 'Agency employee number']].map(([key, label], i) => p(key, label, 0, 190, 330 + i * 16.3, 301, 342 + i * 16.3)),
  ...[['residential', 297], ['permanent', 360]].flatMap(([prefix, top]) => {
    const y = Number(top);
    return [p(`${prefix}.house`, 'House/block/lot number', 0, 377, y, 478, y + 9), p(`${prefix}.street`, 'Street', 0, 482, y, 584, y + 9),
      p(`${prefix}.subdivision`, 'Subdivision/village', 0, 377, y + 16, 478, y + 25), p(`${prefix}.barangay`, 'Barangay', 0, 482, y + 16, 584, y + 25),
      p(`${prefix}.city`, 'City/municipality', 0, 377, y + 32, 478, y + 41), p(`${prefix}.province`, 'Province', 0, 482, y + 32, 584, y + 41),
      p(`${prefix}Zip`, `${prefix === 'residential' ? 'Residential' : 'Permanent'} ZIP code`, 0, 377, y + 48, 584, y + 59)];
  }),
  ...[['telephone', 'Telephone'], ['mobile', 'Mobile number'], ['email', 'Email address']].map(([key, label], i) => p(key, label, 0, 377, 428 + i * 16.3, 584, 439 + i * 16.3)),
  p('spouse.surname', 'Spouse surname', 0, 190, 488, 371, 498), p('spouse.first', 'Spouse first name', 0, 190, 501, 301, 511),
  p('spouse.extension', 'Spouse name extension', 0, 348, 502, 371, 512), p('spouse.middle', 'Spouse middle name', 0, 190, 516, 371, 526),
  ...[['occupation', 'Spouse occupation'], ['employer', 'Spouse employer/business'], ['address', 'Spouse business address'], ['phone', 'Spouse telephone']].map(([key, label], i) => p(`spouse.${key}`, label, 0, 190, 530 + i * 14, 371, 540 + i * 14)),
  ...pt('child', 0, Array.from({length: 13}, (_, i) => 499 + i * 14), [['name', 'Child name', 374, 513], ['birth', 'Child birth date', 513, 587]]),
  p('father.surname', 'Father surname', 0, 190, 586, 371, 596), p('father.first', 'Father first name', 0, 190, 600, 301, 610),
  p('father.extension', 'Father name extension', 0, 348, 600, 371, 610), p('father.middle', 'Father middle name', 0, 190, 614, 371, 624),
  p('mother.surname', 'Mother maiden surname', 0, 190, 642, 371, 652), p('mother.first', 'Mother first name', 0, 190, 656, 371, 666), p('mother.middle', 'Mother middle name', 0, 190, 670, 371, 679),
  ...pt('education', 0, [724, 742, 761, 780, 799, 818], [['school', 'School', 188, 304], ['degree', 'Degree/course', 304, 411], ['from', 'Attendance from', 411, 440], ['to', 'Attendance to', 440, 469], ['units', 'Highest level/units earned', 469, 513], ['graduated', 'Year graduated', 513, 549], ['honors', 'Scholarship/honors', 549, 587]]),
  ...pt('eligibility', 1, [118, 138, 158, 178, 198, 218, 238, 258], [['title', 'Eligibility', 117, 268], ['rating', 'Rating', 268, 321], ['date', 'Exam date', 321, 377], ['place', 'Exam place', 377, 450], ['license', 'License number', 450, 495], ['valid', 'License valid until', 495, 542]]),
  ...pt('work', 1, Array.from({length: 29}, (_, i) => 324 + i * 17.55), [['from', 'Employment from', 115, 152], ['to', 'Employment to', 154, 192], ['position', 'Position title', 195, 317], ['office', 'Department/agency', 321, 446], ['status', 'Appointment status', 450, 490], ['government', 'Government service (Y/N)', 496, 538]]),
  ...pt('voluntary', 2, [160, 177, 194, 211, 227, 244, 261, 277], [['organization', 'Organization and address', 126, 322], ['from', 'Voluntary work from', 322, 358], ['to', 'Voluntary work to', 358, 392], ['hours', 'Hours', 392, 428], ['work', 'Position/nature of work', 428, 582]]),
  ...pt('training', 2, Array.from({length:22}, (_, i) => 329 + i * 14.76), [['title', 'Training title', 126, 322], ['from', 'Training from', 322, 358], ['to', 'Training to', 358, 392], ['hours', 'Hours', 392, 428], ['type', 'Type of learning/development', 428, 466], ['sponsor', 'Sponsor', 466, 582]]),
  ...pt('skill', 2, [680, 695, 710, 725, 740, 755, 769, 784], [['value', 'Special skill/hobby', 126, 240], ['recognition', 'Recognition', 240, 466], ['membership', 'Membership', 466, 582]]),
  ...[['34a', 392, 439, 156], ['34b', 392, 439, 169], ['35a', 390, 441, 204], ['35b', 390, 443, 242], ['36', 390, 445, 289], ['37', 390, 445, 325], ['38a', 390, 449, 357], ['38b', 390, 449, 380], ['39', 390, 449, 406], ['40a', 390, 450, 471], ['40b', 390, 450, 490], ['40c', 390, 450, 510]].flatMap(([q, x1, x2, y]) => [pc(`q${q}.yes`, `Question ${q}: Yes`, 3, Number(x1)-3, Number(y)), pc(`q${q}.no`, `Question ${q}: No`, 3, Number(x2)-3, Number(y))]),
  ...[['34', 186, 196], ['35a', 222, 233], ['36', 308, 318], ['37', 339, 349], ['38a', 369, 378], ['38b', 392, 401], ['39', 423, 434]].map(([q, top, bottom]) => p(`q${q}.details`, `Question ${q}: details`, 3, 394, Number(top), 538, Number(bottom))),
  p('q35b.filed', 'Criminal case date filed', 3, 445, 259, 538, 269), p('q35b.status', 'Criminal case status', 3, 445, 272, 538, 282),
  p('q40a.details', 'Indigenous group', 3, 474, 478, 538, 487), p('q40b.details', 'PWD ID number', 3, 474, 498, 538, 507), p('q40c.details', 'Solo parent ID number', 3, 474, 517, 538, 526),
  ...pt('reference', 3, [559, 575, 593, 610], [['name', 'Reference name', 94, 270], ['address', 'Reference address', 270, 377], ['contact', 'Reference contact', 377, 433]]),
  p('governmentId', 'Government-issued ID', 3, 174, 693, 255, 704), p('idNumber', 'ID/license/passport number', 3, 174, 707, 255, 718), p('idDatePlace', 'Date/place of issuance', 3, 174, 722, 255, 734),
  p('dateAccomplished', 'Date accomplished', 3, 274, 720, 429, 728),
];

const { box: w } = sheet(745, 1053);
const wes = [0, 1].flatMap(i => {
  const offset = i * 369;
  return [w(`work.${i}.duration`, 'Duration', 0, 122, 193 + offset, 687, 210 + offset), w(`work.${i}.position`, 'Position', 0, 122, 225 + offset, 687, 242 + offset),
    w(`work.${i}.office`, 'Office/unit', 0, 180, 257 + offset, 687, 274 + offset), w(`work.${i}.supervisor`, 'Immediate supervisor', 0, 195, 289 + offset, 687, 306 + offset),
    w(`work.${i}.agency`, 'Agency/organization and location', 0, 301, 320 + offset, 687, 338 + offset),
    w(`work.${i}.accomplishments`, 'Accomplishments and contributions', 0, 63, 376 + offset, 685, 431 + offset, 'multiline'),
    w(`work.${i}.duties`, 'Summary of actual duties', 0, 63, 454 + offset, 685, 515 + offset, 'multiline')];
});
wes.push(w('signatureDate', 'Date signed', 0, 478, 1000, 615, 1014));

const { box: o, check: oc } = sheet(745, 1053);
const omnibus = [
  o('name', 'Name of applicant', 0, 127, 73, 260, 82), o('applicationCode', 'Application code', 0, 436, 73, 570, 82),
  o('position', 'Position applied for', 0, 138, 85, 260, 94), o('office', 'Office of position applied for', 0, 189, 97, 317, 106),
  o('contact', 'Contact number', 0, 119, 109, 233, 118), o('religion', 'Religion', 0, 83, 121, 180, 130), o('ethnicity', 'Ethnicity', 0, 85, 133, 180, 142),
  oc('pwd.yes', 'Person with disability: Yes', 0, 165, 145), oc('pwd.no', 'Person with disability: No', 0, 207, 145),
  oc('soloParent.yes', 'Solo parent: Yes', 0, 112, 157), oc('soloParent.no', 'Solo parent: No', 0, 161, 157),
];

const { box: s, table: st, check: sc } = sheet(765, 1170);
const realColumns: Column[] = [['description', 'Property description', 35, 119], ['kind', 'Kind', 119, 215], ['location', 'Exact location', 215, 357], ['assessed', 'Assessed value', 357, 429], ['fair', 'Fair market value', 429, 525], ['year', 'Acquisition year', 525, 569], ['mode', 'Acquisition mode', 569, 631], ['cost', 'Acquisition cost', 631, 739]];
const personalColumns: Column[] = [['description', 'Personal property', 35, 513], ['year', 'Acquisition year', 513, 631], ['cost', 'Cost/amount', 631, 739]];
const liabilityColumns: Column[] = [['nature', 'Liability', 32, 299], ['creditor', 'Creditor', 299, 592], ['balance', 'Outstanding balance', 592, 739]];
const businessColumns: Column[] = [['name', 'Business/entity', 41, 206], ['address', 'Business address', 206, 389], ['nature', 'Nature of business interest', 389, 573], ['date', 'Acquisition date', 573, 739]];
const saln = [
  sc('filing.assumption', 'Assumption of office', 0, 69, 126), s('filing.assumptionDate', 'Assumption date', 0, 225, 123, 290, 135),
  sc('filing.annual', 'Annual filing', 0, 311, 126), s('filing.year', 'Annual filing year', 0, 506, 123, 535, 135),
  sc('filing.exit', 'Exit', 0, 553, 126), s('filing.exitDate', 'Exit date', 0, 617, 123, 678, 135),
  s('declarant', 'Declarant full name', 0, 121, 169, 404, 183), s('declarant.address', 'Declarant address', 0, 121, 200, 404, 212),
  s('position', 'Position', 0, 550, 172, 735, 184), s('agency', 'Agency/office', 0, 550, 186, 735, 198), s('officeAddress', 'Office address', 0, 550, 200, 735, 212),
  s('spouse', 'Spouse full name', 0, 121, 228, 404, 241), s('spouse.address', 'Spouse address', 0, 121, 257, 404, 269),
  s('spousePosition', 'Spouse position', 0, 550, 229, 735, 241), s('spouseAgency', 'Spouse agency/office', 0, 550, 243, 735, 255), s('spouseOfficeAddress', 'Spouse office address', 0, 550, 257, 735, 269),
  sc('filing.joint', 'Joint filing', 0, 69, 325), sc('filing.separate', 'Separate filing', 0, 204, 325), sc('filing.na', 'Filing arrangement: not applicable', 0, 339, 325),
  s('multipleSpouses', 'Spouses in multiple marriages', 0, 60, 365, 348, 376), sc('multipleSpouses.na', 'Multiple marriages: not applicable', 0, 429, 368),
  ...st('child', 0, [474, 489, 503, 519], [['name', 'Child name', 50, 505], ['age', 'Child age', 579, 697]]),
  ...st('realProperty', 0, [688, 724, 758, 792, 827], realColumns),
  ...st('personalProperty', 0, [900, 919, 937, 956, 975, 993, 1012], personalColumns),
  s('realSubtotal', 'Real properties subtotal', 0, 634, 831, 736, 844), s('personalSubtotal', 'Personal properties subtotal', 0, 634, 1017, 736, 1030), s('totalAssets', 'Total assets', 0, 634, 1035, 736, 1048),
  ...st('liability', 1, [59, 77, 95, 113, 131], liabilityColumns),
  s('totalLiabilities', 'Total liabilities', 1, 595, 135, 735, 147), s('netWorth', 'Net worth', 1, 595, 155, 735, 168),
  sc('business.none', 'No business interests', 1, 190, 238), ...st('business', 1, [298, 318, 339, 359], businessColumns),
  sc('relatives.none', 'No relatives in government service', 1, 194, 419), ...st('relative', 1, [453, 470, 487, 504, 521, 538], [['name', 'Relative name', 41, 226], ['relationship', 'Relationship', 226, 361], ['position', 'Position', 361, 468], ['agency', 'Agency/address', 468, 739]]),
  s('date', 'Date', 1, 114, 752, 294, 765), s('governmentId', 'Government-issued ID', 1, 190, 826, 364, 838), s('idNumber', 'ID number', 1, 190, 840, 364, 852), s('idDate', 'ID date issued', 1, 190, 853, 364, 865),
  ...[2, 3].flatMap(page => {
    const offset = page === 3 ? 28 : 0;
    return [s(`annex.${page}.date`, 'As of date', page, 302, 120, 499, 133), s(`annex.${page}.name`, 'Name', page, 121, 170 + offset, 404, 183 + offset),
      s(`annex.${page}.position`, 'Position', page, 543, 170 + offset, 731, 183 + offset), s(`annex.${page}.agency`, 'Agency/office', page, 543, 184 + offset, 731, 197 + offset),
      ...st(`annex.${page}.real`, page, [365, 417, 469, 520, 572].map(y => y + offset), realColumns),
      ...st(`annex.${page}.personal`, page, [652, 671, 690, 709, 728].map(y => y + offset), personalColumns),
      ...st(`annex.${page}.liability`, page, page === 2 ? [819, 837, 855, 873, 890] : [825, 843, 861, 879, 896], liabilityColumns),
      ...st(`annex.${page}.business`, page, page === 2 ? [1007, 1027, 1047, 1067] : [1010, 1030, 1050, 1070], businessColumns)];
  }),
];

const templates: Record<string, TemplateField[]> = {
  'pds-2025': pds, wes, 'omnibus-2023': omnibus, 'saln-2025': saln,
  'medical-2025': [p('name', 'Full name', 0, 76, 391, 401, 413), p('agency', 'Agency/address', 0, 407, 391, 580, 450, 'multiline'),
    p('address', 'Address', 0, 76, 428, 401, 450), p('age', 'Age', 0, 76, 465, 148, 487), p('sex', 'Sex', 0, 154, 465, 239, 487),
    p('civilStatus', 'Civil status', 0, 244, 465, 401, 487), p('position', 'Proposed position', 0, 407, 469, 580, 487)],
  'oath-2025': [p('agency', 'Agency name', 0, 263, 188, 429, 202), p('name', 'Name of appointee', 0, 177, 288, 344, 300),
    p('address', 'Address', 0, 370, 288, 499, 300), p('position', 'Position', 0, 186, 320, 324, 332),
    p('governmentId', 'Government ID', 0, 174, 702, 235, 711), p('idNumber', 'ID number', 0, 168, 714, 243, 723), p('idDatePlace', 'Date issued', 0, 207, 725, 269, 734)],
  'position-2017': [p('positionTitle', 'Position title', 0, 333, 140, 581, 183, 'multiline'), p('itemNumber', 'Item number', 0, 77, 200, 327, 233), p('salaryGrade', 'Salary grade', 0, 333, 200, 581, 233),
    p('agency', 'Department/agency/LGU', 0, 77, 331, 327, 364), p('bureau', 'Bureau or office', 0, 333, 331, 581, 364),
    p('division', 'Department/branch/division', 0, 77, 381, 327, 414), p('workstation', 'Workstation/place of work', 0, 333, 381, 581, 414),
    p('presentAppropriation', 'Present appropriation act', 0, 77, 432, 191, 464), p('previousAppropriation', 'Previous appropriation act', 0, 197, 432, 327, 464),
    p('salary', 'Salary authorized', 0, 333, 432, 450, 464), p('otherCompensation', 'Other compensation', 0, 456, 432, 581, 464),
    p('immediateSupervisor', 'Immediate supervisor position', 0, 77, 484, 327, 516), p('nextSupervisor', 'Next higher supervisor position', 0, 333, 484, 581, 516),
    p('supervisedTitles', 'Directly supervised position titles', 0, 77, 558, 327, 590, 'multiline'), p('supervisedItems', 'Directly supervised item numbers', 0, 333, 558, 581, 590, 'multiline'),
    p('equipment', 'Machines/equipment/tools used', 0, 77, 608, 581, 640, 'multiline'), p('unitFunction', 'General function of unit/section', 0, 77, 770, 581, 802, 'multiline'),
    p('jobSummary', 'General function of position', 1, 94, 87, 600, 270, 'multiline'),
    p('education', 'Qualification: education', 1, 94, 300, 207, 377, 'multiline'), p('experience', 'Qualification: experience', 1, 214, 300, 345, 377, 'multiline'),
    p('training', 'Qualification: training', 1, 352, 300, 467, 377, 'multiline'), p('eligibility', 'Qualification: eligibility', 1, 474, 300, 600, 377, 'multiline'),
    p('workPercentage', 'Percentage of working time', 1, 94, 609, 207, 662, 'multiline'), p('duties', 'Duties and responsibilities', 1, 214, 609, 467, 662, 'multiline'),
  ],
};
export function fieldsForTemplate(templateId?: string) { return templateId ? templates[templateId] || [] : []; }

export function fieldEntryId(field: TemplateField, outputPage: number, pages: number[]) {
  return pages.indexOf(field.page) === outputPage ? `field:${field.key}` : `field:${field.key}:copy:${outputPage}`;
}
