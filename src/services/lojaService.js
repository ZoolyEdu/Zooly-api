import AvatarAluno from '../models/AvatarAluno.js';
import catalogoAvatares from '../config/catalogoAvatares.js';
import { comprarAvatar } from './moedaService.js';

function buscarAvatarCatalogo(avatarId) {
  return catalogoAvatares.find(avatar => avatar.id === avatarId) ?? null;
}

async function listarAvatares(alunoId) {
  const adquiridos = await AvatarAluno.find({ aluno: alunoId }).select('avatarId -_id');
  const idsAdquiridos = new Set(adquiridos.map(item => item.avatarId));
  return catalogoAvatares.map(avatar => ({ ...avatar, adquirido: idsAdquiridos.has(avatar.id) }));
}

async function comprar({ alunoId, avatar }) {
  return comprarAvatar({ alunoId, avatarId: avatar.id, preco: avatar.preco });
}

export default { buscarAvatarCatalogo, listarAvatares, comprar };
