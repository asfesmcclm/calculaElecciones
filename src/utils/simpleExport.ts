import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CommitteeSummary } from './electoralCalc';

export function exportSimplePDF(companyName: string, committee: CommitteeSummary) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const nowStr = new Date().toLocaleString('es-ES');
  const titleCompany = companyName.trim() || 'Elecciones Sindicales';
  const multiCollege = committee.collegeSummaries.length > 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('Resultado del Escrutinio Sindical (Art. 12 RD 1844/1994)', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Empresa: ${titleCompany}`, 14, 25);
  doc.text(
    `Fecha: ${nowStr} · Colegios: ${committee.collegeSummaries.length} · Puestos totales: ${committee.totalSeats}`,
    14,
    30
  );

  // Global summary
  autoTable(doc, {
    startY: 36,
    head: [['Resumen General de la Empresa', 'Cantidad', 'Detalle']],
    body: [
      ['Censo total de trabajadores', committee.totalCensus.toLocaleString('es-ES'), 'Suma de colegios'],
      [
        'Total votantes',
        committee.totalVoters.toLocaleString('es-ES'),
        `${committee.participationPct.toFixed(2)} % participación · ${committee.totalAbstention.toLocaleString('es-ES')} abstención`,
      ],
      [
        'Votos válidos / Blancos / Nulos',
        committee.totalValidVotes.toLocaleString('es-ES'),
        `${committee.totalBlankVotes} en blanco · ${committee.totalNullVotes} nulos`,
      ],
      [
        'Total delegados asignados',
        `${committee.assignedSeats} de ${committee.totalSeats}`,
        'Representación proporcional (cociente electoral y mayor resto)',
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
  });

  let cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (multiCollege) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Composición Total del Comité de Empresa', 14, cursorY);

    autoTable(doc, {
      startY: cursorY + 3,
      head: [
        [
          'Candidatura',
          'Votos Totales',
          '% Válidos',
          ...committee.collegeSummaries.map((c) => c.collegeName.slice(0, 16)),
          'Total Delegados',
        ],
      ],
      body: committee.combinedRows.map((row) => [
        row.acronym,
        row.totalVotes.toLocaleString('es-ES'),
        `${row.pctOfValid.toFixed(2)}%`,
        ...committee.collegeSummaries.map((c) => String(row.seatsByCollege[c.collegeId] ?? 0)),
        String(row.totalSeats),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [200, 16, 46], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  }

  for (const col of committee.collegeSummaries) {
    if (cursorY > 240) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Colegio: ${col.collegeName} (${col.assignedSeats}/${col.totalSeats} puestos · Censo: ${col.census})`,
      14,
      cursorY
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Votantes: ${col.totalVoters} (${col.participationPct.toFixed(1)}%) · Válidos: ${col.validVotes} (${col.blankVotes} bl., ${col.nullVotes} nul.) · Cociente electoral: ${col.electoralQuotient.toFixed(4)}`,
      14,
      cursorY + 4.5
    );

    autoTable(doc, {
      startY: cursorY + 7,
      head: [['Siglas', 'Votos', '% Válidos', 'V / Coc.', 'Enteros', 'Resto', '+Resto', 'Total']],
      body: col.results.map((r) => [
        r.candidacy.acronym,
        r.candidacy.votes.toLocaleString('es-ES'),
        `${r.pctOfValid.toFixed(2)}%`,
        r.meetsThreshold ? r.exactRatio.toFixed(3) : `< ${col.thresholdPct}%`,
        r.meetsThreshold ? String(r.integerSeats) : '0',
        r.meetsThreshold ? r.remainderFraction.toFixed(3) : '—',
        r.remainderSeat > 0 ? '+1' : '0',
        String(r.seats),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (committee.hasAnyTie) {
    if (cursorY > 265) {
      doc.addPage();
      cursorY = 18;
    }
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text(
      'Nota: En caso de empate de votos, de enteros o de restos para el último puesto, corresponde al candidato de mayor antigüedad en la empresa (art. 12 RD 1844/1994).',
      14,
      cursorY,
      { maxWidth: 180 }
    );
  }

  const slug = titleCompany.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`escrutinio-${slug}.pdf`);
}

export function exportSimpleCSV(companyName: string, committee: CommitteeSummary) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: Array<Array<string | number>> = [
    ['Sistema', 'Representacion proporcional cociente electoral y mayor resto (Art. 12 RD 1844/1994)'],
    ['Empresa', companyName || 'Elecciones Sindicales'],
    ['Censo total', committee.totalCensus],
    ['Total votantes', committee.totalVoters],
    ['Participacion (%)', committee.participationPct.toFixed(2)],
    ['Votos validos totales', committee.totalValidVotes],
    ['Votos en blanco', committee.totalBlankVotes],
    ['Votos nulos', committee.totalNullVotes],
    ['Puestos totales', committee.totalSeats],
    [],
    ['RESUMEN COMITE', 'Votos Totales', '% Validos', 'Total Delegados'],
    ...committee.combinedRows.map((row) => [
      row.acronym,
      row.totalVotes,
      row.pctOfValid.toFixed(2),
      row.totalSeats,
    ]),
  ];

  for (const col of committee.collegeSummaries) {
    lines.push([]);
    lines.push([
      `COLEGIO: ${col.collegeName}`,
      `Censo: ${col.census}`,
      `Puestos: ${col.totalSeats}`,
      `Votantes: ${col.totalVoters}`,
      `Validos: ${col.validVotes}`,
      `Blanco: ${col.blankVotes}`,
      `Nulos: ${col.nullVotes}`,
      `Cociente: ${col.electoralQuotient.toFixed(4)}`,
    ]);
    lines.push([
      'Siglas',
      'Votos',
      '% Validos',
      'Supera Umbral',
      'Votos / Cociente',
      'Enteros',
      'Resto',
      '+Resto',
      'Total Puestos',
    ]);
    for (const r of col.results) {
      lines.push([
        r.candidacy.acronym,
        r.candidacy.votes,
        r.pctOfValid.toFixed(2),
        r.meetsThreshold ? 'Si' : 'No',
        r.meetsThreshold ? r.exactRatio.toFixed(4) : '0',
        r.integerSeats,
        r.meetsThreshold ? r.remainderFraction.toFixed(4) : '0',
        r.remainderSeat,
        r.seats,
      ]);
    }
  }

  const csv = '\uFEFF' + lines.map((row) => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const slug = (companyName || 'escrutinio').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.download = `escrutinio-${slug}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
