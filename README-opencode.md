# Starting opencode

Opencode is started by running the bash function `opencode` defined in [env.codex](env.codex#L43).

That function simply calls the bash function `codex`, also defined in [env.codex](env.codex#L9),
passing `--opencode` as first argument. The effect of that is that inside the `codex` bash function
the variable `run_opencode` is set to `1`, which in turn causes an `CODEX_RUN_OPENCODE=1` before
sourcing [codex.run](codex.run).

In other words, running `opencode [<args>]` is equivalent to running either `codex --opencode [<args>]`
as well as running `CODEX_RUN_OPENCODE=1 codex <args>`.

# Environment variables used

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
* `CODEX_RUN_OPENCODE` : defined to `1` (see above).

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
