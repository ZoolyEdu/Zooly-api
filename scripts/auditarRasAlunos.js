import "../src/config/carregarEnv.js";
import mongoose from "mongoose";
import Aluno from "../src/models/Aluno.js";
import { connectDatabase } from "../src/config/database.js";

try {
  await connectDatabase();

  const [total, incompatíveis, duplicados] = await Promise.all([
    Aluno.countDocuments(),
    Aluno.aggregate([
      {
        $project: {
          formatoValido: {
            $regexMatch: {
              input: {
                $cond: [
                  { $eq: [{ $type: "$ra" }, "string"] },
                  "$ra",
                  "",
                ],
              },
              regex: "^[0-9]{13}$",
            },
          },
        },
      },
      { $match: { formatoValido: false } },
      { $count: "total" },
    ]),
    Aluno.aggregate([
      { $group: { _id: "$ra", quantidade: { $sum: 1 } } },
      { $match: { quantidade: { $gt: 1 } } },
      { $count: "total" },
    ]),
  ]);

  console.log(`Alunos cadastrados: ${total}`);
  console.log(`RAs fora do padrão (13 dígitos): ${incompatíveis[0]?.total ?? 0}`);
  console.log(`Valores de RA duplicados: ${duplicados[0]?.total ?? 0}`);
  console.log("Auditoria somente leitura; nenhum cadastro foi alterado.");
} catch {
  console.error(
    "Não foi possível auditar os RAs. Confira a configuração e a conexão do banco sem compartilhar credenciais.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
