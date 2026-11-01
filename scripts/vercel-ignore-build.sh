#!/usr/bin/env bash
# Ignored Build Step da Vercel para os apps do monorepo (web, landing-page, internal-agent).
#
# Uso, no vercel.json do app (a Vercel roda o comando dentro do Root Directory do projeto):
#   "ignoreCommand": "bash ../../scripts/vercel-ignore-build.sh"
#
# Saída 0 = pular o build (deployment cancelado); 1 = buildar. A Vercel builda com qualquer código >= 1,
# então todo erro (git, rede, turbo) cai no lado seguro: buildar.
#
# Decide com `turbo query affected` (substituto do turbo-ignore, que está deprecado): o app é afetado
# se mudou um arquivo dele ou de um pacote do workspace de que ele depende (package.json), o lockfile
# nas dependências dele, o turbo.json, ou um pacote de que a raiz depende. Base da comparação:
#   - VERCEL_GIT_PREVIOUS_SHA (último deployment com sucesso do projeto nesse branch), se estiver no
#     clone raso da Vercel (--depth=10). Assim, commits pulados se acumulam até o próximo build. Em
#     preview, se o ponto em que o branch saiu do master é posterior a esse deployment (branch
#     reaproveitado depois de um merge), a base é esse ponto: o que já está no master não pede preview.
#   - Produção sem essa base (primeiro deploy ou SHA fora do clone): builda sempre, para nunca deixar o
#     backend do Convex (deployado pelo build do web) para trás.
#   - Preview sem essa base (primeiro push do branch, force push): compara com o merge-base com o
#     master (busca raso do master); se não der para descobrir, builda. Para forçar um preview:
#     Redeploy sem "Use project's Ignore Build Step".
#
# Simular localmente (dentro de apps/<app>, com o commit desejado em HEAD):
#   VERCEL_ENV=preview VERCEL_GIT_PREVIOUS_SHA=<sha> bash ../../scripts/vercel-ignore-build.sh; echo $?
set -uo pipefail

TURBO_VERSION=2.9.11 # mesma versão do pnpm-lock.yaml

pkg="${1:-}"
if [ -z "$pkg" ]; then
  pkg="$(node -p "require('./package.json').name" 2>/dev/null)" || pkg=""
fi
if [ -z "$pkg" ]; then
  echo "vercel-ignore-build: nome do pacote não encontrado em ./package.json; buildando."
  exit 1
fi

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
env="${VERCEL_ENV:-preview}"

# Ponto em que o branch saiu do master (só para preview; busca raso do master). Vazio se não der.
master_base() {
  git fetch --quiet --no-tags --depth=50 origin master 2>/dev/null \
    && git merge-base HEAD FETCH_HEAD 2>/dev/null
}

if [ -n "$prev" ] && git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  prev="$(git rev-parse "${prev}^{commit}")"
  base="$prev"
  # Branch reaproveitado depois do merge (comum em sessões de agente): o último deployment dele é
  # anterior a merges que já estão no master. O que já está no master não pede preview, então a
  # base passa a ser o ponto em que o branch saiu do master, quando ele vem depois do deployment.
  if [ "$env" != "production" ] && mb="$(master_base)" && [ -n "$mb" ] && [ "$mb" != "$prev" ] \
    && git merge-base --is-ancestor "$prev" "$mb" 2>/dev/null; then
    base="$mb"
    echo "vercel-ignore-build: $pkg ($env) comparado com o master ($base), mais novo que o último deployment ($prev)."
  else
    echo "vercel-ignore-build: $pkg ($env) comparado com o último deployment ($base)."
  fi
elif [ "$env" = "production" ]; then
  echo "vercel-ignore-build: produção sem último deployment alcançável (${prev:-nenhum}); buildando."
  exit 1
elif mb="$(master_base)" && [ -n "$mb" ]; then
  # Primeiro push do branch (ou force push): compara com o ponto em que ele saiu do master, para
  # cobrir todos os commits do push, não só o último.
  base="$mb"
  echo "vercel-ignore-build: $pkg ($env) sem último deployment alcançável (${prev:-nenhum}); comparado com o master ($base)."
else
  echo "vercel-ignore-build: $pkg ($env) sem base confiável para comparar; buildando."
  exit 1
fi

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1

out="$(npx -y "turbo@${TURBO_VERSION}" --skip-infer --no-update-notifier \
  query affected --packages "$pkg" --base "$base" --exit-code 2>&1)"
code=$?
echo "$out"

case "$code" in
  0) echo "vercel-ignore-build: $pkg não foi afetado; pulando o build."; exit 0 ;;
  1) echo "vercel-ignore-build: $pkg foi afetado; buildando."; exit 1 ;;
  *) echo "vercel-ignore-build: turbo saiu com $code; buildando por segurança."; exit 1 ;;
esac
