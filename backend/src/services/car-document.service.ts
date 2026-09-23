import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

export interface CarDocumentResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

function escapeXml(unsafe: any): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateInput?: string | Date | null): string {
  if (!dateInput) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function sanitizeFilename(input: string): string {
  return input
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Replace the text of a single cell while preserving all formatting tags (<w:tcPr>, <w:pPr>, <w:rPr>).
 */
function setCellText(cellXml: string, text: string): string {
  const tcPrMatch = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
  const pPrMatch = cellXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/);
  const rPrMatch = cellXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/);

  const tcPr = tcPrMatch ? tcPrMatch[0] : '<w:tcPr/>';
  const pPr = pPrMatch ? pPrMatch[0] : '<w:pPr><w:jc w:val="center"/></w:pPr>';
  const rPr = rPrMatch ? rPrMatch[0] : '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="16"/></w:rPr>';

  const escaped = escapeXml(text);
  return `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p></w:tc>`;
}

export class CarDocumentService {
  /**
   * Generates an official Comparative Assessment Result (CAR) Microsoft Word document (.docx)
   * matching DepEd standards and the official template structure with dynamic applicant rows.
   */
  /**
   * `applicationScope` is the caller's scope filter: an export never contains
   * a row the caller could not open in the applications list.
   */
  public static async generateCarDocument(
    cycleId: number,
    applicationScope: Prisma.PromotionApplicationWhereInput,
  ): Promise<CarDocumentResult> {
    const cycle = await prisma.promotionCycle.findUnique({
      where: { id: cycleId },
      include: {
        promotionApplications: {
          where: applicationScope,
          include: { personnel: true },
          orderBy: [{ finalRank: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!cycle) {
      throw new Error('Promotion cycle not found.');
    }

    const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
    const track = rules.track === 'NON_TEACHING' ? 'NON_TEACHING' : 'TEACHING';
    const isTeaching = track === 'TEACHING';

    const templateFileName = isTeaching ? 'CAR-Teaching.docx' : 'CAR-NonTeaching.docx';
    const templatePath = path.join(__dirname, '..', '..', 'templates', templateFileName);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Master template file '${templateFileName}' not found on server.`);
    }

    const templateBinary = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(templateBinary);
    let docXml = zip.file('word/document.xml')?.asText();

    if (!docXml) {
      throw new Error('Invalid Word document template: word/document.xml is missing.');
    }

    // 1. Populate Header Fields in document.xml
    const position = rules.targetPosition || cycle.name || (isTeaching ? 'Teacher III' : 'Administrative Officer II');
    const plantillaNumber = rules.plantillaItemNumber || 'T-III-2026-001';
    const officeUnit = rules.officeUnit || 'Schools Division Office of Koronadal City';
    const finalDeliberationDate = formatDate(rules.dateOfFinalDeliberation || cycle.endDate || new Date());

    // Replace Position placeholders
    docXml = docXml.replace(/Position\s*:\s*_{5,}/g, `Position: ${escapeXml(position)}`);
    // Replace Plantilla Item Number placeholders
    docXml = docXml.replace(/Plantilla Item Number:\s*_{5,}/g, `Plantilla Item Number: ${escapeXml(plantillaNumber)}`);
    // Replace Office/Unit placeholders
    docXml = docXml.replace(/Office\/Unit where the vacancy exists:\s*_{2,}/g, `Office/Unit where the vacancy exists: ${escapeXml(officeUnit)}`);
    // Replace Date of Final Deliberation placeholders
    docXml = docXml.replace(/Date of Final Deliberation:\s*_{5,}/g, `Date of Final Deliberation: ${escapeXml(finalDeliberationDate)}`);

    // 2. Prepare Applicant Data
    const applications = cycle.promotionApplications || [];
    const mappedApplicants = applications.map((app, index) => {
      const details = (app.scoreDetailsJson as Record<string, any>) || {};
      const initialRating = details.initialRating || {};
      const finalRating = details.finalRating || {};

      const fullName = `${app.personnel?.firstName || ''} ${app.personnel?.lastName || ''}`.trim() || `Applicant #${index + 1}`;
      const appCode = details.applicantNumber || (app.personnel?.employeeId ? `APP-${app.personnel.employeeId}` : `APP-${String(app.id).padStart(4, '0')}`);

      const edu = Math.min(10, Math.max(0, Number(finalRating.educationScore ?? initialRating.educationScore ?? 10)));
      const train = Math.min(10, Math.max(0, Number(finalRating.trainingScore ?? initialRating.trainingScore ?? 10)));
      const exp = Math.min(10, Math.max(0, Number(finalRating.experienceScore ?? initialRating.experienceScore ?? 10)));
      const perf = Math.min(isTeaching ? 30 : 20, Math.max(0, Number(finalRating.performanceScore ?? initialRating.performanceScore ?? (isTeaching ? 30 : 20))));

      let totalScore = 0;
      let accomp = 0;
      let appEdu = 0;
      let appLd = 0;
      let coi = 0;
      let ncoi = 0;
      let potential = 0;

      if (isTeaching) {
        coi = Math.min(25, Math.max(0, Number(finalRating.ppstCoiScore ?? 25)));
        ncoi = Math.min(15, Math.max(0, Number(finalRating.ppstNcoiScore ?? 15)));
        totalScore = parseFloat((edu + train + exp + perf + coi + ncoi).toFixed(2));
      } else {
        accomp = Math.min(5, Math.max(0, Number(finalRating.outstandingAccomplishmentsScore ?? initialRating.outstandingAccomplishmentsScore ?? 5)));
        appEdu = Math.min(15, Math.max(0, Number(finalRating.applicationOfEducationScore ?? initialRating.applicationOfEducationScore ?? 15)));
        appLd = Math.min(10, Math.max(0, Number(finalRating.applicationOfLdScore ?? initialRating.applicationOfLdScore ?? 10)));
        const written = Number(finalRating.potentialWrittenScore ?? 5);
        const bei = Number(finalRating.potentialBeiScore ?? 5);
        const skills = Number(finalRating.potentialSkillsScore ?? 10);
        potential = Math.min(20, Math.max(0, Number(finalRating.potentialScore ?? (written + bei + skills))));
        totalScore = parseFloat((edu + train + exp + perf + accomp + appEdu + appLd + potential).toFixed(2));
      }

      const remarks = finalRating.hrmoRemarks || initialRating.aoRemarks || details.remarks || 'Meets DepEd Quality Standards';
      const biStatus = details.forBackgroundInvestigation || finalRating.forBackgroundInvestigation || 'YES';
      const appointment = details.forAppointment || finalRating.forAppointment || 'Recommended for Appointment';
      const probation = details.forProbation || finalRating.forProbation || '6 months';

      return {
        rank: app.finalRank || (index + 1),
        name: fullName,
        appCode,
        edu: edu.toFixed(2),
        train: train.toFixed(2),
        exp: exp.toFixed(2),
        perf: perf.toFixed(2),
        accomp: accomp.toFixed(2),
        appEdu: appEdu.toFixed(2),
        appLd: appLd.toFixed(2),
        coi: coi.toFixed(2),
        ncoi: ncoi.toFixed(2),
        potential: potential.toFixed(2),
        total: totalScore.toFixed(2),
        remarks,
        biYes: biStatus === 'YES' ? '✓' : '',
        biNo: biStatus === 'NO' ? '✓' : '',
        appointment,
        probation,
      };
    });

    // 3. Dynamic Table Rows Replacement
    // Locate the table in XML
    const tblRegex = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/;
    const tblMatch = docXml.match(tblRegex);

    if (tblMatch) {
      const originalTbl = tblMatch[0];
      const rowMatches = originalTbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      if (rowMatches.length >= 4) {
        // Headers are rows 0, 1, 2
        const headerRows = [rowMatches[0], rowMatches[1], rowMatches[2]];
        const templateRow = rowMatches[3]; // Clean applicant row archetype
        const cellArchetypes = templateRow.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];

        // Generate N rows for applicants
        const generatedRows: string[] = [];

        if (mappedApplicants.length === 0) {
          // Empty placeholder row
          generatedRows.push(templateRow);
        } else {
          mappedApplicants.forEach((app, i) => {
            let rowXml = templateRow;

            // Update row paraId to avoid XML collision
            const newParaId = (10000000 + i * 100).toString(16).toUpperCase();
            rowXml = rowXml.replace(/w14:paraId="[A-F0-9]+"/g, `w14:paraId="${newParaId}"`);

            const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];

            if (isTeaching && cells.length >= 15) {
              // Teaching Row (15 cells)
              const updatedCells = [
                setCellText(cells[0] || '', `${i + 1}.`),
                setCellText(cells[1] || '', app.name),
                setCellText(cells[2] || '', app.appCode),
                setCellText(cells[3] || '', app.edu),
                setCellText(cells[4] || '', app.train),
                setCellText(cells[5] || '', app.exp),
                setCellText(cells[6] || '', app.perf),
                setCellText(cells[7] || '', app.coi),
                setCellText(cells[8] || '', app.ncoi),
                setCellText(cells[9] || '', app.total),
                setCellText(cells[10] || '', app.remarks),
                setCellText(cells[11] || '', app.biYes),
                setCellText(cells[12] || '', app.biNo),
                setCellText(cells[13] || '', app.appointment),
                setCellText(cells[14] || '', app.probation),
              ];

              const trPrMatch = rowXml.match(/<w:trPr[\s\S]*?<\/w:trPr>/);
              const trPr = trPrMatch ? trPrMatch[0] : '';
              generatedRows.push(`<w:tr>${trPr}${updatedCells.join('')}</w:tr>`);
            } else if (!isTeaching && cells.length >= 17) {
              // Non-Teaching Row (17 cells)
              const updatedCells = [
                setCellText(cells[0] || '', `${i + 1}.`),
                setCellText(cells[1] || '', app.name),
                setCellText(cells[2] || '', app.appCode),
                setCellText(cells[3] || '', app.edu),
                setCellText(cells[4] || '', app.train),
                setCellText(cells[5] || '', app.exp),
                setCellText(cells[6] || '', app.perf),
                setCellText(cells[7] || '', app.accomp),
                setCellText(cells[8] || '', app.appEdu),
                setCellText(cells[9] || '', app.appLd),
                setCellText(cells[10] || '', app.potential),
                setCellText(cells[11] || '', app.total),
                setCellText(cells[12] || '', app.remarks),
                setCellText(cells[13] || '', app.biYes),
                setCellText(cells[14] || '', app.biNo),
                setCellText(cells[15] || '', app.appointment),
                setCellText(cells[16] || '', app.probation),
              ];

              const trPrMatch = rowXml.match(/<w:trPr[\s\S]*?<\/w:trPr>/);
              const trPr = trPrMatch ? trPrMatch[0] : '';
              generatedRows.push(`<w:tr>${trPr}${updatedCells.join('')}</w:tr>`);
            } else {
              generatedRows.push(rowXml);
            }
          });
        }

        // Reconstruct Table XML: tblPr, tblGrid, header rows, dynamic applicant rows
        const tblPrMatch = originalTbl.match(/<w:tblPr[\s\S]*?<\/w:tblPr>/);
        const tblGridMatch = originalTbl.match(/<w:tblGrid[\s\S]*?<\/w:tblGrid>/);

        const newTblXml = `<w:tbl>${tblPrMatch ? tblPrMatch[0] : ''}${tblGridMatch ? tblGridMatch[0] : ''}${headerRows.join('')}${generatedRows.join('')}</w:tbl>`;
        docXml = docXml.replace(tblRegex, () => newTblXml);
      }
    }

    // Write back to zip archive
    zip.file('word/document.xml', docXml);
    const generatedBuffer = zip.generate({ type: 'nodebuffer' });

    const safePosition = sanitizeFilename(position);
    const filename = `CAR-${isTeaching ? 'Teaching' : 'NonTeaching'}-${safePosition}-${cycle.id}.docx`;

    return {
      buffer: generatedBuffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
}
