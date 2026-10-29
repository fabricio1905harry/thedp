# Ordem de execução (Supabase → SQL Editor)

Rode UM arquivo por vez, nesta ordem. Todos podem ser rodados de novo sem problema.
Se algum já foi rodado antes, pode pular. Ao terminar, avise para o merge.

| # | Arquivo | O que faz |
|---|---|---|
| 1 | 2026-10-22_apply_0036.sql | edição das linhas do pedido (RLS), canal padrão, DHL Quote Required, escalonamento |
| 2 | 2026-10-23_apply_0037.sql | recálculo de preços (WHERE explícito) |
| 3 | 2026-10-24_apply_0038.sql | permissões do CMS |
| 4 | 2026-10-25_apply_0040.sql | país do cliente, cancelamento do pedido, resposta a contatos, alerta de estoque |
| 5 | 2026-10-25_apply_0050.sql | cores normalizadas e tabela de tamanhos |
| 6 | 2026-10-25_apply_0051.sql | marcas, coleções, lookbooks, edits |
| 7 | 2026-10-25_apply_0052.sql | Avise-me e favoritos |
| 8 | 2026-10-25_apply_0053.sql | NCM/HS mestre |
| 9 | 2026-10-25_apply_0060.sql | comprovante de pagamento e tentativas de pagamento |
| 10 | 2026-10-25_apply_0061.sql | pedido mínimo e volume pricing |
| 11 | 2026-10-25_apply_0062.sql | Duties & Taxes por mercado |
| 12 | 2026-10-25_apply_0063.sql | câmbio: fonte e frequência |
| 13 | 2026-10-25_apply_0070_to_0074.sql | notificações, carrinho abandonado, reserva, DHL, invoice |
| 14 | 2026-10-26_apply_0080.sql | leitura pública do CMS (se ainda não rodou) |
| 15 | 2026-10-26_apply_0081.sql | tipos do Action Center sempre presentes (se ainda não rodou) |
| 16 | 2026-10-29_apply_0082.sql | 22 cores TDP, tabela de tamanhos 36–56 com medidas, "Coral-1" = "Coral" |
| 17 | 2026-10-29_apply_0083.sql | precificação: preço fixo USD/EUR, margem por categoria, custo não reprecifica, margem por moeda |
| 18 | 2026-10-29_apply_0084.sql | cadastro completo do produto (descrições, composição, NCM, ref. TDP…), foto por cor |
| 19 | 2026-10-29_apply_0085.sql | newsletter e candidaturas Become a Brand |
| 20 | 2026-10-29_apply_0086.sql | placements (só o destaque expira), alertas de coleção em 2 níveis, armazenagem de 180 dias após o envio, tipos do Action Center |
| 21 | 2026-10-29_apply_0087.sql | idioma da comunicação do pedido |
| 22 | 2026-10-29_apply_0088.sql | regras de NCM/HS por categoria + composição, padrão de Vestidos (1,60 kg, 36×34×11) |

Os itens 1 a 3 e 14 e 15 só precisam rodar se ainda não foram rodados.
