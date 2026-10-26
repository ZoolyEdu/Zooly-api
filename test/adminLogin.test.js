import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';

const segredoTeste = 'segredo-local-login-admin';
const emailAdmin = '  Admin@Example.com  ';
const senhaAdmin = '  senha administrativa  ';
const hashAdmin = await bcrypt.hash(senhaAdmin, 4);
const mensagemCredenciaisInvalidas = 'E-mail ou senha inválidos.';
const mensagemCamposObrigatorios = 'E-mail e senha são obrigatórios.';
const mensagemConfiguracaoAusente = 'Autenticação do administrador não configurada.';

let servidor;
let baseUrl;

function configurarVariaveis(valores, executar) {
  const originais = new Map();

  for (const [nome, valor] of Object.entries(valores)) {
    originais.set(nome, process.env[nome]);
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }

  return Promise.resolve()
    .then(executar)
    .finally(() => {
      for (const [nome, valor] of originais) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
      }
    });
}

function configuracao(extra = {}) {
  return {
    JWT_SECRET: segredoTeste,
    ADMIN_EMAIL: emailAdmin,
    ADMIN_SENHA_HASH: hashAdmin,
    JWT_EXPIRES_IN: undefined,
    ...extra
  };
}

async function postLogin(body) {
  return fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

before(async () => {
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api/auth`;
});

after(async () => {
  if (servidor) {
    await new Promise((resolve, reject) => {
      servidor.close(erro => erro ? reject(erro) : resolve());
    });
  }
});

test('login administrativo válido normaliza o e-mail, preserva a configuração na resposta e emite JWT', async () => {
  await configurarVariaveis(configuracao({ JWT_EXPIRES_IN: '2h' }), async () => {
    const resposta = await postLogin({
      email: '  aDmIn@eXaMpLe.CoM  ',
      senha: senhaAdmin
    });
    const corpo = await resposta.json();
    const payload = jwt.verify(corpo.token, segredoTeste);

    assert.equal(resposta.status, 200);
    assert.deepEqual(Object.keys(corpo).sort(), ['mensagem', 'sucesso', 'token', 'usuario']);
    assert.equal(corpo.sucesso, true);
    assert.equal(corpo.mensagem, 'Login de administrador realizado com sucesso.');
    assert.deepEqual(corpo.usuario, {
      id: 'admin-configurado',
      nome: 'Administrador',
      email: emailAdmin,
      tipo: 'administrador'
    });
    assert.equal(payload.tipo, 'administrador');
    assert.equal(payload.nome, 'Administrador');
    assert.equal(payload.sub, 'admin-configurado');
    assert.equal(payload.exp - payload.iat, 2 * 60 * 60);
    assert.equal(Object.hasOwn(corpo.usuario, 'senha'), false);
    assert.equal(JSON.stringify(corpo).includes(senhaAdmin), false);
    assert.equal(JSON.stringify(corpo).includes(hashAdmin), false);
  });
});

test('e-mail ou senha incorretos retornam o mesmo status e mensagem genérica', async () => {
  await configurarVariaveis(configuracao(), async () => {
    const respostaEmail = await postLogin({ email: 'outro@example.com', senha: senhaAdmin });
    const corpoEmail = await respostaEmail.json();
    const respostaSenha = await postLogin({ email: 'admin@example.com', senha: 'incorreta' });
    const corpoSenha = await respostaSenha.json();

    assert.equal(respostaEmail.status, 401);
    assert.equal(respostaSenha.status, 401);
    assert.deepEqual(corpoEmail, { sucesso: false, mensagem: mensagemCredenciaisInvalidas });
    assert.deepEqual(corpoSenha, corpoEmail);
  });
});

test('campos ausentes ou inválidos retornam HTTP 400', async () => {
  await configurarVariaveis(configuracao(), async () => {
    for (const corpo of [
      {},
      { email: '', senha: senhaAdmin },
      { email: '   ', senha: senhaAdmin },
      { email: 10, senha: senhaAdmin },
      { email: 'admin@example.com', senha: '' },
      { email: 'admin@example.com', senha: false }
    ]) {
      const resposta = await postLogin(corpo);
      assert.equal(resposta.status, 400);
      assert.deepEqual(await resposta.json(), {
        sucesso: false,
        mensagem: mensagemCamposObrigatorios
      });
    }
  });
});

test('corpo JSON vazio retorna HTTP 400 com a mensagem de campos obrigatórios', async () => {
  await configurarVariaveis(configuracao(), async () => {
    const resposta = await postLogin({});

    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemCamposObrigatorios
    });
  });
});

test('cada configuração administrativa ausente retorna HTTP 500', async () => {
  for (const variavel of ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_SENHA_HASH']) {
    await configurarVariaveis(configuracao({ [variavel]: undefined }), async () => {
      const resposta = await postLogin({ email: 'admin@example.com', senha: senhaAdmin });

      assert.equal(resposta.status, 500, `configuração ausente: ${variavel}`);
      assert.deepEqual(await resposta.json(), {
        sucesso: false,
        mensagem: mensagemConfiguracaoAusente
      });
    });
  }
});

test('senha contendo espaços é comparada sem aparar e a validade padrão do JWT é uma hora', async () => {
  await configurarVariaveis(configuracao(), async () => {
    const resposta = await postLogin({ email: 'admin@example.com', senha: senhaAdmin });
    const corpo = await resposta.json();
    const payload = jwt.verify(corpo.token, segredoTeste);

    assert.equal(resposta.status, 200);
    assert.equal(payload.exp - payload.iat, 60 * 60);

    const senhaAparada = await postLogin({
      email: 'admin@example.com',
      senha: senhaAdmin.trim()
    });
    assert.equal(senhaAparada.status, 401);
    assert.deepEqual(await senhaAparada.json(), {
      sucesso: false,
      mensagem: mensagemCredenciaisInvalidas
    });
  });
});
