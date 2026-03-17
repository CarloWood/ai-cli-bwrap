# codex-bwrap

This is a personal project, not necessarily intended to be used by others.

Starts the Opencode CLI or OpenAI Codex CLI inside a bubblewrap container with full permissions,
but limited severely by normal Linux access controls (network namespace `nscodex`
limiting all internet access to [white-listed domains](netns/nft-nscodex.rules), using `bwrap` to only give
read-access to what is required (e.g. not the users HOME directory, or `/etc`),
and only give write access to required directories (workspace, gitache).

Replace `codex` and `opencode` with the bash functions defined in [`env.codex`](env.codex),
and have that load the main script [`codex.run`](codex.run).

Usage:

```
codex|opencode [planner|coder|bash <command>|shell|resume <session-id>]
```

Without a command line parameter the CLI is started as `coder` and opens the
last used Session ID for that mode.

* bash <command> : run <command> in a bash shell inside the codex container.
* shell : start an interactive shell inside the opencode/codex container.
* resume <session-id> : resume a previous Session ID.
* coder/planner : enter, or continue last coder/planner mode.

The coder/planner modes also start [sockettapd](https://github.com/CarloWood/codex-sockettapd)
listening on `$PROJECTDIR/AAP/$CODEX_MODE.sock`, where `CODEX_MODE` is respectively `planner` or `coder`.
For that to work you need the `cw_exec_socket_tap` branch that is part of the `master` branch
of my [codex fork](https://github.com/CarloWood/openai-codex), or the [`session_id.js`](opencode-config/plugin/session_id.js)
plugin for opencode.

The project also requires [remountd](https://github.com/CarloWood/remountd), a systemd service,
to be installed and enabled. This allows for switching between a read-only and read-write
mounted workspace directory (not relying on good behavior by the A.I.).

The [`codex.run`](codex.run) script uses a lot of environment variables that are part
of my normal build system (all values are relative to the host system).

In order to control the environment, you are recommended to use [cdeh](https://carlowood.github.io/howto/cdeh.html).

For example, while working on the openai-codex project itself,
the following environment variables (not an exhaustive list) are set:
```
PROJECTDIR=/home/carlo/projects/github/codex
REPOBASE=openai-codex.git

# run 'project_environment' here

BUILDDIR=/home/carlo/projects/github/codex/openai-codex.git/codex-rs/target/debug
CODEX_DIRECTORY=codex-rs
CODEX_EXTRA_WRITABLE_ROOTS=([0]="/opt/ext4/nvme2/codex/.cargo" [1]="/opt/ext4/nvme2/codex/.rustup")

# Already set prior.
CCACHE_DIR=/opt/ccache
GITACHE_ROOT=/opt/gitache

# Set by 'project_environment'
CODEX_HOME=/home/carlo/.codex
CODEX_REPOBASE=openai-codex.git
CODEX_WORKSPACE=/home/carlo/projects/github/codex
HOME_CODEX=/opt/ext4/nvme2/codex
REPOROOT=/home/carlo/projects/github/codex/openai-codex.git
PLANROOT=/home/carlo/projects/github/codex/AAP
```

# cdeh environment

I can't list every environment file I typically use, but here are the two files
that I directly sourced when working on the codex project, in order to
help you if you want to make a chance to understand what is going on:


For the `~/projects/github/codex` project, the environment files are: (pe = print environment):
```
daniel:~/projects/github/codex>pe
/home/carlo/projects/github/codex/env.source
/home/carlo/projects/env.source
```

First `/home/carlo/projects/env.source` is loaded, note how that loads `env.codex` that is part of this project.
Then [`/home/carlo/projects/github/codex/env.source`](env.source) is loaded that is also part of this project.

At the moment of writing the contents of my general "all projects" environment (`/home/carlo/projects/env.source`) is:
```
# Git identity.
GIT_AUTHOR_EMAIL=carlo@alinoe.com
GIT_AUTHOR_NAME='Carlo Wood'
GIT_COMMITTER_EMAIL=carlo@alinoe.com
GIT_COMMITTER_NAME='Carlo Wood'

export GIT_AUTHOR_EMAIL GIT_AUTHOR_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_NAME

#export NVIM_LISTEN_ADDRESS="/tmp/nvim_listen_address"

export GCC_COLORS="error=31:warning=37:note=01;34:range1=32:range2=34:locus=01:quote=01:fixit-insert=32:fixit-delete=09;33:diff-filename=01:diff-hunk=32:diff-delete=33:diff-insert=32"
export CCACHE_DIR="/opt/ccache"

export GITACHE_ROOT="/opt/gitache"

# Load Codex environment.
[ -f "$HOME/projects/github/codex/env.codex" ] && source "$HOME/projects/github/codex/env.codex"

function project_environment {
  if [[ -z "$PROJECTDIR" ]]; then
    echo -e "project_environment: \e[31mERROR\e[0m: PROJECTDIR is not set."
    return 1
  fi

  # This is used by sockettapd.
  export PROJECTDIR

  [[ "$CODEX_INSIDE_ENVIRONMENT" -eq 1 ]] || export TOPPROJECT="$PROJECTDIR"
  [ -n "$CODEX_WORKSPACE" ] || export CODEX_WORKSPACE="$TOPPROJECT"
  export CODEX_REPOBASE="$REPOBASE"
  # The (fixed) cwd that codex works in (relative to $CODEX_REPOBASE).
  export CODEX_DIRECTORY=

  # To satisfy the sanity check at the top of `codex.run`.
  export REPOROOT="$CODEX_WORKSPACE/$CODEX_REPOBASE"
  # The repository for the planner.
  export PLANROOT="$CODEX_WORKSPACE/AAP"

  source $TOPPROJECT/env.compiler

  export BUILDDIR=$TOPPROJECT/build
  if [[ -r "$TOPPROJECT/libcwdrc_$REPOBASE" ]]; then
    export LIBCWD_RCFILE_OVERRIDE_NAME="$TOPPROJECT/libcwdrc_$REPOBASE"
  fi

  CPPFLAGS=
  LDFLAGS=
  if [[ "${CXX}" == *"clang"* ]]; then
    CFLAGS="-ferror-limit=2"
    CXXFLAGS="-ferror-limit=2"
  else
    CFLAGS="-fmax-errors=2"
    CXXFLAGS="-fmax-errors=2"
  fi

  export CPPFLAGS LDFLAGS CFLAGS CXXFLAGS

  # Set a proper tags file.
  CTAGS_FILE="$BUILDDIR/tags"
  export CTAGS_FILE

  if [ -n "$CODEX_INSIDE_ENVIRONMENT" ]; then
    # Give codex its own build directory.
    BUILDDIR="$CODEX_WORKSPACE/codex-build"
    if [[ $CODEX_MODE == "coder" || $CODEX_MODE == "planner" ]]; then
      # Only use a different committer name if it is really Codex that does the commit.
      export GIT_COMMITTER_NAME='Daniel Codex'
      export GIT_AUTHOR_NAME='Daniel Codex'
    fi
    # Set CTAGS_FILE to a writable location.
    if [[ $CODEX_MODE == "planner" ]]; then
      CTAGS_FILE="$CODEX_WORKSPACE/AAP/planner/tags"
    fi

    # Make compilation less verbose.
    change_config "-DCMAKE_VERBOSE_MAKEFILE=OFF"
    change_config "-DCMAKE_MESSAGE_LOG_LEVEL=INFO"
  fi

  export CMAKE_CONFIGURE_OPTIONS_STR=$(printf "%s|" "${CMAKE_CONFIGURE_OPTIONS[@]}")
  export CMAKE_CONFIG
  export AUTOGEN_CMAKE_ONLY=1
  export LIBCWD_NO_STARTUP_MSGS=1
}

# Setup Agent Assisted Planner (AAP) project.
setup_aap ()
{
  local aap_dir="$PROJECTDIR/AAP"
  local name="$(basename "$REPOROOT")"
  # Remove .git extension, if any.
  name="${name%.git}"

  local changed=0
  local created_repo=0

  mkdir -p "$aap_dir" || exit 1
  pushd "$aap_dir"

  if [[ ! -d .git ]]; then
    git init || exit 1
    created_repo=1
    changed=1
  fi

  # Ensure we are on a sensible branch.
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    if ! git rev-parse --verify refs/heads/master >/dev/null 2>&1; then
      git checkout -b master || exit 1
    else
      git checkout master || exit 1
    fi
  fi

  # Ensure remote "github" exists (assume repo name is "<NAME>-AAP" under CarloWood).
  if ! git remote get-url github >/dev/null 2>&1; then
    git remote add github "${GITHUB_URL_PREFIX}${name}-AAP.git" || exit 1
    changed=1
  fi

  # Ensure submodule "agents-common" exists and is registered.
  if [[ -d agents-common ]]; then
    # If it exists but isn't registered as a submodule yet, add/register it.
    if [[ ! -f .gitmodules ]] || ! git config -f .gitmodules --get submodule.agents-common.url >/dev/null 2>&1; then
      rm -rf agents-common || exit 1
      git submodule add "https://github.com/CarloWood/agents-common.git" agents-common || exit 1
      changed=1
    fi
  else
    if [[ -f .gitmodules ]] && git config -f .gitmodules --get submodule.agents-common.url >/dev/null 2>&1; then
      git submodule update --init --recursive agents-common || exit 1
    else
      git submodule add "https://github.com/CarloWood/agents-common.git" agents-common || exit 1
      changed=1
    fi
  fi

  # Make sure submodule content is present.
  git submodule update --init --recursive agents-common || exit 1

  # Fix remote of agents-common submodule.
  if [[ $changed -ne 0 ]]; then
    pushd agents-common
    if ! git remote get-url github >/dev/null 2>&1; then
      git remote rename origin github
      git remote set-url github "${GITHUB_URL_PREFIX}agents-common.git" "https://github.com/CarloWood/agents-common.git" || exit 1
    fi
    popd
  fi

  # Create required directories (and make them trackable).
  local d
  for d in planner coder ThreadID; do
    if [[ ! -d "$d" ]]; then
      mkdir -p "$d" || exit 1
      changed=1
    fi
    if [[ ! -e "$d/.gitkeep" ]]; then
      : > "$d/.gitkeep" || exit 1
      changed=1
    fi
  done

  # Ensure AGENTS.md symlink.
  local agents_target="agents-common/planner/AGENTS.md"
  if [[ -L AGENTS.md ]]; then
    if [[ "$(readlink AGENTS.md)" != "$agents_target" ]]; then
      ln -sf "$agents_target" AGENTS.md || exit 1
      changed=1
    fi
  elif [[ -e AGENTS.md ]]; then
    rm -f AGENTS.md || exit 1
    ln -s "$agents_target" AGENTS.md || exit 1
    changed=1
  else
    ln -s "$agents_target" AGENTS.md || exit 1
    changed=1
  fi

  # Ensure .gitignore.
  if [[ ! -e .gitignore ]]; then
    cp -f "agents-common/AAP-gitignore" .gitignore || exit 1
    changed=1
  fi

  # Ensure README.md.
  if [[ ! -e README.md ]]; then
    {
      printf '# %s-AAP\n' "$name"
      printf 'Agents Assisted Plan for https://github.com/CarloWood/%s/\n' "$name"
    } > README.md || exit 1
    changed=1
  fi

  # Stage/commit/push if we created/changed anything.
  if [[ $changed -ne 0 ]]; then
    git add -A || exit 1

    # Only commit if there is something staged (or repo was created).
    if [[ $created_repo -ne 0 ]] || ! git diff --cached --quiet; then
      git commit -m "Setup Agent Assisted Planner (AAP) project." || exit 1
    fi

    local branch
    branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
    if [[ -z "$branch" ]]; then
      branch="master"
    fi

    echo "Pushing to $(git remote get-url github)..."
    git push -u github "$branch" || exit 1
  fi

  popd
}

# Only load Copilot for these extensions.
#export COPILOT_EXTENSIONS="c h cpp cxx hpp hxx"

alias iaca='$HOME/projects/aicxx/ai-utils-testsuite/iaca/iaca-lin64/iaca'
alias cdr='cd $REPOROOT'
alias cdb='cd $BUILDDIR'
alias pb='pushd $BUILDDIR'

function ffs()
{
  RE="$*"
  if [[ $RE =~ [A-Za-z0-9_]$ ]]; then
    RE+="\([^A-Za-z0-9_]\|$\)"
  fi
  if [[ $RE =~ ^[A-Za-z0-9_] ]]; then
    RE="\(^\|[^A-Za-z0-9_]\)$RE"
  fi
  find $REPOROOT -type f -exec grep -Hn "$RE" {} \;
}

function ffsx()
{
  find . -type f -exec grep -Hn "$*" {} \;
}

# This makes use of the alias s that should be defined by each project.
function gs()
{
  RE="$*"
  if [[ $RE =~ [A-Za-z0-9_]$ ]]; then
    RE+="\([^A-Za-z0-9_]\|$\)"
  fi
  if [[ $RE =~ ^[A-Za-z0-9_] ]]; then
    RE="\(^\|[^A-Za-z0-9_]\)$RE"
  fi
  grep -Hn "$RE" `s` | sed -e 's%'"$PWD/"'%%;s%'"$REPOROOT"'/%%'
}

function gsx()
{
  grep -Hn "$*" `s` | sed -e 's%'"$PWD/"'%%;s%'"$REPOROOT"'/%%'
}

# Idem for the c alias.
function gc()
{
  grep -Hn "$*" `c` | sed -e 's%'"$PWD/"'%%;s%'"$REPOROOT"'/%%'
}

function gf()
{
  RE="$*"
  if [[ $RE =~ [A-Za-z0-9_]$ ]]; then
    RE+="\([^A-Za-z0-9_]\|$\)"
  fi
  if [[ $RE =~ ^[A-Za-z0-9_] ]]; then
    RE="\(^\|[^A-Za-z0-9_]\)$RE"
  fi
  grep -Hn "$RE" `f` | sed -e 's%'"$PWD/"'%%;s%'"$REPOROOT"'/%%'
}

function gfx()
{
  grep -Hn "$*" `f` | sed -e 's%'"$PWD/"'%%;s%'"$REPOROOT"'/%%'
}

function pg()
{
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  REMOTE="$(git config branch.$BRANCH.remote)"
  if test -n "$GITHUB_REMOTE_NAME" -a x"$REMOTE" != x"$GITHUB_REMOTE_NAME"; then
    echo "  Renaming remote from $REMOTE to $GITHUB_REMOTE_NAME!"
    git remote rename $REMOTE $GITHUB_REMOTE_NAME
    REMOTE=$GITHUB_REMOTE_NAME
  fi
  if test -n "$GITHUB_URL_PREFIX"; then
    URL=$(git config remote.$REMOTE.url)
    PART=$(echo "$URL" | grep -o '[^/:]*$')
    NEWURL="$GITHUB_URL_PREFIX$PART"
    if test "$URL" != "$NEWURL"; then
      echo "  Changing url of remote to $NEWURL!"
      git remote set-url $REMOTE "$NEWURL"
    fi
  fi
  git push -u $GITHUB_REMOTE_NAME
}

# Default remote and url prefix.
export GITHUB_REMOTE_NAME='github'
export GITHUB_URL_PREFIX='github-carlo:CarloWood/'

# Doxygen output directory.
export OUTPUT_DIRECTORY=/home/carlo/www

# External source trees that need to be scanned with ctag.
export CTAGS_ROOT_SRCDIRS=""

# Add or change a config in CMAKE_CONFIGURE_OPTIONS.
change_config() {
  local new_option="$1"
  local prefix="${new_option%%=*}="

  # Find and replace the option.
  for i in "${!CMAKE_CONFIGURE_OPTIONS[@]}"; do
    if [[ "${CMAKE_CONFIGURE_OPTIONS[i]}" == "${prefix}"* ]]; then
      CMAKE_CONFIGURE_OPTIONS[i]="$new_option"
      return 0
    fi
  done

  # If we get here, the option wasn't found - add it.
  CMAKE_CONFIGURE_OPTIONS+=("$new_option")
}

function abbreviate_path () {
  local p=$1
  # Prefer paths relative to PWD if applicable.
  if [[ -n $PWD && $p == "$PWD"/* ]]; then
    printf '%s\n' "${p#$PWD/}"
  # Otherwise, prefer paths relative to REPOROOT if applicable.
  elif [[ -n $REPOROOT && $p == "$REPOROOT"/* ]]; then
    printf '%s\n' "\$REPOROOT/${p#$REPOROOT/}"
  # Otherwise, prefer paths relative to BUILDDIR if applicable.
  elif [[ -n $BUILDDIR && $p == "$BUILDDIR"/* ]]; then
    printf '%s\n' "\$BUILDDIR/${p#$BUILDDIR/}"
  # Otherwise, prefer paths relative to CODEX_WORKSPACE if applicable.
  elif [[ -n $CODEX_WORKSPACE && $p == "$CODEX_WORKSPACE"/* ]]; then
    printf '%s\n' "\$CODEX_WORKSPACE/${p#$CODEX_WORKSPACE/}"
  # Otherwise, prefer paths relative to HOME if applicable.
  elif [[ -n $HOME && $p == "$HOME"/* ]]; then
    printf '%s\n' "~/${p#$HOME/}"
  # Otherwise, if realpath is available, make it relative to $PWD.
  elif command -v realpath >/dev/null 2>&1; then
    realpath --relative-to="$PWD" "$p"
  # Fallback: return the original path.
  else
    printf '%s\n' "$p"
  fi
}

# Used by AGENTS_instructions
export -f abbreviate_path

findname() {
  local query=$1

  # Local temporary arrays.
  local -a files=()
  local -a strings=()

  local line file rest
  while IFS= read -r line; do
    [[ -z $line ]] && continue

    file=${line%%|*}   # Everything before the first '|'.
    rest=${line#*|}    # Everything after the first '|'.

    files+=( "$file" )
    strings+=( "$rest" )
  done < <(
    readtags -t "$CTAGS_FILE" -E "$query" \
      | sed -r 's%^[^\t]*\t(.*)\t/\^((\\/|\$[^/]|[^/$])*)(\$/|/).*%\1|\2%;s%\\([\\/;])%\1%g'
  )

  local i pattern gl ln text found file

  for i in "${!files[@]}"; do
    pattern=${strings[i]}
    file=$(abbreviate_path "${files[i]}")
    found=

    # grep -nF gives "LINE:TEXT". We split that ourselves.
    while IFS= read -r gl; do
      ln=${gl%%:*}     # Line number (everything up to first ':').
      text=${gl#*:}    # Text after first ':'.

      if [[ $text == "$pattern"* ]]; then
        files[i]="$file:$ln"
        found=1
        break
      fi

    done < <(grep -nFh -- "$pattern" -- "${files[i]}" 2>/dev/null || true)

    if [[ -z $found ]]; then
      printf 'findsymbol: pattern not found at start of any line in %s: %s\n' "$file" "$pattern" >&2
      return 1
    fi
  done

  # At this point, files[] holds "path:line" for each match,
  # and strings[] holds the corresponding tag strings.
  # They are local to this function as requested.

  if ((${#files[@]} == 0)); then
    echo "There is no global declaration '$1' in any of the source files scanned by ctags."
  elif ((${#files[@]} == 1)); then
    echo "There is one global declaration '$1' in: $files[0]"
  else
    echo -n "There are ${#files[@]} declarations of '$1': "
    local prefix=""
    for i in "${!files[@]}"; do
      echo -n "$prefix${files[i]}"
      prefix=", ";
    done
    echo -e "\n"
  fi
}

findsymbol() {
  local name=
  local kinds=".*" subpath=""
  local grep_opts=""
  local extras=()
  local equals="≕"
  local scope_prefix=

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --kinds=*)
        # Map human-friendly kind names to ctags single-letter kinds.
        local raw=${1#*=}
        IFS=',' read -ra _k <<<"$raw"
        local mapped=()
        for k in "${_k[@]}"; do
          case "$k" in
            c|class) k="c";;
            s|struct) k="s";;
            u|union) k="u";;
            f|func|function|method) k="f";;
            m|member|field) k="m";;
            v|var|variable) k="v";;
            t|typedef|using|alias) k="t";;
            g|Enum) k="g";;
            e|enum) k="e";;
            n|namespace|ns) k="n";;
            d|macro|define) k="d";;
          esac
          mapped+=( "$k" )
        done
        kinds=$(IFS='|'; echo "${mapped[*]}")
        ;;
      --subpath=*) subpath="${1#*=}";;
      --prefix) grep_opts="-p";;     # prefix match
      --equals=*) equals="${1#*=}";;
      --scope=*) scope_prefix="${1#*=}";;
      --help) name=;;
      --) shift; extras+=("$@"); break;;
      *)
        if [[ -z $name ]]; then
          name="$1"
        else
          extras+=("$1")
        fi
        ;;
    esac; shift
  done

  if [[ -z $name ]]; then
    echo "usage: findsymbol <symbol> [--kinds=<kinds-list>] [--scope=<scope>] [--subpath=<sub-path>] [--prefix] [--help]" >&2
    echo "       --kinds : a comma separated list of kinds: c|class, s|struct, u|union, f|func|method, m|member|field, v|var|variable, t|typedef|using, g|Enum, e|enum, n|namespace, d|macro|define" >&2
    echo "       --subpath : filters on a contiguous subsequence of pathname components in the output location." >&2
    echo "       --scope : filters on scopes that begin with given substring." >&2
    echo "       --prefix : also match symbols that begin with <symbol>." >&2
    return 1
  fi
  if [[ ${#extras[@]} -gt 0 ]]; then
    echo "findsymbol: ignoring extra args: ${extras[*]}" >&2
  fi

  # Prevent readtags from misinterpreting a name that starts with '-'.
  [[ $name == -* ]] && name="\\$name"

  while IFS=$'\t' read -r tag file ex_cmd rest; do
    # Path filter (supports prefix match on directories).
    if [[ -n $subpath && $file != *"/$subpath/"* && $file != *"/$subpath" ]]; then
      continue
    fi

    local kind="" scope="" line=""
    IFS=$'\t' read -ra fields <<<"${rest}"
    for field in "${fields[@]}"; do
      local key=${field%%:*}
      local val=${field#*:}
      case "$key" in
        kind)   kind=$val ;;
        line)   line=$val ;;
        class|namespace|struct) scope=$val ;;
      esac
    done

    [[ -z $kind ]] && kind="?"
    [[ $kind =~ $kinds ]] || continue
    [[ $scope = "$scope_prefix"* ]] || continue

    # Derive a human-readable pattern from the ex command.
    local pattern=${ex_cmd}
    pattern=${pattern#/\^}          # strip leading /^ if present
    pattern=${pattern#^}            # or bare ^
    pattern=${pattern%$/;\"*}       # drop trailing $/;"
    pattern=${pattern%/;\"*}        # or just /;"
    pattern=${pattern%$/;*}         # fallback: $/;
    pattern=${pattern%/;*}          # fallback: /;
    pattern=${pattern%\"*}          # remove any residual quotes
    pattern=${pattern//\\\//\/}     # unescape /
    pattern=${pattern//\\\\/\\}     # reduce \\ to \
    pattern=${pattern//\\\"/\"}     # unescape "
    if (( ${#pattern} > 120 )); then
      pattern="${pattern:0:117}..."
    fi

    # Compute line number if not provided in the tag fields.
    if [[ -z $line || $line == "?" ]]; then
      line=$(grep -nF -m1 -- "$pattern" "$file" 2>/dev/null | head -n1 | cut -d: -f1)
      [[ -z $line ]] && line="?"
    fi

    # Shorten path; if we are already inside $REPOROOT/PWD, prefer relative.
    local disp_file
    disp_file=$(abbreviate_path "$file")

    printf "%s\tkind%s%s\tscope%s%s\tlocation%s%s:%s\tcode%s\"%s\"\n" \
           "$tag" "$equals" "$kind" "$equals" "$scope" "$equals" "$disp_file" "$line" "$equals" "$pattern"
  done < <(readtags -t "$CTAGS_FILE" $grep_opts -e "$name")
}

function set_compiler_env()
{
  if test -z "$CXX"; then
    echo "set_compiler_env: CXX is not set."
    return
  fi

  # Helper variable.
  GCCVER=`$CXX -v 2>&1 | grep -E '^(clang|gcc)[ -][Vv]ersion' | sed -re 's/(clang|gcc)[ -][Vv]ersion //;s/ \(.*//;s/ $//;s/ /-/g'`

  # The install prefix.
  INSTALL_PREFIX="/usr/local/install/$GCCVER"

  if test "$REPOROOT" = "/home/carlo/projects/libcwd/libcwd" -a "$TOPPROJECT" = "/opt/secondlife/viewers"; then
    if test "$(pwd)" = "$REPOROOT-objdir32"; then
      INSTALL_PREFIX="/sl/i386-linux-gnu/usr"
      CXXFLAGS=-m32
    else
      INSTALL_PREFIX="/sl/x86_64-linux-gnu/usr"
      CXXFLAGS=
    fi

    CPPFLAGS=
    LDFLAGS=
    CFLAGS=

    export CPPFLAGS LDFLAGS CFLAGS CXXFLAGS
  fi

  # Set the correct paths.
  pre_path "$INSTALL_PREFIX/lib/pkgconfig" PKG_CONFIG_PATH
  pre_path "$INSTALL_PREFIX/bin" PATH
  pre_path "$INSTALL_PREFIX/lib" LD_LIBRARY_PATH
  pre_path "$INSTALL_PREFIX" CMAKE_PREFIX_PATH

  export PKG_CONFIG_PATH PATH LD_LIBRARY_PATH INSTALL_PREFIX CMAKE_PREFIX_PATH

  # Expand $INSTALL_PREFIX in CONFIGURE_OPTIONS.
  CONFIGURE_OPTIONS=$(eval echo "$CONFIGURE_OPTIONS")
}

function configure ()
{
  if test -z "$REPOROOT"; then
    echo "REPOROOT not set."
    return 1
  elif test -z "$BUILDDIR"; then
    echo "BUILDDIR not set."
    return 1
  elif test ! -e "$BUILDDIR"; then
    mkdir "$BUILDDIR"
  fi
  set_compiler_env
  if [[ -n "$CMAKE_CONFIGURE_OPTIONS" ]]; then
    if [[ -n "$GITACHE_ROOT" ]]; then
      unset LD_LIBRARY_PATH
    fi
    rm -f "$BUILDDIR/CMakeCache.txt"
    cmake -S "$REPOROOT" -B "$BUILDDIR" -DCMAKE_MESSAGE_LOG_LEVEL=STATUS -DCMAKE_BUILD_TYPE="$CMAKE_CONFIG" \
        "${CMAKE_CONFIGURE_OPTIONS[@]}" && echo "Configured with: -DCMAKE_BUILD_TYPE=$CMAKE_CONFIG ${CMAKE_CONFIGURE_OPTIONS[*]}."
  elif [[ -n "$MESON_CONFIGURE_OPTIONS" ]]; then
    ARGS="--backend ninja --buildtype=$MESON_CONFIG --clearcache"
    if [[ -e "$BUILDDIR/build.ninja" ]]; then
      ARGS+=" --reconfigure"
    fi
    if [[ -n "$INSTALL_PREFIX" ]]; then
      ARGS+=" --prefix=$INSTALL_PREFIX"
    fi
    echo "Running: meson setup $ARGS \"${MESON_CONFIGURE_OPTIONS[@]}\" \"$BUILDDIR\" \"$REPOROOT\""
    meson setup $ARGS "${MESON_CONFIGURE_OPTIONS[@]}" "$BUILDDIR" "$REPOROOT"
  else
    echo -n "pushd: "
    pushd "$BUILDDIR"
    $REPOROOT/configure $CONFIGURE_OPTIONS && echo "Configured with $CONFIGURE_OPTIONS."
    echo -n "popd: "
    popd
  fi
}

function create_ctags_file ()
{
  if [[ -z $BUILDDIR ]]; then
    echo "BUILDDIR not set."
    return 1
  fi
  if [[ ! -d $BUILDDIR ]]; then
    mkdir -p "$BUILDDIR"
  fi
  if [[ -z $CTAGS_FILE ]]; then
    echo "Warning: CTAGS_FILE not set, using \$BUILDDIR/ctags."
    export CTAGS_FILE="$BUILDDIR/ctags"
  fi
  ctags -o "$CTAGS_FILE" --language-force=C++ `s`
  if [[ $1 != no_gentags && -z $CODEX_INSIDE_ENVIRONMENT ]]; then
    gentags "$CTAGS_FILE" | sort -u > $BUILDDIR/tags.vim
  fi
}

function make ()
{
  CURDIR=$(pwd)
  CPUS=`grep '^processor' /proc/cpuinfo | wc --lines`
  RET=0
  not_done=1
  while [ $not_done -eq 1 ]; do
    not_done=0
    case $1 in
    -j)
      shift;
      CPUS=$1
      shift;
      not_done=1
      ;;
    maintainer-clean)
      /usr/bin/make -C $BUILDDIR maintainer-clean
      if [ -z "$CMAKE_CONFIGURE_OPTIONS" ]; then
        cd $REPOROOT && ./autogen.sh
      fi
      ;;
    ctags|tags)
      create_ctags_file
      ;;
    *)
      if [ -n "$CMAKE_CONFIGURE_OPTIONS" ]; then
        if [[ $CMAKE_CONFIGURE_OPTIONS == *"-GNinja"* ]]; then
          # Ninja suitable filtering:
          /usr/local/bin/ninja-filter cmake --build "$BUILDDIR" --config "$CMAKE_CONFIG" --parallel $CPUS -- $@ 2> >(awk 'BEGIN { have_match = 0 } /operator<</ { if (have_match == 2) { have_match = 1; next }} /^\/usr\/.*(no known conversion from|candidate template ignored: |template argument deduction\/substitution failed:)/ { have_match = 2; keep = $0; next } { if (have_match == 2) { print keep; have_match = 0 } if (have_match == 0) print; else { have_match = 0 }}' | sed -e 's%'"$REPOROOT"'/%%;s/symbolic:://g' >&2 )
        else
          cmake --build "$BUILDDIR" --config "$CMAKE_CONFIG" --parallel $CPUS -- $@
        fi
      elif [[ -n "$MESON_CONFIGURE_OPTIONS" ]]; then
        if [[ $1 == install || $1 == uninstall ]]; then
          ninja -C "$BUILDDIR" && sudo ninja -C "$BUILDDIR" $1
        else
          /usr/local/bin/ninja-filter ninja --verbose -C "$BUILDDIR" -j $CPUS -- $@
        fi
      else
        /usr/bin/make -C $BUILDDIR -j $CPUS $@ | \
            sed -e 's/ >/>/g;
                    s/std::__cxx11::basic_string<char>/std::string/g;
                    s/__gnu_cxx::__normal_iterator<const char\*, std::string>/std::string::const_iterator/g'
      fi
      RET=$?
      ;;
    esac
  done
  cd $CURDIR
  return $RET
}
```
