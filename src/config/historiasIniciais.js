// Histórias iniciais do Banco de Histórias do Zooly (origem "zooly").
//
// São adaptações infantis (4 a 8 anos) inspiradas no folclore e na cultura do Vale do Ribeira.
// Não são versões históricas definitivas: as narrativas populares variam de lugar para lugar.
//
// Os `_id` e as `chave` são ESTÁVEIS: o seed (scripts/semearHistorias.js) usa esses valores
// para não duplicar histórias. Não os altere depois de publicados.
// Em cada pergunta, `alternativaCorreta` é o índice (a partir de 0) da alternativa certa.

const NOTA_FOLCLORE =
  "Adaptação infantil do Zooly inspirada no folclore do Vale do Ribeira. Não é uma versão histórica definitiva: as histórias populares mudam de lugar para lugar e de quem conta para quem conta.";

function pergunta(
  enunciado,
  alternativas,
  alternativaCorreta,
  feedback,
  objetivoPedagogico,
) {
  return {
    enunciado,
    alternativas: alternativas.map((texto) => ({ texto })),
    alternativaCorreta,
    feedback,
    objetivoPedagogico,
  };
}

export const HISTORIAS_INICIAIS = Object.freeze([
  {
    _id: "6a5f0b000000000000000001",
    chave: "nego-dagua-rio-ribeira",
    titulo: "O Nego d'Água do Rio Ribeira",
    descricao:
      "O guardião das águas do Rio Ribeira ensina Lia e Tonho a cuidar do rio e a brincar perto da água com segurança.",
    tema: "Folclore das águas",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Respeitar a natureza e a preservação dos rios.",
      "Conhecer regras de segurança para brincar perto de rios e praias.",
      "Compreender a importância de não jogar lixo na água.",
    ],
    nota: NOTA_FOLCLORE,
    conteudo: `No Vale do Ribeira corre um rio grande e comprido: o Rio Ribeira de Iguape. Os mais antigos contam que, nas partes mais fundas do rio, mora o Nego d'Água. Ele parece um menino, tem os cabelos cheios de gotinhas e uma risada que faz bolhas na água: glub, glub, glub!

O Nego d'Água é o guardião do rio. Ele cuida dos peixes, das pedras lisinhas e das plantas que moram na beira da água.

Num dia de sol, os irmãos Lia e Tonho foram passear com a avó Dita na margem do rio. Tonho viu uma garrafa de plástico boiando e gritou:
— Olha, vó! Tem lixo no rio!
De repente, a água fez glub, glub, e a garrafa veio rodando até a areia, bem pertinho dos pés dele. A avó sorriu:
— Foi o Nego d'Água. Ele está pedindo ajuda para manter o rio limpo.
As crianças pegaram a garrafa e colocaram no lixo. A água ficou brilhando, como se estivesse agradecendo.

Depois, Lia quis entrar correndo no rio. A avó segurou a mão dela com carinho:
— Espera, Lia. No rio, a gente só entra com um adulto junto, e nunca na parte funda. Lá no meio, a água corre forte.
Lia ficou na parte rasinha, molhando os pés, de mãos dadas com a avó. Lá longe, na parte funda, ela viu um redemoinho pequenino girando e escutou uma risada: glub, glub!
— Ele está feliz porque vocês cuidaram do rio e brincaram com cuidado — disse a avó.

Desde aquele dia, sempre que Lia e Tonho visitam o rio, levam um saquinho para recolher o lixo e lembram a regra da avó: perto do rio, sempre com um adulto.`,
    perguntas: [
      pergunta(
        "Onde mora o Nego d'Água, segundo a história?",
        [
          "Nas partes mais fundas do rio",
          "No alto de uma montanha",
          "Dentro de uma caverna escura",
          "Numa casa perto da escola",
        ],
        0,
        "Isso! A história conta que ele mora nas partes mais fundas do Rio Ribeira, onde cuida das águas.",
        "Localizar uma informação que aparece no texto.",
      ),
      pergunta(
        "O que Tonho viu boiando no rio?",
        [
          "Uma folha seca",
          "Uma garrafa de plástico",
          "Um barquinho de papel",
          "Um peixe dourado",
        ],
        1,
        "A garrafa de plástico era lixo. Lixo não pode ir para o rio, porque faz mal aos peixes e às plantas.",
        "Identificar o problema da poluição apresentado na história.",
      ),
      pergunta(
        "O que as crianças fizeram com a garrafa?",
        [
          "Jogaram de volta no rio",
          "Esconderam na areia",
          "Colocaram no lixo",
          "Levaram para brincar",
        ],
        2,
        "Muito bem! Colocar o lixo no lugar certo ajuda a manter o rio limpo.",
        "Reconhecer atitudes de cuidado com o meio ambiente.",
      ),
      pergunta(
        "Qual é a regra da avó para brincar perto do rio?",
        [
          "Entrar correndo na água",
          "Nadar até o meio do rio",
          "Ir sozinho quando ninguém estiver olhando",
          "Estar sempre com um adulto",
        ],
        3,
        "Isso mesmo! Perto de rios e praias, a criança fica sempre com um adulto e longe da parte funda.",
        "Compreender regras de segurança perto da água.",
      ),
      pergunta(
        "Que som a risada do Nego d'Água fazia?",
        ["Glub, glub", "Au, au", "Piu, piu", "Toc, toc"],
        0,
        "A risada dele fazia bolhas na água: glub, glub, glub!",
        "Perceber sons e onomatopeias do texto.",
      ),
    ],
  },
  {
    _id: "6a5f0b000000000000000002",
    chave: "curupira-mata-atlantica",
    titulo: "O Curupira da Mata Atlântica",
    descricao:
      "Numa trilha com o tio Zeca, Davi encontra as pegadas do guardião da floresta e aprende a cuidar das árvores e dos animais.",
    tema: "Folclore da floresta",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Promover a educação ambiental e a preservação da Mata Atlântica.",
      "Estimular o respeito aos animais e a proteção das árvores.",
      "Observar a natureza com atenção e em silêncio.",
    ],
    nota: NOTA_FOLCLORE,
    conteudo: `Na Mata Atlântica do Vale do Ribeira, as árvores são tão altas que parecem tocar as nuvens. Ali vive o Curupira, o guardião da floresta. Ele é pequeno, tem cabelos vermelhos como fogo e um jeito muito especial: os pés dele são virados para trás!

Quando o Curupira anda, as pegadas apontam para o lado contrário. Assim, quem tenta segui-lo vai para o caminho errado. É desse jeito que ele protege os animais e as árvores de quem quer fazer mal à mata.

Certa manhã, o menino Davi entrou na trilha com o tio Zeca. Davi pegou um galho e começou a bater nos troncos e a arrancar as folhinhas novas.
De repente, um assobio fino ecoou pela mata: fiiiu! As folhas balançaram, e Davi viu no chão umas pegadas engraçadas, apontando para trás.
— São do Curupira — disse o tio. — Ele fica triste quando alguém machuca as plantas.
Davi largou o galho na hora.
— Desculpa, árvore — falou baixinho.

Então os dois ficaram em silêncio e observaram. Viram um tucano de bico colorido, um macaco pulando de galho em galho e uma fileira de formigas carregando pedacinhos de folha. Tudo parecia contente.

No caminho de volta, Davi ajudou o tio a recolher papéis que outras pessoas tinham deixado na trilha. Lá do alto, ouviram de novo: fiiiu! Mas desta vez o assobio parecia alegre.
— Ele está agradecendo — sorriu o tio. — Quem cuida da mata é amigo do Curupira.`,
    perguntas: [
      pergunta(
        "Como são os cabelos do Curupira?",
        [
          "Vermelhos como fogo",
          "Azuis como o céu",
          "Brancos como algodão",
          "Verdes como folhas",
        ],
        0,
        "Isso! O Curupira tem cabelos vermelhos como fogo.",
        "Identificar características de um personagem.",
      ),
      pergunta(
        "Por que as pegadas do Curupira confundem as pessoas?",
        [
          "Porque ele voa",
          "Porque os pés dele são virados para trás",
          "Porque ele anda de bicicleta",
          "Porque ele apaga as pegadas com água",
        ],
        1,
        "Os pés virados para trás deixam pegadas que apontam para o lado contrário. Assim ele protege a mata.",
        "Relacionar uma característica do personagem com a sua função na história.",
      ),
      pergunta(
        "O que Davi fazia de errado no começo da trilha?",
        [
          "Cantava músicas",
          "Comia uma fruta",
          "Batia nas árvores e arrancava folhas",
          "Dormia no chão",
        ],
        2,
        "Bater nas árvores e arrancar folhas machuca as plantas. Davi percebeu e pediu desculpas.",
        "Reconhecer atitudes que prejudicam a natureza.",
      ),
      pergunta(
        "Quais animais Davi viu quando ficou em silêncio?",
        [
          "Leão, zebra e girafa",
          "Pinguim, urso e foca",
          "Vaca, cavalo e porco",
          "Tucano, macaco e formigas",
        ],
        3,
        "Muito bem! Em silêncio, Davi viu o tucano, o macaco e as formigas que vivem na Mata Atlântica.",
        "Valorizar a observação atenta e conhecer animais da Mata Atlântica citados no texto.",
      ),
      pergunta(
        "O que Davi fez no caminho de volta?",
        [
          "Recolheu papéis deixados na trilha",
          "Arrancou mais folhas",
          "Gritou bem alto",
          "Jogou pedras nos bichos",
        ],
        0,
        "Isso! Recolher o lixo da trilha é uma forma de cuidar da floresta.",
        "Reconhecer ações de cuidado com o meio ambiente.",
      ),
    ],
  },
  {
    _id: "6a5f0b000000000000000003",
    chave: "mae-do-ouro-tesouros",
    titulo: "Mãe-do-Ouro e os Tesouros Escondidos",
    descricao:
      "Uma luz dourada mostra para Bia que os tesouros da natureza ficam mais bonitos quando são cuidados e compartilhados.",
    tema: "Folclore e recursos naturais",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Trabalhar a generosidade e o compartilhamento.",
      "Estimular o respeito à natureza.",
      "Valorizar os recursos naturais como algo de todos.",
    ],
    nota: NOTA_FOLCLORE,
    conteudo: `Nas noites escuras do Vale do Ribeira, às vezes aparece no céu uma luz dourada que voa devagar, de um morro para outro. Os moradores chamam essa luz de Mãe-do-Ouro. Dizem que ela protege os tesouros da natureza: as pedras brilhantes, as cavernas e as riquezas escondidas na terra.

Perto de um morro morava a menina Bia. Uma noite, ela viu a luz dourada pousar atrás das árvores e foi até lá com o pai, segurando uma lanterna.
No chão, encontraram pedrinhas que brilhavam como estrelas.
— Vamos levar todas! — disse Bia, enchendo os bolsos.
Nessa hora, a luz dourada piscou e ficou fraquinha, fraquinha.
O pai explicou:
— As pedras fazem parte do morro, filha. Se cada pessoa levar um pouco, o morro fica pobre e a natureza perde a sua beleza.

Bia pensou, pensou e devolveu as pedrinhas ao chão, uma por uma. A luz voltou a brilhar forte, e uma brisa morna passou pelo rosto dela, como um abraço.
— O maior tesouro é poder ver tudo isso do jeitinho que está — disse o pai.

No dia seguinte, Bia levou os amigos para olhar o morro de longe e desenhar as pedras brilhantes no caderno. Cada um fez um desenho diferente, e todos dividiram os lápis de cor.

Naquela noite, a luz dourada passou bem devagar sobre a casa de Bia. Parecia dizer: obrigada por cuidar dos tesouros da terra.`,
    perguntas: [
      pergunta(
        "Como aparece a Mãe-do-Ouro?",
        [
          "Como uma luz dourada no céu",
          "Como um peixe no rio",
          "Como uma nuvem de chuva",
          "Como um passarinho azul",
        ],
        0,
        "Isso! Ela aparece como uma luz dourada que voa devagar de um morro para outro.",
        "Identificar como o personagem é descrito no texto.",
      ),
      pergunta(
        "O que Bia encontrou no chão?",
        [
          "Moedas de chocolate",
          "Pedrinhas que brilhavam",
          "Conchas do mar",
          "Folhas secas",
        ],
        1,
        "Bia encontrou pedrinhas que brilhavam como estrelas, tesouros da natureza.",
        "Localizar uma informação que aparece no texto.",
      ),
      pergunta(
        "O que aconteceu com a luz quando Bia encheu os bolsos de pedras?",
        [
          "Ficou mais forte",
          "Ficou azul",
          "Ficou fraquinha",
          "Fez um barulho alto",
        ],
        2,
        "A luz ficou fraquinha. Era um sinal de que tirar os tesouros da natureza não estava certo.",
        "Relacionar causa e consequência na história.",
      ),
      pergunta(
        "O que Bia fez depois de conversar com o pai?",
        [
          "Levou as pedras para casa",
          "Vendeu as pedras",
          "Jogou as pedras no rio",
          "Devolveu as pedras ao chão",
        ],
        3,
        "Muito bem! Bia devolveu as pedras, e a luz voltou a brilhar forte.",
        "Reconhecer atitudes de respeito aos recursos naturais.",
      ),
      pergunta(
        "O que Bia e os amigos fizeram no dia seguinte?",
        [
          "Desenharam o morro e dividiram os lápis de cor",
          "Brigaram pelas pedras",
          "Cavaram buracos no morro",
          "Ficaram em casa dormindo",
        ],
        0,
        "Isso! Eles admiraram o morro sem estragar nada e dividiram os lápis de cor. Compartilhar também é um tesouro.",
        "Valorizar a generosidade e o compartilhamento.",
      ),
    ],
  },
  {
    _id: "6a5f0b000000000000000004",
    chave: "minhocao-rio-ribeira",
    titulo: "O Minhocão do Rio Ribeira",
    descricao:
      "Depois de uma grande chuva, Caio sonha com o Minhocão e descobre como a terra, a água e as árvores trabalham juntas.",
    tema: "Folclore, solo e águas",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Compreender, de forma simples, a importância do solo.",
      "Relacionar a terra, a água da chuva e as raízes das árvores.",
      "Conhecer os efeitos das chuvas fortes e das enchentes e como prevenir danos.",
    ],
    nota: NOTA_FOLCLORE,
    conteudo: `Debaixo da terra do Vale do Ribeira, contam que vive o Minhocão: uma criatura enorme, parecida com uma minhoca gigante. Ele é tão comprido que, quando se mexe, o chão faz um barulhinho: rrrum, rrrum.

O Minhocão gosta da terra fofa e molhada. Ele cava túneis e, por esses caminhos, a água da chuva entra no solo e chega até as raízes das plantas. Por isso, onde o Minhocão passa, as plantas crescem fortes.

Um dia, choveu muito, muito mesmo. A água desceu dos morros correndo e o Rio Ribeira encheu tanto que passou por cima das margens. Era uma enchente. A família do menino Caio ficou num lugar alto e seguro, esperando a água baixar, como os adultos tinham combinado.
Caio olhou preocupado pela janela.
— Por que a água subiu tanto, mãe?
— Quando a chuva é muito forte, a terra não consegue beber toda a água de uma vez — explicou a mãe. — E, onde cortaram as árvores, a terra fica sem proteção e escorrega para o rio.

Naquela noite, Caio sonhou com o Minhocão. Ele falou com uma voz grossa e calma:
— A terra precisa das raízes das árvores para ficar firme, como eu preciso dos meus túneis. Plantem árvores, e a terra vai segurar melhor a água.

Quando a chuva passou e a água baixou, Caio e os vizinhos plantaram mudas na beira do rio. Cada criança plantou uma árvore e deu um nome para ela. A de Caio se chamou Rrrum, em homenagem ao Minhocão.

E, debaixo da terra, bem lá no fundo, todo mundo jura que ouviu um rrrum feliz.`,
    perguntas: [
      pergunta(
        "Com o que o Minhocão se parece?",
        [
          "Com uma minhoca gigante",
          "Com um peixe voador",
          "Com um gato listrado",
          "Com uma árvore alta",
        ],
        0,
        "Isso! O Minhocão é uma criatura enorme, parecida com uma minhoca gigante, que vive debaixo da terra.",
        "Identificar características de um personagem.",
      ),
      pergunta(
        "Para que servem os túneis do Minhocão?",
        [
          "Para esconder brinquedos",
          "Para a água da chuva entrar no solo e chegar às raízes",
          "Para guardar comida",
          "Para fazer barulho à noite",
        ],
        1,
        "Pelos túneis, a água da chuva entra na terra e chega até as raízes das plantas.",
        "Compreender a relação entre o solo, a água e as plantas.",
      ),
      pergunta(
        "O que aconteceu quando choveu muito?",
        [
          "O rio secou",
          "Apareceu um arco-íris de pedra",
          "O rio encheu e passou por cima das margens",
          "A terra virou areia da praia",
        ],
        2,
        "Com muita chuva, o rio encheu e passou das margens. Isso se chama enchente.",
        "Reconhecer os efeitos das chuvas fortes.",
      ),
      pergunta(
        "Segundo o Minhocão, o que ajuda a terra a ficar firme?",
        [
          "Muitas pedras pintadas",
          "Muitas casas novas",
          "Muito barulho",
          "As raízes das árvores",
        ],
        3,
        "Muito bem! As raízes das árvores seguram a terra e ajudam o solo a guardar melhor a água.",
        "Compreender a importância das árvores para proteger o solo.",
      ),
      pergunta(
        "O que Caio e os vizinhos fizeram depois da chuva?",
        [
          "Plantaram mudas na beira do rio",
          "Jogaram lixo no rio",
          "Cortaram as árvores",
          "Foram nadar na enchente",
        ],
        0,
        "Isso! Plantar árvores na beira do rio ajuda a proteger a terra e o rio.",
        "Reconhecer ações de prevenção e cuidado com o ambiente.",
      ),
    ],
  },
  {
    _id: "6a5f0b000000000000000005",
    chave: "saci-caverna-do-diabo",
    titulo: "O Saci da Caverna do Diabo",
    descricao:
      "Em Eldorado, Nina visita uma caverna com a escola e brinca de eco com o Saci, descobrindo os sons e as pedras desse lugar.",
    tema: "Folclore e geografia regional",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Desenvolver a percepção auditiva e a exploração sensorial.",
      "Compreender o eco de forma simples.",
      "Valorizar a geografia regional e a preservação das cavernas.",
    ],
    nota: `${NOTA_FOLCLORE} A Caverna do Diabo fica em Eldorado (SP), dentro de um parque estadual, e só pode ser visitada com guia.`,
    conteudo: `Em Eldorado, no Vale do Ribeira, existe uma caverna enorme chamada Caverna do Diabo. Apesar do nome assustador, ela é um lugar lindo: tem salões grandes, pedras de formas curiosas e água pingando devagar do teto: plic, plic, plic.

Contam que o Saci, aquele menino arteiro de uma perna só e gorro vermelho, adora visitar a caverna. Sabe por quê? Por causa do eco!
Lá dentro, quando o Saci grita "Oiii!", a caverna responde "Oiii... oiii... oiii...". A voz bate nas paredes de pedra e volta, cada vez mais baixinha.

Um dia, a menina Nina foi visitar a caverna com a turma da escola e com um guia. O guia acendeu a lanterna e mostrou pedras compridas penduradas no teto, como pingentes.
— Elas se formam com as gotinhas de água, bem devagar, durante muitos e muitos anos — explicou.

Nina ouviu um assobio e uma risadinha. Era o Saci, pulando numa perna só atrás de uma pedra!
— Vamos brincar de eco? — cochichou ele.
Nina falou bem alto: "Zoo-ly!". E a caverna respondeu: "Zoo-ly... zoo-ly... ly...".
Depois, ela falou bem baixinho, e o eco quase não voltou. Nina descobriu que, quanto mais forte a voz, mais forte o eco.

O Saci quis levar uma pedrinha da caverna como lembrança, mas o guia avisou:
— Aqui a gente não leva nada e não mexe nas pedras. Elas demoram muito tempo para se formar.
O Saci, arteiro mas esperto, concordou.

Antes de ir embora, todos ficaram em silêncio para ouvir a caverna: plic, plic, plic. Era a música da água.`,
    perguntas: [
      pergunta(
        "Em qual cidade fica a caverna da história?",
        ["Eldorado", "Cananéia", "Iguape", "Registro"],
        0,
        "Isso! A Caverna do Diabo fica em Eldorado, no Vale do Ribeira.",
        "Localizar uma informação que aparece no texto e valorizar a geografia regional.",
      ),
      pergunta(
        "O que é o eco que o Saci adora?",
        [
          "Um bicho que mora na caverna",
          "A voz que bate nas paredes e volta",
          "Uma luz no teto",
          "Um tipo de comida",
        ],
        1,
        "O eco é a nossa voz batendo nas paredes de pedra e voltando, cada vez mais baixinha.",
        "Compreender o eco de forma simples.",
      ),
      pergunta(
        "Que som a água fazia pingando do teto?",
        ["Glub, glub", "Rrrum, rrrum", "Plic, plic, plic", "Fiiiu"],
        2,
        "Muito bem! As gotinhas faziam plic, plic, plic, a música da água.",
        "Desenvolver a percepção auditiva por meio de onomatopeias.",
      ),
      pergunta(
        "O que Nina descobriu sobre o eco?",
        [
          "Que ele só aparece de dia",
          "Que ele fala outra língua",
          "Que ele vem de um rádio",
          "Que a voz mais forte faz o eco mais forte",
        ],
        3,
        "Isso! Quando Nina falou alto, o eco voltou forte. Quando falou baixinho, quase não voltou.",
        "Explorar a relação entre a intensidade da voz e o eco.",
      ),
      pergunta(
        "Por que a gente não deve levar pedras da caverna?",
        [
          "Porque elas demoram muito tempo para se formar",
          "Porque são feitas de chocolate",
          "Porque são muito leves",
          "Porque o Saci come as pedras",
        ],
        0,
        "Isso mesmo! As pedras da caverna levam muitos e muitos anos para se formar, por isso a gente só olha e não leva nada.",
        "Compreender a preservação das cavernas.",
      ),
    ],
  },
  {
    _id: "6a5f0b000000000000000006",
    chave: "protetora-fandangueiros",
    titulo: "A Protetora dos Fandangueiros",
    descricao:
      "Com a ajuda de Dona Brisa, protetora das praias e dos manguezais, Juca aprende a tocar viola com o avô e mantém viva a tradição do fandango caiçara.",
    tema: "Cultura caiçara",
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [
      "Valorizar a cultura regional e as tradições caiçaras.",
      "Conhecer o fandango, os tamancos e a viola.",
      "Reconhecer a importância de aprender com os mais velhos e de cuidar das praias e dos manguezais.",
    ],
    nota: "Adaptação infantil do Zooly inspirada na cultura caiçara do Vale do Ribeira. Dona Brisa é uma personagem criada para esta história. O fandango caiçara é uma tradição viva, reconhecida como patrimônio cultural imaterial do Brasil.",
    conteudo: `Em Cananéia e Iguape, cidades do litoral do Vale do Ribeira, vivem os caiçaras: famílias que pescam, fazem canoas e cuidam das praias e dos manguezais. Quando a noite chega, muitas delas se juntam para o fandango, uma festa de música e dança.

No fandango, a viola toca, a rabeca canta bonito e os dançarinos batem os tamancos de madeira no chão: toc, toc, toc! O som parece o coração da festa.

Contam por ali que existe uma protetora das praias e dos manguezais. Ela aparece como uma brisa salgada, com cheiro de mar, e por isso é chamada de Dona Brisa. Ela cuida dos caranguejos do mangue, dos peixinhos e, principalmente, dos fandangueiros.

Um dia, o menino Juca estava triste. O avô dele, que tocava viola no fandango, tinha ficado gripado.
— Quem vai tocar na festa? — perguntou Juca.
Naquela tarde, uma brisa salgada entrou pela janela e fez as cordas da viola tocarem sozinhas: tlim, tlim. Juca entendeu o recado. Pegou a viola e pediu:
— Vô, me ensina?
O avô sorriu e ensinou, devagarinho, como colocar os dedos nas cordas.

À noite, Juca tocou uma música simples no fandango. Os dançarinos bateram os tamancos, toc, toc, toc, e todo mundo cantou junto. Uma brisa fresca passou pela roda, balançando as saias e os chapéus.
— É a Dona Brisa — disse a avó. — Ela fica feliz quando as crianças aprendem as tradições com os mais velhos.

Antes de dormir, Juca fez uma promessa: ia aprender a dançar, a tocar e a cuidar do mangue, para que o fandango e a natureza caiçara continuassem vivos por muito tempo.`,
    perguntas: [
      pergunta(
        "O que é o fandango, na história?",
        [
          "Uma festa de música e dança",
          "Um tipo de peixe",
          "Um barco grande",
          "Uma comida de praia",
        ],
        0,
        "Isso! O fandango é uma festa caiçara de música e dança.",
        "Conhecer uma tradição da cultura caiçara apresentada no texto.",
      ),
      pergunta(
        "O que os dançarinos batem no chão?",
        [
          "Panelas de barro",
          "Tamancos de madeira",
          "Bolas de futebol",
          "Conchas do mar",
        ],
        1,
        "Os dançarinos batem os tamancos de madeira no chão: toc, toc, toc!",
        "Identificar elementos do fandango: os tamancos.",
      ),
      pergunta(
        "Como Dona Brisa aparece?",
        [
          "Como um peixe dourado",
          "Como uma onda gigante",
          "Como uma brisa salgada com cheiro de mar",
          "Como uma estrela cadente",
        ],
        2,
        "Muito bem! Dona Brisa aparece como uma brisa salgada, com cheiro de mar.",
        "Identificar como a personagem é descrita no texto.",
      ),
      pergunta(
        "O que Juca pediu ao avô?",
        [
          "Um barco novo",
          "Um sorvete",
          "Para ir à praia",
          "Que ele o ensinasse a tocar viola",
        ],
        3,
        "Isso! Juca pediu para aprender a tocar viola com o avô.",
        "Valorizar o aprendizado entre gerações.",
      ),
      pergunta(
        "Segundo a avó, quando Dona Brisa fica feliz?",
        [
          "Quando as crianças aprendem as tradições com os mais velhos",
          "Quando chove muito",
          "Quando a festa acaba cedo",
          "Quando ninguém toca música",
        ],
        0,
        "Isso mesmo! Aprender com os mais velhos ajuda a manter vivas as tradições caiçaras.",
        "Reconhecer a importância de preservar o patrimônio cultural.",
      ),
    ],
  },
]);
