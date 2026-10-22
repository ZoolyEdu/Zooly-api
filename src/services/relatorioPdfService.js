import PDFDocument from 'pdfkit';

const margem = 48;

function formatarDataLocal(valor, fuso) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(valor)).map(parte => [parte.type, parte.value]));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

function moedaPercentual(valor) {
  return valor === null || valor === undefined ? 'Sem dados' : `${valor.toLocaleString('pt-BR')}%`;
}

function desenharCabecalhoTabela(doc, y) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
  doc.rect(margem, y, doc.page.width - margem * 2, 22).fill('#315A76');
  doc.fillColor('#FFFFFF')
    .text('Aluno', margem + 8, y + 6, { width: 178 })
    .text('RA', margem + 190, y + 6, { width: 58 })
    .text('Iniciadas', margem + 250, y + 6, { width: 56, align: 'right' })
    .text('Concluídas', margem + 310, y + 6, { width: 60, align: 'right' })
    .text('Resp.', margem + 374, y + 6, { width: 45, align: 'right' })
    .text('Acertos', margem + 418, y + 6, { width: 43, align: 'right' })
    .text('%', margem + 465, y + 6, { width: 34, align: 'right' });
  doc.fillColor('#172B3A').font('Helvetica');
}

function adicionarIndicadores(doc, titulo, indicadores) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#172B3A').text(titulo, { paragraphGap: 8 });
  doc.font('Helvetica').fontSize(10).fillColor('#263746');
  const linhas = [
    `Atividades iniciadas: ${indicadores.atividadesIniciadas}`,
    `Atividades concluídas: ${indicadores.atividadesConcluidas}`,
    `Respostas registradas: ${indicadores.respostasRegistradas}`,
    `Acertos: ${indicadores.acertos}`,
    `Erros: ${indicadores.erros}`,
    `Percentual de acerto: ${moedaPercentual(indicadores.percentualAcerto)}`
  ];
  for (const linha of linhas) doc.text(linha, { lineGap: 2 });
  doc.moveDown(1.1);
}

export function gerarRelatorioPdf(relatorio) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: margem, bufferPages: false, compress: false });
    const partes = [];
    let finalizado = false;
    const falhar = erro => {
      if (finalizado) return;
      finalizado = true;
      reject(erro);
    };

    doc.on('data', parte => partes.push(parte));
    doc.once('error', falhar);
    doc.once('end', () => {
      if (finalizado) return;
      finalizado = true;
      resolve(Buffer.concat(partes));
    });

    try {
      doc.info.Title = `Relatório semanal - ${relatorio.turma.nome}`;
      doc.info.Subject = `Desempenho semanal da turma ${relatorio.turma.nome}; ${formatarDataLocal(relatorio.periodo.inicio, relatorio.periodo.fuso)} a ${formatarDataLocal(relatorio.periodo.fim, relatorio.periodo.fuso)}; ${relatorio.periodo.fuso}; fim exclusivo`;
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#173F5F').text('Relatório semanal de desempenho');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(12).fillColor('#263746').text(`Turma: ${relatorio.turma.nome}`);
      doc.text(`Período: ${formatarDataLocal(relatorio.periodo.inicio, relatorio.periodo.fuso)} até ${formatarDataLocal(relatorio.periodo.fim, relatorio.periodo.fuso)} (${relatorio.periodo.fuso}; fim exclusivo)`);
      doc.text(`Total de alunos: ${relatorio.totalAlunos}`);
      doc.moveDown(1);

      adicionarIndicadores(doc, 'Indicadores gerais', relatorio.indicadores);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#172B3A').text('Desempenho individual', { paragraphGap: 8 });
      doc.moveDown(0.35);
      let cabecalhoPendente = true;

      for (const aluno of relatorio.alunos) {
        let nome = String(aluno.aluno.nomeCompleto || 'Nome não informado');
        let ra = String(aluno.aluno.ra || '—');
        const indicadores = aluno.indicadores;
        let alturaLinha;
        const alturaLinhaMaxima = doc.page.height - margem * 2 - 28;
        doc.font('Helvetica').fontSize(9);
        do {
          const alturaNome = doc.heightOfString(nome, { width: 178 });
          const alturaRa = doc.heightOfString(ra, { width: 58 });
          alturaLinha = Math.max(25, alturaNome, alturaRa) + 8;
          if (alturaLinha <= alturaLinhaMaxima) break;
          if (nome.length >= ra.length && nome.length > 16) {
            nome = `${nome.slice(0, Math.max(15, Math.floor(nome.length * 0.75)))}…`;
          } else if (ra.length > 16) {
            ra = `${ra.slice(0, Math.max(15, Math.floor(ra.length * 0.75)))}…`;
          } else {
            throw new Error('A identificação do aluno não cabe na área útil da página.');
          }
        } while (true);

        if (doc.y + (cabecalhoPendente ? 28 : 0) + alturaLinha > doc.page.height - margem) {
          doc.addPage();
          cabecalhoPendente = true;
        }
        if (cabecalhoPendente) {
          desenharCabecalhoTabela(doc, doc.y);
          doc.y += 28;
          cabecalhoPendente = false;
        }
        const y = doc.y;
        doc.font('Helvetica').fontSize(9).fillColor('#263746');
        doc.text(nome, margem + 8, y + 5, { width: 178 });
        doc.text(String(ra), margem + 190, y + 5, { width: 58 });
        doc.text(String(indicadores.atividadesIniciadas), margem + 250, y + 5, { width: 56, align: 'right' });
        doc.text(String(indicadores.atividadesConcluidas), margem + 310, y + 5, { width: 60, align: 'right' });
        doc.text(String(indicadores.respostasRegistradas), margem + 374, y + 5, { width: 45, align: 'right' });
        doc.text(String(indicadores.acertos), margem + 418, y + 5, { width: 43, align: 'right' });
        const percentual = indicadores.percentualAcerto === null ? '—' : moedaPercentual(indicadores.percentualAcerto);
        doc.text(percentual, margem + 465, y + 5, { width: 34, align: 'right' });
        doc.strokeColor('#D8E0E6').moveTo(margem, y + alturaLinha - 1).lineTo(doc.page.width - margem, y + alturaLinha - 1).stroke();
        doc.y = y + alturaLinha;
      }

      doc.end();
    } catch (erro) {
      doc.destroy();
      falhar(erro);
    }
  });
}
