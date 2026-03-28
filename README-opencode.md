# Starting opencode

Opencode is started by running the bash function `opencode` defined in [env.codex](env.codex#L43).

That function simply calls the bash function `codex`, also defined in [env.codex](env.codex#L9),
passing `--opencode` as first argument. The effect of that is that inside the `codex` bash function
the variable `run_opencode` is set to `1`, which in turn causes an `CODEX_RUN_OPENCODE=1` before
sourcing [codex.run](codex.run).

In other words, running `opencode [<args>]` is equivalent to running either `codex --opencode [<args>]`
as well as running `CODEX_RUN_OPENCODE=1 codex <args>`.

# Environment variables

The following environment variables are used by the script [codex.run](codex.run):

## Defined on the host (before running `codex.run`)

* `PROJECTDIR` : the topmost directory associated with the current project. This directory is common to all other paths related to a project, like for example the repository directory and the build directory.
* `REPOBASE` : the path to the project repository relative to `$PROJECTDIR` (see `REPOROOT`).
* `REPOROOT` : equal to `$PROJECTDIR/$REPOBASE`; the repository root of the current project.
* `CODEX_WORKSPACE` : equal to `$PROJECTDIR`; the host directory to bind-mount at `/opt/ext4/nvme2/codex/workspace`.
* `CODEX_REPOBASE` : equal to `$REPOBASE`.
* `CCACHE_DIR` : this path is mounted as tmpfs in the container so that if `CCACHE_DIR` is set to the same value inside the container then it can be used.
* `HOME_CODEX` : equal to `/opt/ext4/nvme2/codex`, the HOME directory inside the container.
* `CDEH_TMP` : defined by [cdeh](https://carlowood.github.io/howto/cdeh.html). `$CDEH_TMP/env.base` is expected to contain the environment associated with the `/` (thus free of any project specific definitions) and will be copied to `$HOME_CODEX/cdeh/env.base` so that `cdeh` also works inside the container resulting in the same environment as on the host.
* `GITACHE_ROOT` : will be bind-mounted read-write inside the container, sharing the [gitache](https://github.com/CarloWood/gitache) root with the host.
* `CODEX_EXTRA_WRITABLE_ROOTS` : a bash array with additional paths - not used by opencode.
* `CODEX_RUN_OPENCODE` : defined to `1` (set by the `codex` bash function, see above).

## Defined in the container (visible by `opencode`)

The following environment variables are changed and exported (if not already) by the `codex.run` script:

* `HOME` : set to `HOME_CODEX` (`/opt/ext4/nvme2/codex`, see above).
* `CODEX_REPOBASE` : unchanged: equal to `$REPOBASE`.
* `CODEX_MODE` : one of `"shell"`, `"bash"`, `"analyst"`, `"planner"` or `"coder"`.
* `CODEX_RUN_OPENCODE` : defined to `1` (set by the `codex` bash function, see above).

The following environment variables are set by `~/.bash_profile` inside the container:

* `CODEX_WORKSPACE` : set to `$HOME/workspace` and therefore equal to `/opt/ext4/nvme2/codex/workspace`, the directory that is the bind-mount location for the host directory `$PROJECTDIR`.
* `HOME_CODEX` : set to `$HOME` and therefore equal to `/opt/ext4/nvme2/codex` - the same value that it had on the host.
* `CDEH_ROOT` : set to `$HOME/cdeh`, aka `/opt/ext4/nvme2/codex/cdeh`, the containers own [cdeh](https://carlowood.github.io/howto/cdeh.html) root. This directory contains the `env.bashrc` and `do_prompt` files copied by [`codex.run`](codex.run). Also the host file `$CDEH_TMP/env.base` (see above) was copied there by `codex.run`. Finally it contains all `env.source` files that normally are printed by `pe` copied here as `env.host$nr`. All this is just needed to rebuild the environment inside the container (that is being documented here).
* `REPOROOT` : equal to `$CODEX_WORKSPACE/$CODEX_REPOBASE` (the repository root).
* `CODEX_INSIDE_ENVIRONMENT` : set to `1`.
* `TOPPROJECT`: set to `$CODEX_WORKSPACE`. Note that `env.compiler` is sourced from `$CODEX_WORKSPACE/env.compiler` these days; so not sure if changing `TOPPROJECT` makes sense here.
* `REPOROOT` : set to `$CODEX_WORKSPACE/$CODEX_REPOBASE`, and thus equal to the container directory that is the bind-mount location for the host `$REPOROOT`.
* `PATH` : set to `"$HOME/.local/bin:/usr/bin:/usr/bin/site_perl:/usr/bin/vendor_perl:/usr/bin/core_perl"`.
* `XDG_CACHE_HOME` : set to `"$CODEX_WORKSPACE/cache/xdg"`.
* `OPENCODE_DISABLE_CHANNEL_DB` : set to `1`.

Environment variables that are changed unless `$CODEX_MODE` is `"shell"`.

* `PROMPT_COMMAND` : unset - this is not an interactive environment so [cdeh](https://carlowood.github.io/howto/cdeh.html) is turned off.
* `HISTFILE` : set to `"$CDEH_HISTROOT$CODEX_WORKSPACE/history"`.
* `PS1` set to `"codex-\w>"`.

# Debugging the bash functions

In order to get file names and line numbers of commands that being executed by bash, run
```
export PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
```
before running the script.

If the output is too noisy, you can also write this to a file.
For example,
```
exec 9>trace.log
export BASH_XTRACEFD=9
export PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
codex --opencode planner
set +x
```

or temporarily add
```
PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
```
to the top of a script under test.
