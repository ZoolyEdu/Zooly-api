import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import Atividade from '../src/models/Atividade.js';

const turmaId = new mongoose.Types.ObjectId();
const professorId = new mongoose.Types.ObjectId();
const historiaId = new mongoose.Types.ObjectId();

function dadosValidos(overrides = {}) {
  return {
    turma: turmaId,
    professorCriador: professorId,
    titulo: 'Leitura e compreensão',
    historia: { tipo: 'oficial', historiaId },
    questoes: [{
      enunciado: 'Qual alternativa está correta?',
      alternativas: [
        { _id: new mongoose.Types.ObjectId(), texto: 'Primeira resposta' },
        { _id: new mongoose.Types.ObjectId(), texto: 'Segunda resposta' }
      ],
      respostasCorretas: []
    }],
    ...overrides
  };
}

function preencherRespostasCorretas(dados, indices = [0]) {
  const questao = dados.questoes[0];
  questao.respostasCorretas = indices.map(indice => questao.alternativas[indice]._id);
  return dados;
}

async function errosDeValidacao(dados, campoEsperado) {
  const atividade = new Atividade(dados);
  await assert.rejects(atividade.validate(), erro => {
    assert.equal(erro.name, 'ValidationError');
    const caminhos = Object.keys(erro.errors);
    assert.ok(
      caminhos.some(caminho => caminho === campoEsperado || caminho.startsWith(`${campoEsperado}.`)),
      `esperava erro em ${campoEsperado}; caminhos: ${caminhos.join(', ')}`
    );
    return true;
  });
}

test('exige turma, professor criador, título e origem da história', async () => {
  const atividade = new Atividade({});

  await assert.rejects(atividade.validate(), erro => {
    assert.equal(erro.name, 'ValidationError');
    assert.ok(erro.errors.turma);
    assert.ok(erro.errors.professorCriador);
    assert.ok(erro.errors.titulo);
    assert.ok(erro.errors.historia);
    return true;
  });
});

test('começa como rascunho e aceita referência oficial com respostas corretas válidas', async () => {
  const dados = preencherRespostasCorretas(dadosValidos());
  const atividade = new Atividade(dados);

  await atividade.validate();

  assert.equal(atividade.status, 'rascunho');
  assert.equal(String(atividade.historia.historiaId), String(historiaId));
  assert.equal(atividade.questoes.length, 1);
  assert.equal(atividade.questoes[0].alternativas.length, 2);
  assert.equal(String(atividade.questoes[0].respostasCorretas[0]), String(atividade.questoes[0].alternativas[0]._id));
});

test('aceita texto próprio sem referência a história oficial', async () => {
  const dados = preencherRespostasCorretas(dadosValidos({
    historia: { tipo: 'propria', texto: 'Texto escrito pelo professor.' }
  }));
  const atividade = new Atividade(dados);

  await atividade.validate();

  assert.equal(atividade.historia.tipo, 'propria');
  assert.equal(atividade.historia.texto, 'Texto escrito pelo professor.');
  assert.equal(atividade.historia.historiaId, undefined);
});

test('rejeita origem da história ausente ou sem origem selecionada', async () => {
  await errosDeValidacao(
    preencherRespostasCorretas(dadosValidos({ historia: undefined })),
    'historia'
  );
  await errosDeValidacao(
    preencherRespostasCorretas(dadosValidos({ historia: { tipo: 'oficial' } })),
    'historia'
  );
  await errosDeValidacao(
    preencherRespostasCorretas(dadosValidos({ historia: { tipo: 'propria', texto: '   ' } })),
    'historia'
  );
});

test('rejeita dados que selecionam história oficial e texto próprio ao mesmo tempo', async () => {
  await errosDeValidacao(
    preencherRespostasCorretas(dadosValidos({
      historia: { tipo: 'oficial', historiaId, texto: 'Texto concorrente.' }
    })),
    'historia'
  );
  await errosDeValidacao(
    preencherRespostasCorretas(dadosValidos({
      historia: { tipo: 'propria', historiaId, texto: 'Texto próprio.' }
    })),
    'historia'
  );
});

test('cada questão exige ao menos duas alternativas', async () => {
  const dados = dadosValidos();
  dados.questoes[0].alternativas.pop();
  preencherRespostasCorretas(dados);

  await errosDeValidacao(dados, 'questoes');
  await errosDeValidacao({
    ...preencherRespostasCorretas(dadosValidos()),
    questoes: [{ ...dadosValidos().questoes[0], alternativas: null }]
  }, 'questoes');
});

test('exige ao menos uma resposta correta vinculada a alternativa existente', async () => {
  const semResposta = dadosValidos();
  await errosDeValidacao(semResposta, 'questoes');

  const respostaInexistente = dadosValidos();
  respostaInexistente.questoes[0].respostasCorretas = [new mongoose.Types.ObjectId()];
  await errosDeValidacao(respostaInexistente, 'questoes');
});

test('permite várias respostas corretas sem duplicatas', async () => {
  const dados = preencherRespostasCorretas(dadosValidos(), [0, 1]);
  const atividade = new Atividade(dados);

  await atividade.validate();
  assert.equal(atividade.questoes[0].respostasCorretas.length, 2);
});

test('rejeita a mesma alternativa repetida nas respostas corretas', async () => {
  const dados = preencherRespostasCorretas(dadosValidos(), [0, 0]);
  await errosDeValidacao(dados, 'questoes');
});

test('mantém os IDs das questões e alternativas ao reconstruir o documento', async () => {
  const atividadeOriginal = new Atividade(
    preencherRespostasCorretas(dadosValidos(), [0, 1])
  );
  const questaoId = atividadeOriginal.questoes[0]._id;
  const alternativaIds = atividadeOriginal.questoes[0].alternativas.map(({ _id }) => String(_id));
  const atividadeReconstruida = new Atividade(atividadeOriginal.toObject());

  assert.equal(String(atividadeReconstruida.questoes[0]._id), String(questaoId));
  assert.deepEqual(
    atividadeReconstruida.questoes[0].alternativas.map(({ _id }) => String(_id)),
    alternativaIds
  );
  assert.deepEqual(
    atividadeReconstruida.questoes[0].respostasCorretas.map(String),
    atividadeReconstruida.questoes[0].alternativas.map(({ _id }) => String(_id))
  );
});

test('rejeita status de publicação fora dos valores definidos', async () => {
  const dados = preencherRespostasCorretas(dadosValidos({ status: 'arquivada' }));
  await errosDeValidacao(dados, 'status');
});

test('recompensa da atividade é opcional para documentos legados e aceita somente inteiro positivo seguro', async () => {
  const legado = new Atividade(preencherRespostasCorretas(dadosValidos()));
  await legado.validate();
  assert.equal(legado.recompensaMoedas, undefined);

  const valida = new Atividade(preencherRespostasCorretas(dadosValidos({ recompensaMoedas: 25 })));
  await valida.validate();
  assert.equal(valida.recompensaMoedas, 25);

  for (const recompensaMoedas of [0, -1, 1.5, null, Number.MAX_SAFE_INTEGER + 1]) {
    await errosDeValidacao(
      preencherRespostasCorretas(dadosValidos({ recompensaMoedas })),
      'recompensaMoedas'
    );
  }
});
