import { useEffect, useState } from 'react';
import type { PDFFont } from 'pdf-lib';
import type { TemplateField } from './formFields';
import { getFieldFont, layoutField } from './fieldLayout';

export function FieldOverlay({ field, text, pageWidth, pageHeight, selected, onClick }: {
  field: TemplateField; text: string; pageWidth: number; pageHeight: number; selected: boolean; onClick: () => void;
}) {
  const [font, setFont] = useState<PDFFont>();
  useEffect(() => { let active = true; void getFieldFont().then(value => { if (active) setFont(value); }); return () => { active = false; }; }, []);
  let layout: ReturnType<typeof layoutField> | undefined;
  let invalid = false;
  try { if (font) layout = layoutField(text, field, pageWidth, pageHeight, font); } catch { invalid = true; }
  return <button type="button" className={`form-entry detected ${selected ? 'selected' : ''} ${text ? 'completed' : ''} ${invalid ? 'invalid' : ''}`}
    aria-label={`Edit ${field.label}${invalid ? ': answer exceeds box' : ''}`} title={invalid ? `${field.label}: shorten this answer to fit` : field.label}
    style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }} onClick={onClick}>
    {layout && <svg viewBox={`0 0 ${field.width * pageWidth} ${field.height * pageHeight}`} width="100%" height="100%" aria-hidden="true">
      {layout.lines.map((line, i) => <text key={i} x={0} y={layout!.baseline + i * layout!.lineHeight} fontFamily="Arial, Helvetica, sans-serif" fontSize={layout!.size} fill="black">{line}</text>)}
    </svg>}
  </button>;
}
