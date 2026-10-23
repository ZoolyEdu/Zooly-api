import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analisarIndicesOrdem, planejarOrdemAtividades } from '../src/services/planejarOrdemAtividades.js';

test('planeja ordens sem perder documentos, preserva ordens válidas e resolve duplicidades por turma', () => {
  const atividades = [
    { _id: 'a', turma: 'turma-1', ordem: 1, createdAt: '2026-01-01' },
    { _id: 'b', turma: 'turma-1', ordem: 2, createdAt: '2026-01-02' },
    { _id: 'c', turma: 'turma-1', ordem: 2, createdAt: '2026-01-03' },
    { _id: 'd', turma: 'turma-1', createdAt: '2026-01-04' },
    { _id: 'e', turma: 'turma-1', ordem: 0, createdAt: '2026-01-05' },
    { _id: 'f', turma: 'turma-2', ordem: 1, createdAt: '2026-01-01' }
  ];
  const antes = structuredClone(atividades);

  const plano = planejarOrdemAtividades(atividades);
  const idsOriginals = atividades.map(item => item._id).sort();
  const reconciliadas = atividades.map(item => {
    const alteracao = plano.find(planoItem => planoItem._id === item._id);
    return alteracao ? { ...item, ordem: alteracao.ordem } : item;
  });

  assert.deepEqual(plano.map(item => [item._id, item.ordem]), [['c', 3], ['d', 4], ['e', 5]]);
  assert.deepEqual(atividades, antes);
  assert.deepEqual(reconciliadas.map(item => item._id).sort(), idsOriginals);
  for (const turma of ['turma-1', 'turma-2']) {
    const ordens = reconciliadas.filter(item => item.turma === turma).map(item => item.ordem);
    assert.ok(ordens.every(ordem => Number.isSafeInteger(ordem) && ordem > 0));
    assert.equal(new Set(ordens).size, ordens.length);
  }
});

test('interrompe o planejamento quando uma atividade não tem turma', () => {
  assert.throws(() => planejarOrdemAtividades([{ _id: 'sem-turma', ordem: 1 }]), /não possui turma/);
});

test('interrompe antes de propor ordens fora da faixa inteira segura', () => {
  assert.throws(() => planejarOrdemAtividades([
    { _id: 'limite', turma: 'turma-1', ordem: Number.MAX_SAFE_INTEGER },
    { _id: 'pendente', turma: 'turma-1' }
  ]), /ordens inteiras seguras/);
});

test('prévia identifica índice turma/ordem incompatível sem alterar a lista recebida', () => {
  const indices = [
    { name: '_id_', key: { _id: 1 } },
    { name: 'turma_1_ordem_1', key: { turma: 1, ordem: 1 }, unique: false }
  ];
  const antes = structuredClone(indices);

  const analise = analisarIndicesOrdem(indices);

  assert.equal(analise.compativel, false);
  assert.deepEqual(analise.incompatíveis, ['turma_1_ordem_1']);
  assert.deepEqual(indices, antes);
});

test('prévia bloqueia índices únicos esparsos ou em preparação', () => {
  const analise = analisarIndicesOrdem([
    { name: 'esparso', key: { turma: 1, ordem: 1 }, unique: true, sparse: true },
    { name: 'preparacao', key: { turma: 1, ordem: 1 }, unique: true, prepareUnique: true }
  ]);

  assert.equal(analise.compativel, false);
  assert.deepEqual(analise.incompatíveis, ['esparso', 'preparacao']);
});

test('índice único compatível é reconhecido e índice de outro padrão é ignorado', () => {
  const analise = analisarIndicesOrdem([
    { name: '_id_', key: { _id: 1 } },
    { name: 'turma_1_ordem_1', key: { turma: 1, ordem: 1 }, unique: true }
  ]);

  assert.equal(analise.compativel, true);
  assert.deepEqual(analise.incompatíveis, []);
});
